# Documentation Reader MCP Server

A cross-platform MCP (Model Context Protocol) server that provides AI assistants with access to local project documentation. Works with **Gemini**, **Claude**, and any MCP-compatible client via stdio transport.

## Setup

1. Install dependencies: `npm install`
2. Place your documentation files in the `docs` folder (or set `DOCS_FOLDER` environment variable to a different path).
3. Start the server: `npm start`

## Tools

- `list_docs`: Lists all files in the documentation folder.
- `read_doc`: Reads the content of a specified documentation file.

---

## Client Configuration

### Gemini (Google AI Studio / Gemini CLI)

Use the provided `.gemini.json` or `gemini-mcp-fragment.json` in your project root:

```json
{
  "tools": [
    {
      "name": "documentation_reader",
      "description": "Read project documentation via MCP stdio server",
      "mcp": {
        "enabled": true,
        "command": "npm start",
        "cwd": "."
      }
    }
  ]
}
```

Or using Docker:

```json
{
  "tools": [
    {
      "name": "documentation_reader",
      "description": "Read project documentation via MCP stdio server",
      "mcp": {
        "enabled": true,
        "command": "docker run -i --rm documentation-reader-mcp",
        "stdio": true,
        "readySignal": "Documentation reader MCP server running on stdio"
      }
    }
  ]
}
```

### Claude Desktop

Add the following to your Claude Desktop config file:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

You can also open it via **Claude Desktop → Settings → Developer → Edit Config**.

#### Option 1: Direct (npm/tsx)

```json
{
  "mcpServers": {
    "documentation-reader": {
      "command": "npx",
      "args": ["tsx", "index.ts"],
      "cwd": "C:\\path\\to\\documentationMCP",
      "env": {
        "DOCS_FOLDER": "docs"
      }
    }
  }
}
```

> **Note**: Replace `C:\\path\\to\\documentationMCP` with the actual absolute path to this project. On Windows, use double backslashes.

#### Option 2: Docker

```json
{
  "mcpServers": {
    "documentation-reader": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "documentation-reader-mcp"]
    }
  }
}
```

Build the Docker image first: `docker build -t documentation-reader-mcp .`

### Other MCP Clients (VS Code, Cursor, etc.)

This server uses **stdio transport**, which is the standard MCP transport. Any MCP-compatible client can connect by running:

```bash
npx tsx index.ts
```

or via Docker:

```bash
docker run -i --rm documentation-reader-mcp
```

---

## Docker

Build and run:

```bash
docker build -t documentation-reader-mcp .
docker run -i --rm documentation-reader-mcp
```

To use a custom docs folder, mount it as a volume:

```bash
docker run -i --rm -v /path/to/your/docs:/app/docs documentation-reader-mcp
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DOCS_FOLDER` | `docs` | Path to the documentation directory (relative to project root) |

## Example

After configuring the server in your AI client, the assistant can:

1. Call `list_docs` to discover available documentation files
2. Call `read_doc` with a filename to read its contents
3. Use the documentation to ground its code suggestions in your project's actual standards