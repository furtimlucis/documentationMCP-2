import "dotenv/config";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

// ---------------------------------------------------------------------------
// GitHub configuration — loaded from .env (see .env.example for reference)
// ---------------------------------------------------------------------------
const GITHUB_OWNER = process.env.GITHUB_OWNER || "";
const GITHUB_REPO = process.env.GITHUB_REPO || "";
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || "main";
const GITHUB_DOCS_PATH = process.env.GITHUB_DOCS_PATH || "docs";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";

const GITHUB_API_BASE = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_DOCS_PATH}`;
const GITHUB_RAW_BASE = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${GITHUB_DOCS_PATH}`;

// ---------------------------------------------------------------------------
// GitLab configuration — loaded from .env (see .env.example for reference)
// ---------------------------------------------------------------------------
const GITLAB_HOST = process.env.GITLAB_HOST || "https://gitlab.com";
const GITLAB_NAMESPACE = process.env.GITLAB_NAMESPACE || "";
const GITLAB_REPO = process.env.GITLAB_REPO || "";
const GITLAB_BRANCH = process.env.GITLAB_BRANCH || "main";
const GITLAB_DOCS_PATH = process.env.GITLAB_DOCS_PATH || "docs";
const GITLAB_TOKEN = process.env.GITLAB_TOKEN || "";

const GITLAB_PROJECT_ID = encodeURIComponent(`${GITLAB_NAMESPACE}/${GITLAB_REPO}`);
const GITLAB_API_BASE = `${GITLAB_HOST}/api/v4/projects/${GITLAB_PROJECT_ID}/repository`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Standard headers for GitHub API requests */
function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": "documentation-reader-mcp/1.0",
    Accept: "application/vnd.github.v3+json",
  };
  if (GITHUB_TOKEN) {
    headers["Authorization"] = `Bearer ${GITHUB_TOKEN}`;
  }
  return headers;
}

/** Standard headers for GitLab API requests */
function gitlabHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": "documentation-reader-mcp/1.0",
  };
  if (GITLAB_TOKEN) {
    headers["PRIVATE-TOKEN"] = GITLAB_TOKEN;
  }
  return headers;
}

/**
 * List documentation files from GitHub.
 * Returns an array of filenames, or `null` if the request fails or GitHub is not configured.
 */
async function listDocsFromGitHub(): Promise<string[] | null> {
  if (!GITHUB_OWNER || !GITHUB_REPO) return null;
  try {
    const url = `${GITHUB_API_BASE}?ref=${GITHUB_BRANCH}`;
    console.error(`[GitHub] Fetching file list from ${url}`);
    const res = await fetch(url, { headers: githubHeaders() });
    if (!res.ok) {
      console.error(`[GitHub] API responded with ${res.status}: ${res.statusText}`);
      return null;
    }
    const data = (await res.json()) as Array<{ name: string; type: string }>;
    return data.filter((entry) => entry.type === "file").map((entry) => entry.name);
  } catch (err: any) {
    console.error(`[GitHub] Network error while listing docs: ${err.message}`);
    return null;
  }
}

/**
 * Read a single documentation file from GitHub (raw content).
 * Returns the file text, or `null` if the request fails or GitHub is not configured.
 */
async function readDocFromGitHub(filename: string): Promise<string | null> {
  if (!GITHUB_OWNER || !GITHUB_REPO) return null;
  try {
    const url = `${GITHUB_RAW_BASE}/${encodeURIComponent(filename)}`;
    console.error(`[GitHub] Fetching file content from ${url}`);
    const res = await fetch(url, {
      headers: { "User-Agent": "documentation-reader-mcp/1.0" },
    });
    if (!res.ok) {
      console.error(`[GitHub] Raw fetch responded with ${res.status}: ${res.statusText}`);
      return null;
    }
    return await res.text();
  } catch (err: any) {
    console.error(`[GitHub] Network error while reading doc: ${err.message}`);
    return null;
  }
}

/**
 * List documentation files from GitLab.
 * Returns an array of filenames, or `null` if the request fails or GitLab is not configured.
 */
async function listDocsFromGitLab(): Promise<string[] | null> {
  if (!GITLAB_NAMESPACE || !GITLAB_REPO) return null;
  try {
    const url = `${GITLAB_API_BASE}/tree?path=${encodeURIComponent(GITLAB_DOCS_PATH)}&ref=${GITLAB_BRANCH}`;
    console.error(`[GitLab] Fetching file list from ${url}`);
    const res = await fetch(url, { headers: gitlabHeaders() });
    if (!res.ok) {
      console.error(`[GitLab] API responded with ${res.status}: ${res.statusText}`);
      return null;
    }
    // GitLab returns type "blob" for files, "tree" for directories
    const data = (await res.json()) as Array<{ name: string; type: string }>;
    return data.filter((entry) => entry.type === "blob").map((entry) => entry.name);
  } catch (err: any) {
    console.error(`[GitLab] Network error while listing docs: ${err.message}`);
    return null;
  }
}

/**
 * Read a single documentation file from GitLab (raw content).
 * Returns the file text, or `null` if the request fails or GitLab is not configured.
 */
