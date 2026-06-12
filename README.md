# MCP-Shield

A reverse proxy gateway that sits between AI agents and MCP servers. Validates agent identity via JWT, enforces YAML-defined policies, blocks unauthorized tool calls in real-time, and streams every decision to a live compliance dashboard.

```
Agent → Proxy (auth + policy check) → MCP Server
                  ↓
          Audit log + SSE → Dashboard
```

---

## Prerequisites

- **Node.js** 18+
- **npm** 8+

No database setup required — SQLite is embedded.

---

## Repo layout

```
mcp-shield/
├── proxy/          Gateway (Fastify + TypeScript)
├── dashboard/      React + Vite compliance dashboard
├── mock-servers/   Three toy MCP servers for demo
├── demo/           Agent scripts + token generator
└── policy.yaml     Policy-as-code (edit this live)
```

---

## Quick start (one command)

Runs all mock servers, the proxy, generates tokens, and fires the full agent-a demo sequence.

```bash
# 1. Install dependencies
cd proxy        && npm install && cd ..
cd mock-servers && npm install && cd ..
cd demo         && npm install && cd ..
cd dashboard    && npm install && cd ..

# 2. Create proxy env file
cp proxy/.env.example proxy/.env          # or write it manually — see below

# 3. Run the full demo
bash demo/run-demo.sh
```

Open the dashboard separately:

```bash
cd dashboard && npm run dev
# → http://localhost:5173
```

---

## Manual setup (step by step)

### 1. Proxy `.env`

Create `proxy/.env`:

```env
PROXY_PORT=4000
TARGET_MCP_URL=http://localhost:3001
JWT_SECRET=mcp-shield-dev
POLICY_FILE=../policy.yaml
DB_FILE=./audit.db
CORS_ORIGIN=http://localhost:5173
DASHBOARD_URL=http://localhost:5173
```

### 2. Start mock servers (three terminals)

```bash
cd mock-servers && npx ts-node server-a.ts   # :3001  db-server
cd mock-servers && npx ts-node server-b.ts   # :3002  api-server
cd mock-servers && npx ts-node server-c.ts   # :3003  report-server
```

### 3. Start the proxy

```bash
cd proxy && npm run dev      # ts-node-dev with hot reload
# → http://localhost:4000
```

### 4. Start the dashboard

```bash
cd dashboard && npm run dev
# → http://localhost:5173
```

### 5. Generate agent tokens

```bash
cd demo
eval "$(npx ts-node gen-tokens.ts)"
# exports AGENT_A_TOKEN, AGENT_B_TOKEN, AGENT_C_TOKEN into your shell
```

### 6. Run demo agents

```bash
cd demo
npx ts-node agent-a.ts   # analyst — mix of ALLOW and BLOCK
npx ts-node agent-b.ts   # untrusted — all calls blocked, access requests created
npx ts-node agent-c.ts   # analyst — legitimate call, then session hijack attempt
```

---

## Ports

| Service        | Port |
|----------------|------|
| Proxy / API    | 4000 |
| Dashboard      | 5173 |
| Mock db-server | 3001 |
| Mock api-server| 3002 |
| Mock report-server | 3003 |

---

## Policy

Edit `policy.yaml` at the repo root. The proxy hot-reloads it without restart.

```yaml
roles:
  analyst:
    allowed_tools: [query_db, list_tables, send_email, generate_report]
    denied_tools:  [delete_record, drop_table, export_all]
  admin:
    allowed_tools: ["*"]          # wildcard — all tools allowed
  untrusted:
    allowed_tools: []             # empty — all tools blocked
```

`denied_tools` takes precedence over `allowed_tools`.

---

## Key endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/mcp` | Main proxy endpoint (requires JWT) |
| `GET`  | `/events` | SSE stream — audit, threats, risk scores |
| `GET`  | `/audit/recent` | Last 100 audit log rows |
| `GET`  | `/audit/stats` | Aggregate counts |
| `GET`  | `/policy` | Current parsed policy |
| `POST` | `/policy` | Overwrite policy |
| `GET`  | `/policy/simulate?role=X&tool=Y` | What-if check |
| `GET`  | `/access-requests` | All access requests |
| `POST` | `/access-requests/:id/resolve` | Approve or deny |
| `GET`  | `/threats/recent` | Recent threat events |
| `GET`  | `/risk-scores` | Per-agent risk scores |
| `GET`  | `/routes` | Tool → server routing table |
| `GET`  | `/servers` | Registered MCP servers |

---

## JWT format

Tokens are signed with `JWT_SECRET`. Claims:

```json
{ "sub": "agent-a", "role": "analyst", "session": "sess-a" }
```

Attach as `Authorization: Bearer <token>` + `x-session-id: sess-a`.

---

## Troubleshooting

**Port already in use**
```bash
for port in 3001 3002 3003 4000; do
  pid=$(lsof -ti TCP:$port 2>/dev/null) && kill -9 $pid && echo "killed :$port"
done
```

**`AGENT_X_TOKEN not set`** — re-run `eval "$(npx ts-node gen-tokens.ts)"` in the same shell session.

**Dashboard shows "Disconnected"** — check proxy is running on `:4000` and `CORS_ORIGIN` matches the dashboard URL.

**SQLite schema error on old DB** — delete `proxy/audit.db` and restart the proxy. Migrations run automatically on a fresh file.
