import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import * as lancedb from "@lancedb/lancedb";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const GITHUB_OWNER = process.env.GITHUB_OWNER || "";
const GITHUB_REPO = process.env.GITHUB_REPO || "";
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || "main";
const GITHUB_DOCS_PATH = process.env.GITHUB_DOCS_PATH || "docs";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";

const GITLAB_HOST = process.env.GITLAB_HOST || "https://gitlab.com";
const GITLAB_NAMESPACE = process.env.GITLAB_NAMESPACE || "";
const GITLAB_REPO = process.env.GITLAB_REPO || "";
const GITLAB_BRANCH = process.env.GITLAB_BRANCH || "main";
const GITLAB_DOCS_PATH = process.env.GITLAB_DOCS_PATH || "docs";
const GITLAB_TOKEN = process.env.GITLAB_TOKEN || "";

const DOCS_FOLDER = process.env.DOCS_FOLDER || "docs";
const LANCEDB_PATH = process.env.LANCEDB_PATH || "./lancedb";
const SYNC_INTERVAL_MS = parseInt(process.env.SYNC_INTERVAL_MINUTES || "60") * 60 * 1000;

const GITLAB_PROJECT_ID = encodeURIComponent(`${GITLAB_NAMESPACE}/${GITLAB_REPO}`);
const GITHUB_API_BASE = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_DOCS_PATH}`;
const GITHUB_RAW_BASE = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${GITHUB_DOCS_PATH}`;
const GITLAB_API_BASE = `${GITLAB_HOST}/api/v4/projects/${GITLAB_PROJECT_ID}/repository`;

// ---------------------------------------------------------------------------
// LanceDB schema
// ---------------------------------------------------------------------------

/**
 * Each row is one queryable documentation entry.
 *
 * Direct files  → one row per file  (filename === origin_file)
 * JSONL files   → one row per JSON line, all sharing the same origin_file
 *
 * origin_sha is the blob SHA returned by the Git hosting API.
 * It is used for incremental sync: if the SHA hasn't changed, skip re-fetch.
 * Empty string for local-filesystem entries (no remote SHA available).
 */
