# Documentation Reader MCP Server

A cross-platform MCP (Model Context Protocol) server that provides AI assistants with access to project documentation hosted on **GitHub**, **GitLab** (cloud or self-hosted), or the local filesystem. Works with **Gemini CLI**, **Claude CLI**, **Claude Desktop**, and any MCP-compatible client via stdio transport.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the environment template and fill in your values:

   ```bash
   cp .env.example .env
   ```

   Edit `.env` with your source details. Configure **either or both** — the server tries GitHub first, then GitLab, then falls back to the local filesystem.

   **GitHub:**
   ```env
   GITHUB_OWNER=your-github-username
   GITHUB_REPO=your-repo-name
   GITHUB_BRANCH=main
   GITHUB_DOCS_PATH=docs
   GITHUB_TOKEN=              # optional — raises API rate limits
   ```

   **GitLab (cloud or self-hosted):**
   ```env
   GITLAB_HOST=https://gitlab.com   # change for self-hosted instances
   GITLAB_NAMESPACE=your-namespace
   GITLAB_REPO=your-repo-name
   GITLAB_BRANCH=main
   GITLAB_DOCS_PATH=docs
   GITLAB_TOKEN=              # optional — raises API rate limits
   ```

   **Local fallback:**
   ```env
   DOCS_FOLDER=docs
   ```

3. Place your documentation files in the `docs` folder (or set `DOCS_FOLDER` to a different path).

4. Start the server:

   ```bash
   npm start
   ```

## Tools

- **`list_docs`** — Lists all files in the documentation folder. Fetches from GitHub first, then GitLab, then falls back to local.
- **`read_doc`** — Reads the content of a specified documentation file. Same source priority: GitHub → GitLab → local.

---

## Adding the MCP Server to Your AI Client

### Gemini CLI

Register the server from your project directory:

**Option A — Direct (npm/tsx):**

```bash
# No extra setup needed — .gemini.json in the project root auto-registers the server.
# Just run Gemini CLI from the project directory:
gemini
```

**Option B — Docker:**

Add the server to your global Gemini settings at `~/.gemini/settings.json`:

```jsonc
{
  "mcpServers": {
    "documentation_reader": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "--env-file", "C:\\path\\to\\documentationMCP-2\\.env",
        "documentation-reader-mcp"
      ]
    }
  }
}
```

> **Note:** Replace `C:\\path\\to\\documentationMCP-2\\.env` with the absolute path to your `.env` file. On Windows use double backslashes.

Verify with `/mcp` inside Gemini CLI — you should see `🟢 documentation_reader - Ready`.

---

### Claude CLI (Claude Code)

Register the server from your project directory:

**Option A — Direct (npm/tsx):**

```bash
claude mcp add -s local documentation-reader-mcp -- npx tsx index.ts
```

**Option B — Docker:**

```bash
claude mcp add -s local documentation-reader-mcp -- docker run -i --rm --env-file /path/to/.env documentation-reader-mcp
```

> **Tip:** Use `-s user` instead of `-s local` to make the server available in all projects, not just this one.

Verify the server is connected:

```bash
claude mcp list
```

You should see:

```
documentation-reader-mcp: docker run -i --rm ... - ✓ Connected
```

Then launch Claude CLI and type `/mcp` to confirm the server is listed.

---

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
      "cwd": "C:\\path\\to\\documentationMCP-2",
      "env": {
        "DOCS_FOLDER": "docs"
      }
    }
  }
}
```

> **Note**: Replace `C:\\path\\to\\documentationMCP-2` with the actual absolute path to this project. On Windows, use double backslashes.

#### Option 2: Docker

```json
{
  "mcpServers": {
    "documentation-reader": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "--env-file", "C:\\path\\to\\documentationMCP-2\\.env",
        "documentation-reader-mcp"
      ]
    }
  }
}
```

Build the Docker image first: `docker build -t documentation-reader-mcp .`

---

### Other MCP Clients (VS Code, Cursor, etc.)

This server uses **stdio transport**, which is the standard MCP transport. Any MCP-compatible client can connect by running:

```bash
npx tsx index.ts
```

or via Docker:

```bash
docker run -i --rm --env-file .env documentation-reader-mcp
```

---

## Docker

Build the image:

```bash
docker build -t documentation-reader-mcp .
```

Run with your `.env` file:

```bash
docker run -i --rm --env-file .env documentation-reader-mcp
```

To use a custom docs folder, mount it as a volume:

```bash
docker run -i --rm --env-file .env -v /path/to/your/docs:/app/docs documentation-reader-mcp
```

> **Important:** The `.env` file is excluded from the Docker image via `.dockerignore`. You must pass it at runtime with `--env-file` or set variables individually with `-e`.

## Environment Variables

Configure these in your `.env` file (see `.env.example` for a template). Leave a provider's variables blank to skip it entirely.

**GitHub**

| Variable | Default | Description |
|---|---|---|
| `GITHUB_OWNER` | _(none)_ | GitHub username or organization |
| `GITHUB_REPO` | _(none)_ | Repository name |
| `GITHUB_BRANCH` | `main` | Branch to fetch docs from |
| `GITHUB_DOCS_PATH` | `docs` | Path to the docs directory within the repo |
| `GITHUB_TOKEN` | _(none)_ | Optional — personal access token to raise API rate limits |

**GitLab**

| Variable | Default | Description |
|---|---|---|
| `GITLAB_HOST` | `https://gitlab.com` | GitLab instance URL — change for self-hosted |
| `GITLAB_NAMESPACE` | _(none)_ | GitLab username or group |
| `GITLAB_REPO` | _(none)_ | Repository name |
| `GITLAB_BRANCH` | `main` | Branch to fetch docs from |
| `GITLAB_DOCS_PATH` | `docs` | Path to the docs directory within the repo |
| `GITLAB_TOKEN` | _(none)_ | Optional — personal access token (`glpat-…`) to raise API rate limits |

**Local fallback**

| Variable | Default | Description |
|---|---|---|
| `DOCS_FOLDER` | `docs` | Local docs directory (relative to project root) |

## Example

After configuring the server in your AI client, the assistant can:

1. Call `list_docs` to discover available documentation files
2. Call `read_doc` with a filename to read its contents
3. Use the documentation to ground its code suggestions in your project's actual standards