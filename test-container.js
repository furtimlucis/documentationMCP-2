import { spawn } from "child_process";
import readline from "readline";

// ANSI escape codes for pretty styling
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

console.log(`${BOLD}${BLUE}=== Starting MCP Container Sandbox Test ===${RESET}\n`);

// Spawn the container
const dockerProcess = spawn("docker", [
  "run",
  "-i",
  "--rm",
  "documentation-reader-mcp"
]);

let success = true;

// Handle stderr for server logs
dockerProcess.stderr.on("data", (data) => {
  const msg = data.toString().trim();
  console.log(`${YELLOW}[Server Log] ${msg}${RESET}`);
});

// Setup readline interface to read line-by-line JSON-RPC responses from stdout
const rl = readline.createInterface({
  input: dockerProcess.stdout,
  terminal: false
});

// A helper function to send a JSON-RPC message and wait for a matching response id (or notification if id is null)
function sendRequest(request, expectedId) {
  return new Promise((resolve, reject) => {
    const rawPayload = JSON.stringify(request) + "\n";
    
    // Log the request
    console.log(`${BLUE}➔ Sending Request (id: ${request.id || "notification"}): ${request.method}${RESET}`);
    
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout waiting for response to request ${request.method} (${expectedId})`));
    }, 8000);

    const onLine = (line) => {
      try {
        const response = JSON.parse(line);
        if (response.id === expectedId) {
          clearTimeout(timeout);
          rl.off("line", onLine);
          resolve(response);
        }
      } catch (err) {
        // Ignore lines that aren't valid JSON-RPC
      }
    };

    rl.on("line", onLine);
    dockerProcess.stdin.write(rawPayload);
  });
}

function cleanup() {
  rl.close();
  dockerProcess.kill();
}

async function runTests() {
  try {
    // Step 1: Initialize handshake
    console.log(`${BOLD}Step 1: Protocol Handshake${RESET}`);
    const initResponse = await sendRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: {
          name: "mcp-test-runner",
          version: "1.0.0"
        }
      }
    }, 1);

    if (initResponse.result && initResponse.result.protocolVersion) {
      console.log(`${GREEN}✔ Handshake succeeded. Protocol version: ${initResponse.result.protocolVersion}${RESET}\n`);
    } else {
      throw new Error("Invalid initialize response format: " + JSON.stringify(initResponse));
    }

    // Step 2: Send initialized notification
    console.log(`${BOLD}Step 2: Send Initialized Notification${RESET}`);
    // Notifications don't get replies, so we write directly
    dockerProcess.stdin.write(JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized"
    }) + "\n");
    console.log(`${GREEN}✔ Sent notifications/initialized notification.${RESET}\n`);

    // Step 3: List Tools
    console.log(`${BOLD}Step 3: List Available Tools${RESET}`);
    const listResponse = await sendRequest({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {}
    }, 2);

    const tools = listResponse.result?.tools || [];
    console.log(`${BLUE}Found ${tools.length} tools in container:`, tools.map(t => t.name).join(", "), RESET);
    
    const toolNames = tools.map(t => t.name);
    if (toolNames.includes("list_docs") && toolNames.includes("read_doc")) {
      console.log(`${GREEN}✔ All expected tools are registered correctly in the container.${RESET}\n`);
    } else {
      throw new Error("Expected tools 'list_docs' and 'read_doc' were not found!");
    }

    // Step 4: Call tool list_docs
    console.log(`${BOLD}Step 4: Execute 'list_docs' tool inside sandbox${RESET}`);
    const callListResponse = await sendRequest({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "list_docs",
        arguments: {}
      }
    }, 3);

    const filesText = callListResponse.result?.content?.[0]?.text;
    console.log(`${BLUE}list_docs output:${RESET}\n${filesText}`);
    
    if (filesText && filesText.includes("nextjs.md") && filesText.includes("react.md")) {
      console.log(`${GREEN}✔ 'list_docs' successfully lists container-sandboxed documents.${RESET}\n`);
    } else {
      throw new Error("Invalid list_docs response or files missing: " + JSON.stringify(callListResponse));
    }

    // Step 5: Call tool read_doc for react.md
    console.log(`${BOLD}Step 5: Execute 'read_doc' tool for 'react.md'${RESET}`);
    const callReadResponse = await sendRequest({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "read_doc",
        arguments: {
          filename: "react.md"
        }
      }
    }, 4);

    const contentText = callReadResponse.result?.content?.[0]?.text;
    if (contentText && contentText.includes("React")) {
      console.log(`${GREEN}✔ 'read_doc' successfully read 'react.md' content (length: ${contentText.length} chars).${RESET}\n`);
    } else {
      throw new Error("Invalid read_doc response or wrong file content: " + JSON.stringify(callReadResponse));
    }

    console.log(`${BOLD}${GREEN}✔✔✔ ALL SANBOX TESTS PASSED SUCCESSFULLY! ✔✔✔${RESET}`);

  } catch (error) {
    success = false;
    console.error(`\n${RED}✘ TEST FAILED: ${error.message}${RESET}`);
  } finally {
    cleanup();
    process.exit(success ? 0 : 1);
  }
}

// Start tests after a brief timeout to let the container boot up
setTimeout(runTests, 1000);
