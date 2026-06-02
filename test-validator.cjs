// Smoke test: sends validate_suggested_code to the Docker MCP server via stdio
const { spawn } = require("child_process");

const container = spawn("docker", ["run", "-i", "--rm", "documentation-reader-mcp"], {
  stdio: ["pipe", "pipe", "pipe"],
});

let stdout = "";
let stderr = "";

container.stdout.on("data", (d) => { stdout += d.toString(); });
container.stderr.on("data", (d) => { stderr += d.toString(); });

container.on("close", (code) => {
  console.log("\n--- stderr (server logs) ---");
  console.log(stderr);
  console.log("--- stdout (JSON-RPC responses) ---");
  try {
    stdout.trim().split("\n").forEach((line) => {
      if (line.trim()) {
        const parsed = JSON.parse(line);
        console.log(JSON.stringify(parsed, null, 2));
      }
    });
  } catch {
    console.log(stdout);
  }
  console.log("\nExit code:", code);
});

// Helper: send a JSON-RPC request
function send(msg) {
  container.stdin.write(JSON.stringify(msg) + "\n");
}

// ── 1. Initialize ──────────────────────────────────────────────────────────
send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
  protocolVersion: "2024-11-05",
  capabilities: {},
  clientInfo: { name: "smoke-test", version: "1.0" }
}});

// ── 2. list_docs ───────────────────────────────────────────────────────────
send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: {
  name: "list_docs", arguments: {}
}});

// ── 3. validate_suggested_code — should FAIL (forbidden patterns) ──────────
send({ jsonrpc: "2.0", id: 3, method: "tools/call", params: {
  name: "validate_suggested_code",
  arguments: {
    framework: "react",
    code: [
      "import { useContext, useCallback, useMemo } from 'react';",
      "const theme = useContext(ThemeContext);",
      "const fn = useCallback(() => doThing(), []);",
      "const val = useMemo(() => compute(), [data]);",
    ].join("\n")
  }
}});

// ── 4. validate_suggested_code — should PASS (clean code) ─────────────────
send({ jsonrpc: "2.0", id: 4, method: "tools/call", params: {
  name: "validate_suggested_code",
  arguments: {
    framework: "react",
    code: [
      "import { use } from 'react';",
      "function ThemedButton() {",
      "  const theme = use(ThemeContext);",
      "  return <button className={theme}>Click</button>;",
      "}",
    ].join("\n")
  }
}});

// ── 5. validate_suggested_code — Next.js should FAIL (middleware.ts + getStaticProps) ──
send({ jsonrpc: "2.0", id: 5, method: "tools/call", params: {
  name: "validate_suggested_code",
  arguments: {
    framework: "nextjs",
    code: [
      "// middleware.ts",
      "export function middleware(request) {",
      "  return NextResponse.next();",
      "}",
      "export async function getStaticProps() {",
      "  return { props: {} };",
      "}",
    ].join("\n")
  }
}});

// Give server time to respond then close
setTimeout(() => container.stdin.end(), 2000);
