# Documentation Reader MCP Server

An MCP (Model Context Protocol) server that syncs documentation from an internal GitLab instance (or GitHub) into a local [LanceDB](https://lancedb.github.io/lancedb/) cache and exposes it to Claude Code via `list_docs`, `search_docs`, and `read_doc` tools.

When a developer asks Claude to write code, Claude automatically searches the cache and reads the relevant docs before responding — ensuring it follows internal standards instead of relying solely on its training data.

---

## How it works

```
Internal GitLab repo          LanceDB cache           Claude Code
  (docs/*.md, *.jsonl)  →→→  (on disk / PVC)  →→→  MCP tools
       ^                           |
       |   periodic sync           |  search_docs / read_doc
       └───────────────────────────┘
```

1. On startup the server fetches every file under `GITLAB_DOCS_PATH` and compares blob SHAs — only changed or new files are re-fetched.
2. Plain files (`.md`, `.txt`, etc.) become one LanceDB row each. `.jsonl` files are split into one row per line, allowing a single commit to push hundreds of entries.
3. Claude Code connects to the server and calls the MCP tools before writing any code.

The server supports two transports:

| Mode | Transport | Use case |
|---|---|---|
| `stdio` | Local child process | Local development |
| `sse` | HTTP + Server-Sent Events | Kubernetes / shared VM deployment |

---

## Local development (stdio)

```bash
cp .env.example .env
# fill in GITLAB_* values (see Configuration reference below)
npm install
npm start
```

Register with Claude Code once:

```bash
claude mcp add -s user documentation-reader \
  -e "DOTENV_CONFIG_PATH=$PWD/.env" \
  -e "LANCEDB_PATH=$PWD/lancedb" \
  -e "DOCS_FOLDER=$PWD/docs" \
  -- node node_modules/tsx/dist/cli.mjs index.ts
```

---

## Deploying to Kubernetes (airgapped / internal GitLab)

### 1 — Build and push the image

Build and push to your internal registry:

```bash
docker build -t your-registry.internal/documentation-reader-mcp:latest .
docker push your-registry.internal/documentation-reader-mcp:latest
```

### 2 — Create a values override file

```yaml
# my-values.yaml
image:
  repository: your-registry.internal/documentation-reader-mcp
  tag: latest

env:
  GITLAB_HOST: "https://gitlab.your-company.internal"
  GITLAB_NAMESPACE: "your-group"
  GITLAB_REPO: "your-docs-repo"
  GITLAB_BRANCH: "main"
  GITLAB_DOCS_PATH: "docs"

secrets:
  GITLAB_TOKEN: "glpat-xxxxxxxxxxxxxxxxxxxx"

lancedb:
  persistence:
    enabled: true
    storageClass: "your-storage-class"   # omit to use cluster default
```

### 3 — Install with Helm

```bash
helm install documentation-reader \
  ./helm/documentation-reader-mcp \
  -f my-values.yaml \
  --namespace tools \
  --create-namespace
```

The pod starts in `TRANSPORT=sse` mode (the default) and listens on port `3100`. The Helm chart creates a `ClusterIP` Service automatically.

### 4 — Connect Claude Code on each developer machine

Developers need a route to the pod. Two options:

**Option A — `kubectl port-forward` (simplest, no Ingress needed)**

```bash
kubectl port-forward -n tools \
  svc/documentation-reader-documentation-reader-mcp 3100:3100
```

Run this in a background terminal (or add it to your login shell), then register once per machine:

```bash
claude mcp add -s user --transport sse \
  documentation-reader http://localhost:3100/sse
```

**Option B — Ingress or NodePort**

Set `service.type: NodePort` (or configure an Ingress) in your values override so the service is reachable at a stable hostname, then:

```bash
claude mcp add -s user --transport sse \
  documentation-reader http://docs-mcp.your-company.internal/sse
```

---

## Updating docs

Push new or updated files to the GitLab repo under `GITLAB_DOCS_PATH`. The server polls every `SYNC_INTERVAL_MINUTES` (default 60) and picks up changes automatically by comparing blob SHAs.

To trigger an immediate sync without waiting, restart the pod:

```bash
kubectl rollout restart deployment/documentation-reader-documentation-reader-mcp -n tools
```

---

## JSONL format

For bulk documentation (API references, component libraries, etc.), push a `.jsonl` file where each line is one entry:

```jsonl
{"filename":"Button.md","content":"# Button\nProps: ...","source_tag":"design-system"}
{"filename":"Input.md","content":"# Input\nProps: ...","source_tag":"design-system"}
```

Required fields: `filename` (string), `content` (string).
Optional: `source_tag` (string) — appears as the source label in `list_docs` output.

---

## MCP tools

| Tool | When Claude calls it |
|---|---|
| `list_docs` | Mandatory first step before writing any code — returns all cached filenames grouped by source |
| `search_docs` | Keyword/topic search across filenames and content |
| `read_doc` | Reads the full content of a specific doc |

---

## Configuration reference

| Variable | Default | Description |
|---|---|---|
| `TRANSPORT` | `stdio` | `stdio` for local dev, `sse` for Kubernetes |
| `PORT` | `3100` | HTTP port when `TRANSPORT=sse` |
| `GITLAB_HOST` | `https://gitlab.com` | Base URL of your GitLab instance |
| `GITLAB_NAMESPACE` | — | GitLab group or username |
| `GITLAB_REPO` | — | Repository name |
| `GITLAB_BRANCH` | `main` | Branch to sync from |
| `GITLAB_DOCS_PATH` | `docs` | Folder inside the repo containing docs |
| `GITLAB_TOKEN` | — | Personal access token (read_api scope) |
| `GITHUB_OWNER` | — | GitHub org or username (optional fallback) |
| `GITHUB_REPO` | — | GitHub repository name |
| `GITHUB_TOKEN` | — | GitHub personal access token |
| `LANCEDB_PATH` | `./lancedb` | Where the LanceDB files are stored |
| `DOCS_FOLDER` | `docs` | Local fallback folder when no remote is configured |
| `SYNC_INTERVAL_MINUTES` | `60` | How often to poll GitLab/GitHub for changes |

---

## Helm chart reference

Key values:

| Value | Default | Description |
|---|---|---|
| `transport` | `sse` | Transport mode — passed to the container as `TRANSPORT` |
| `port` | `3100` | Container and Service port |
| `service.type` | `ClusterIP` | Kubernetes Service type (`ClusterIP`, `NodePort`, `LoadBalancer`) |
| `lancedb.persistence.enabled` | `true` | Persist the LanceDB cache across pod restarts |
| `lancedb.persistence.size` | `2Gi` | PVC size |
| `lancedb.persistence.storageClass` | `""` | Leave blank for cluster default |
| `existingSecret` | `""` | Name of a pre-existing Secret containing `GITLAB_TOKEN` / `GITHUB_TOKEN` |
| `docsVolume.enabled` | `false` | Mount docs from a ConfigMap or PVC instead of syncing from GitLab |
| `env.GITLAB_HOST` | `https://gitlab.com` | Set to your internal GitLab URL |

---

## Docker (standalone)

Build:

```bash
docker build -t documentation-reader-mcp .
```

Run in SSE mode (same as Kubernetes):

```bash
docker run --rm \
  -p 3100:3100 \
  --env-file .env \
  -e TRANSPORT=sse \
  -v lancedb-data:/data/lancedb \
  documentation-reader-mcp
```

Then connect Claude Code:

```bash
claude mcp add -s user --transport sse documentation-reader http://localhost:3100/sse
```