interface DocRecord {
  filename: string;
  content: string;
  source: string;       // "github" | "gitlab" | "local"
  origin_file: string;  // remote filename this was parsed from
  origin_sha: string;   // blob SHA for change detection
  synced_at: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let docsTable: lancedb.Table<any>;
let ftsReady = false;

function escapeSql(s: string): string {
  return s.replace(/'/g, "''");
}

async function initDB(): Promise<void> {
  const db = await lancedb.connect(LANCEDB_PATH);
  try {
    docsTable = await db.openTable("docs");
    console.error(`[LanceDB] Opened existing table (${await docsTable.countRows()} rows)`);
  } catch {
    const seed: DocRecord = { filename: "_init_", content: "", source: "", origin_file: "", origin_sha: "", synced_at: 0 };
    docsTable = await db.createTable("docs", [seed]);
    await docsTable.delete("filename = '_init_'");
    console.error(`[LanceDB] Created new table at ${LANCEDB_PATH}`);
  }
}

async function rebuildFtsIndex(): Promise<void> {
  try {
    await docsTable.createFtsIndex(["filename", "content"], { replace: true });
    ftsReady = true;
    console.error("[LanceDB] FTS index ready");
  } catch (e: any) {
    console.error(`[LanceDB] FTS index skipped: ${e.message}`);
  }
}

/**
 * Returns a map of  origin_file → origin_sha  for every distinct origin_file
 * currently in the table. Used to detect which remote files have changed.
 */
async function getStoredShas(): Promise<Map<string, string>> {
  const count = await docsTable.countRows();
  if (count === 0) return new Map();
  const rows = (await docsTable.query().select(["origin_file", "origin_sha"]).toArray()) as DocRecord[];
  const map = new Map<string, string>();
  for (const r of rows) {
    if (!map.has(r.origin_file)) map.set(r.origin_file, r.origin_sha);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Remote source helpers
// ---------------------------------------------------------------------------

interface RemoteFile {
  name: string;
  sha: string;
}

function githubHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    "User-Agent": "documentation-reader-mcp/3.0",
    Accept: "application/vnd.github.v3+json",
  };
  if (GITHUB_TOKEN) h["Authorization"] = `Bearer ${GITHUB_TOKEN}`;
  return h;
}

function gitlabHeaders(): Record<string, string> {
  const h: Record<string, string> = { "User-Agent": "documentation-reader-mcp/3.0" };
  if (GITLAB_TOKEN) h["PRIVATE-TOKEN"] = GITLAB_TOKEN;
  return h;
}

async function listGitHubFiles(): Promise<RemoteFile[] | null> {
  if (!GITHUB_OWNER || !GITHUB_REPO) return null;
  try {
    const res = await fetch(`${GITHUB_API_BASE}?ref=${GITHUB_BRANCH}`, { headers: githubHeaders() });
    if (!res.ok) { console.error(`[GitHub] list ${res.status} ${res.statusText}`); return null; }
    const data = (await res.json()) as Array<{ name: string; sha: string; type: string }>;
    return data.filter((e) => e.type === "file").map((e) => ({ name: e.name, sha: e.sha }));
  } catch (e: any) { console.error(`[GitHub] list error: ${e.message}`); return null; }
}

async function fetchGitHubFile(filename: string): Promise<string | null> {
  try {
    const res = await fetch(`${GITHUB_RAW_BASE}/${encodeURIComponent(filename)}`, {
      headers: { "User-Agent": "documentation-reader-mcp/3.0" },
    });
    if (!res.ok) { console.error(`[GitHub] fetch ${filename}: ${res.status}`); return null; }
    return await res.text();
  } catch (e: any) { console.error(`[GitHub] fetch error: ${e.message}`); return null; }
}

async function listGitLabFiles(): Promise<RemoteFile[] | null> {
  if (!GITLAB_NAMESPACE || !GITLAB_REPO) return null;
  try {
    const url = `${GITLAB_API_BASE}/tree?path=${encodeURIComponent(GITLAB_DOCS_PATH)}&ref=${GITLAB_BRANCH}`;
    const res = await fetch(url, { headers: gitlabHeaders() });
    if (!res.ok) { console.error(`[GitLab] list ${res.status} ${res.statusText}`); return null; }
    // GitLab uses "id" for blob SHA and "type" = "blob" for files
    const data = (await res.json()) as Array<{ name: string; id: string; type: string }>;
    return data.filter((e) => e.type === "blob").map((e) => ({ name: e.name, sha: e.id }));
  } catch (e: any) { console.error(`[GitLab] list error: ${e.message}`); return null; }
}

async function fetchGitLabFile(filename: string): Promise<string | null> {
  try {
    const filePath = encodeURIComponent(`${GITLAB_DOCS_PATH}/${filename}`);
    const url = `${GITLAB_API_BASE}/files/${filePath}/raw?ref=${GITLAB_BRANCH}`;
    const res = await fetch(url, { headers: gitlabHeaders() });
    if (!res.ok) { console.error(`[GitLab] fetch ${filename}: ${res.status}`); return null; }
    return await res.text();
  } catch (e: any) { console.error(`[GitLab] fetch error: ${e.message}`); return null; }
}

// ---------------------------------------------------------------------------
// JSONL parsing
//
// JSONL files in the repo let an extractor program push many library entries as
// a single commit. Each line becomes one queryable DocRecord in LanceDB.
//
// Required fields: filename (string), content (string)
// Optional field:  source_tag (string) — extra label shown in list_docs
//
// Example line:
//   {"filename":"react-hooks.md","content":"# React Hooks\n...","source_tag":"react"}
// ---------------------------------------------------------------------------

function parseJsonl(raw: string, originFile: string, originSha: string, source: string): DocRecord[] {
  const now = Date.now();
  const records: DocRecord[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const obj = JSON.parse(trimmed);
      if (typeof obj.filename !== "string" || typeof obj.content !== "string") {
        console.error(`[JSONL] ${originFile}: skipping line — missing filename or content`);
        continue;
      }
      records.push({
        filename: obj.filename,
        content: obj.content,
        source: typeof obj.source_tag === "string" ? obj.source_tag : source,
        origin_file: originFile,
        origin_sha: originSha,
        synced_at: now,
      });
    } catch {
      console.error(`[JSONL] ${originFile}: failed to parse line: ${trimmed.slice(0, 100)}`);
    }
  }
  return records;
}

// ---------------------------------------------------------------------------
// Incremental sync
//
// Algorithm:
//  1. Fetch the remote file listing (name + blob SHA) from GitHub or GitLab.
//  2. Compare each file's SHA against what is stored in LanceDB.
//  3. For changed / new files: re-fetch content and upsert rows.
//     - Regular files  → one row (filename = origin_file)
//     - JSONL files    → N rows (one per line), all keyed to origin_file
//  4. Delete rows for files that no longer exist in the remote directory.
//  5. Rebuild the FTS index only when something actually changed.
// ---------------------------------------------------------------------------

async function syncDocs(): Promise<void> {
  console.error("[sync] Checking for updates…");

  // Resolve source
  let remoteFiles: RemoteFile[] | null = null;
  let sourceName = "";
  let fetchFile: (name: string) => Promise<string | null>;

  remoteFiles = await listGitLabFiles();
  if (remoteFiles) {
    sourceName = "gitlab";
    fetchFile = fetchGitLabFile;
  } else {
    remoteFiles = await listGitHubFiles();
    if (remoteFiles) {
      sourceName = "github";
      fetchFile = fetchGitHubFile;
    }
  }

  if (!remoteFiles) {
    console.error("[sync] Remote unavailable — falling back to local filesystem");
    await syncLocal();
    return;
  }

  console.error(`[sync] ${sourceName}: ${remoteFiles.length} file(s) in docs directory`);

  const storedShas = await getStoredShas();
  const seenOriginFiles = new Set<string>();
  let changed = 0;

  for (const file of remoteFiles) {
    seenOriginFiles.add(file.name);

    // Skip if blob SHA is unchanged
    if (storedShas.get(file.name) === file.sha) continue;

    const isNew = !storedShas.has(file.name);
    console.error(`[sync] ${file.name}: ${isNew ? "new" : "changed"} (sha ${file.sha.slice(0, 8)}…)`);

    const content = await fetchFile(file.name);
    if (content === null) {
      console.error(`[sync] ${file.name}: fetch failed — skipping`);
      continue;
    }

    // Remove stale rows for this origin_file before inserting fresh ones
    if (!isNew) {
      await docsTable.delete(`origin_file = '${escapeSql(file.name)}'`);
    }

    let rows: DocRecord[];
    if (file.name.endsWith(".jsonl")) {
      rows = parseJsonl(content, file.name, file.sha, sourceName);
      console.error(`[sync] ${file.name}: parsed ${rows.length} JSONL entr${rows.length === 1 ? "y" : "ies"}`);
    } else {
      rows = [{
        filename: file.name,
        content,
        source: sourceName,
        origin_file: file.name,
        origin_sha: file.sha,
        synced_at: Date.now(),
      }];
    }

    if (rows.length > 0) await docsTable.add(rows);
    changed++;
  }

  // Remove entries for files deleted from the remote directory
  for (const originFile of storedShas.keys()) {
    if (!seenOriginFiles.has(originFile)) {
      await docsTable.delete(`origin_file = '${escapeSql(originFile)}'`);
      console.error(`[sync] Removed entries for deleted file: ${originFile}`);
      changed++;
    }
  }

  if (changed > 0) {
    await rebuildFtsIndex();
    console.error(`[sync] Done — ${changed} file(s) updated`);
  } else {
    console.error("[sync] Done — everything up to date");
  }
}

async function syncLocal(): Promise<void> {
  const dir = path.join(process.cwd(), DOCS_FOLDER);
  let filenames: string[];
  try {
    filenames = fs.readdirSync(dir);
  } catch {
    console.error(`[sync] Local docs folder not found: ${dir}`);
    return;
  }

  // Replace all local-sourced rows
  const existing = await docsTable.countRows();
  if (existing > 0) await docsTable.delete("source = 'local'");

  const now = Date.now();
  const rows: DocRecord[] = [];
  for (const name of filenames) {
    const content = fs.readFileSync(path.join(dir, name), "utf-8");
    if (name.endsWith(".jsonl")) {
      rows.push(...parseJsonl(content, name, "", "local"));
    } else {
      rows.push({ filename: name, content, source: "local", origin_file: name, origin_sha: "", synced_at: now });
    }
  }

  if (rows.length > 0) {
    await docsTable.add(rows);
    await rebuildFtsIndex();
  }
  console.error(`[sync] Local sync complete — ${rows.length} doc(s)`);
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new Server(
  { name: "documentation-reader", version: "3.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_docs",
      description:
        "MANDATORY FIRST STEP: Call this immediately before writing, editing, or suggesting any code. Returns all available documentation filenames from the local LanceDB cache (synced from GitHub/GitLab). Never skip this step.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "read_doc",
      description:
        "MANDATORY SECOND STEP: Read the full content of a documentation file. Call this for every file relevant to the user's request. The docs define authoritative project standards and always override pre-trained knowledge.",
      inputSchema: {
        type: "object",
        properties: {
          filename: {
            type: "string",
            description: "Exact filename returned by list_docs or search_docs (e.g. 'react-hooks.md')",
          },
        },
        required: ["filename"],
      },
    },
    {
      name: "search_docs",
      description:
        "Search the documentation cache by keyword or topic. Use this to discover which docs are relevant before calling read_doc. For example, searching 'react hooks' returns files about React hooks.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Keywords or topic to search for" },
          limit: { type: "number", description: "Maximum results (default 5, max 20)" },
        },
        required: ["query"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  console.error(`[MCP] "${name}" args=${JSON.stringify(args)}`);

  // ── list_docs ──────────────────────────────────────────────────────────────
  if (name === "list_docs") {
    const count = await docsTable.countRows();
    if (count === 0) {
      return { content: [{ type: "text", text: "No docs cached yet — initial sync is in progress. Try again shortly." }] };
    }
    const rows = (await docsTable.query().select(["filename", "source"]).toArray()) as DocRecord[];

    // Group by source for readability
    const bySource = new Map<string, string[]>();
    for (const r of rows) {
      if (!bySource.has(r.source)) bySource.set(r.source, []);
      bySource.get(r.source)!.push(r.filename);
    }
    const lines: string[] = [];
    for (const [src, files] of bySource) lines.push(`[source: ${src}]`, ...files);
    return { content: [{ type: "text", text: lines.join("\n") }] };
  }

  // ── read_doc ───────────────────────────────────────────────────────────────
  if (name === "read_doc") {
    const filename = args?.filename as string | undefined;
    if (!filename) return { content: [{ type: "text", text: "Error: 'filename' argument is required." }] };

    // Reject obvious path-traversal attempts
    if (filename.includes("..") || filename.includes("\0")) {
      return { content: [{ type: "text", text: `Error: invalid filename '${filename}'.` }] };
    }

    const rows = (await docsTable
      .query()
      .where(`filename = '${escapeSql(filename)}'`)
      .select(["content"])
      .limit(1)
      .toArray()) as DocRecord[];

    if (rows.length === 0) {
      return { content: [{ type: "text", text: `'${filename}' not found in cache. Run list_docs or search_docs first.` }] };
    }
    return { content: [{ type: "text", text: rows[0].content }] };
  }

  // ── search_docs ────────────────────────────────────────────────────────────
  if (name === "search_docs") {
    const query = args?.query as string | undefined;
    const limit = Math.min(parseInt(String(args?.limit ?? "5")), 20);
    if (!query) return { content: [{ type: "text", text: "Error: 'query' argument is required." }] };

    if (!ftsReady) {
      // FTS index not built yet — fall back to in-memory substring match
      const all = (await docsTable.query().select(["filename", "content"]).toArray()) as DocRecord[];
      const lq = query.toLowerCase();
      const hits = all
        .filter((r) => r.filename.toLowerCase().includes(lq) || r.content.toLowerCase().includes(lq))
        .slice(0, limit);
      if (hits.length === 0) return { content: [{ type: "text", text: `No docs match '${query}'.` }] };
      return { content: [{ type: "text", text: hits.map((h) => h.filename).join("\n") }] };
    }

    try {
      const rows = (await docsTable.search(query).select(["filename", "source"]).limit(limit).toArray()) as DocRecord[];
      if (rows.length === 0) return { content: [{ type: "text", text: `No docs match '${query}'.` }] };
      return { content: [{ type: "text", text: rows.map((r) => r.filename).join("\n") }] };
    } catch (e: any) {
      return { content: [{ type: "text", text: `Search error: ${e.message}` }] };
    }
  }

  throw new Error(`Unknown tool: ${name}`);
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
  await initDB();

  const count = await docsTable.countRows();
  if (count === 0) {
    // First run — block until we have data so the server is immediately useful
    await syncDocs();
  } else {
    // Data already cached — serve immediately, sync in background
    console.error(`[LanceDB] ${count} docs in cache; syncing in background`);
    setTimeout(() => syncDocs().catch((e) => console.error(`[sync] Error: ${e.message}`)), 2000);
  }

  // Periodic resync
  setInterval(
    () => syncDocs().catch((e) => console.error(`[sync] Error: ${e.message}`)),
    SYNC_INTERVAL_MS
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Documentation reader MCP server running on stdio");
  if (GITHUB_OWNER && GITHUB_REPO) console.error(`  GitHub: ${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${GITHUB_DOCS_PATH}`);
  if (GITLAB_NAMESPACE && GITLAB_REPO) console.error(`  GitLab: ${GITLAB_HOST}/${GITLAB_NAMESPACE}/${GITLAB_REPO}/${GITLAB_BRANCH}/${GITLAB_DOCS_PATH}`);
  console.error(`  LanceDB: ${LANCEDB_PATH}  (sync every ${SYNC_INTERVAL_MS / 60000} min)`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