async function readDocFromGitLab(filename: string): Promise<string | null> {
  if (!GITLAB_NAMESPACE || !GITLAB_REPO) return null;
  try {
    const filePath = encodeURIComponent(`${GITLAB_DOCS_PATH}/${filename}`);
    const url = `${GITLAB_API_BASE}/files/${filePath}/raw?ref=${GITLAB_BRANCH}`;
    console.error(`[GitLab] Fetching file content from ${url}`);
    const res = await fetch(url, { headers: gitlabHeaders() });
    if (!res.ok) {
      console.error(`[GitLab] API responded with ${res.status}: ${res.statusText}`);
      return null;
    }
    return await res.text();
  } catch (err: any) {
    console.error(`[GitLab] Network error while reading doc: ${err.message}`);
    return null;
  }
}

/**
 * List documentation files from the local filesystem.
 */
async function listDocsLocal(): Promise<string[]> {
  const fs = await import("fs");
  const path = await import("path");
  const docsDir = path.join(process.cwd(), process.env.DOCS_FOLDER || "docs");
  return fs.readdirSync(docsDir).map((f: string) => f);
}

/**
 * Read a single documentation file from the local filesystem.
 */
async function readDocLocal(filename: string): Promise<string> {
  const fs = await import("fs");
  const path = await import("path");
  const filePath = path.join(process.cwd(), process.env.DOCS_FOLDER || "docs", filename);
  return fs.readFileSync(filePath, "utf-8");
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new Server(
  {
    name: "documentation-reader",
    version: "2.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list_docs",
        description:
          "MANDATORY FIRST STEP: Call this tool immediately before writing, editing, or suggesting any code. It discovers all available documentation files (fetched from the latest GitHub or GitLab repository) that you MUST read to understand the correct patterns for this project. Never skip this step — generating code without checking docs first will produce outdated or incorrect output.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "read_doc",
        description:
          "MANDATORY SECOND STEP: Read the full content of a documentation file returned by list_docs. You MUST call this for every file relevant to the user's request before forming any implementation opinion. The docs define the project's authoritative standards — they always override your pre-trained knowledge. Always call read_doc before suggesting code patterns, APIs, or architectural decisions.",
        inputSchema: {
          type: "object",
          properties: {
            filename: {
              type: "string",
              description: "The exact filename returned by list_docs (e.g. 'react.md', 'nextjs.md')",
            },
          },
          required: ["filename"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  console.error(
    `[DEBUG] Client is executing documentation reader tool: "${name}" with arguments: ${JSON.stringify(args)}`
  );

  if (name === "list_docs") {
    // Try GitHub first
    const githubFiles = await listDocsFromGitHub();
    if (githubFiles !== null) {
      console.error(`[GitHub] Successfully listed ${githubFiles.length} file(s)`);
      return {
        content: [
          {
            type: "text",
            text: `[source: github/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${GITHUB_DOCS_PATH}]\n${githubFiles.join("\n")}`,
          },
        ],
      };
    }

    // Try GitLab second
    const gitlabFiles = await listDocsFromGitLab();
    if (gitlabFiles !== null) {
      console.error(`[GitLab] Successfully listed ${gitlabFiles.length} file(s)`);
      return {
        content: [
          {
            type: "text",
            text: `[source: gitlab/${GITLAB_NAMESPACE}/${GITLAB_REPO}/${GITLAB_BRANCH}/${GITLAB_DOCS_PATH}]\n${gitlabFiles.join("\n")}`,
          },
        ],
      };
    }

    // Fallback to local filesystem
    console.error("[Fallback] GitHub and GitLab unavailable, listing from local filesystem");
    try {
      const localFiles = await listDocsLocal();
      return {
        content: [
          {
            type: "text",
            text: `[source: local filesystem (remote sources were unreachable)]\n${localFiles.join("\n")}`,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error listing docs: all sources failed (GitHub, GitLab, local): ${error.message}`,
          },
        ],
      };
    }
  } else if (name === "read_doc") {
    const filename = args?.filename as string;
    if (!filename) {
      return {
        content: [{ type: "text", text: "Error: 'filename' argument is required." }],
      };
    }

    // Try GitHub first
    const githubContent = await readDocFromGitHub(filename);
    if (githubContent !== null) {
      console.error(`[GitHub] Successfully read "${filename}" (${githubContent.length} chars)`);
      return {
        content: [{ type: "text", text: githubContent }],
      };
    }

    // Try GitLab second
    const gitlabContent = await readDocFromGitLab(filename);
    if (gitlabContent !== null) {
      console.error(`[GitLab] Successfully read "${filename}" (${gitlabContent.length} chars)`);
      return {
        content: [{ type: "text", text: gitlabContent }],
      };
    }

    // Fallback to local filesystem
    console.error(`[Fallback] Remote sources unavailable, reading "${filename}" from local filesystem`);
    try {
      const localContent = await readDocLocal(filename);
      return {
        content: [
          {
            type: "text",
            text: `[NOTE: Served from local cache — remote sources were unreachable. Content may be outdated.]\n\n${localContent}`,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error reading "${filename}": all sources failed (GitHub, GitLab, local): ${error.message}`,
          },
        ],
      };
    }
  } else {
    throw new Error(`Unknown tool: ${name}`);
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Documentation reader MCP server running on stdio");
  if (GITHUB_OWNER && GITHUB_REPO) {
    console.error(`  GitHub source: ${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${GITHUB_DOCS_PATH}`);
  }
  if (GITLAB_NAMESPACE && GITLAB_REPO) {
    console.error(`  GitLab source: ${GITLAB_HOST}/${GITLAB_NAMESPACE}/${GITLAB_REPO}/${GITLAB_BRANCH}/${GITLAB_DOCS_PATH}`);
  }
  console.error(`  Local fallback: ${process.env.DOCS_FOLDER || "docs"}`);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
