# MCP-Shield — Claude Code Context

## What this project is
MCP-Shield is a **reverse proxy gateway** that sits between AI agents and MCP servers.
It validates agent identity, enforces YAML-defined policies, blocks unauthorized tool
calls in real-time, and writes an immutable audit log of every decision.

## Monorepo layout
```
mcp-shield/
├── proxy/          Node.js + Fastify + TypeScript — the gateway core
├── dashboard/      React + Vite — live compliance dashboard
├── mock-servers/   Two tiny JSON-RPC MCP servers for demo
├── demo/           Demo agent scripts (agent-a, agent-b, agent-c)
├── policy.yaml     The policy-as-code file (single source of truth)
└── CLAUDE.md       This file
```

## Tech stack decisions
- **Fastify** over Express — typed plugins, built-in JSON schema, faster
- **better-sqlite3** — synchronous, zero-config, perfect for hackathon audit log
- **js-yaml** + **chokidar** — parse + hot-reload policy.yaml without restart
- **jsonwebtoken** — decode and verify agent JWTs
- **Server-Sent Events (SSE)** — stream audit events to the React dashboard
- **React + Vite + recharts** — fast setup, charts work out of the box

## Core data flow
```
Agent → [POST /mcp] Fastify proxy
           ↓
        1. Parse JSON-RPC 2.0 body
        2. Extract + validate JWT (session binding check)
        3. Resolve agent role from JWT claims
        4. Policy engine: role × tool → allow | block
        5a. ALLOW  → forward to target MCP server, log decision
        5b. BLOCK  → return structured 403, log decision
           ↓
        Audit log (SQLite) → SSE broadcast → Dashboard
```

## Key files to know
| File | Purpose |
|------|---------|
| `proxy/src/index.ts` | Fastify server entry point |
| `proxy/src/rpc-handler.ts` | JSON-RPC intercept middleware |
| `proxy/src/session.ts` | Session Map, token binding, hijack detection |
| `proxy/src/policy.ts` | YAML loader + allow/deny check function |
| `proxy/src/audit.ts` | SQLite writer + SSE broadcaster |
| `proxy/src/forwarder.ts` | HTTP forward to real MCP server |
| `policy.yaml` | Role → tool rules (edit this for demo) |
| `dashboard/src/App.tsx` | Dashboard root |
| `dashboard/src/hooks/useAuditStream.ts` | SSE consumer hook |

## JSON-RPC 2.0 shape MCP uses
```json
{ "jsonrpc": "2.0", "id": 1, "method": "tools/call",
  "params": { "name": "query_db", "arguments": { "sql": "SELECT …" } } }
```
The tool name lives at `params.name`. That's what the policy engine checks.

## JWT claims shape expected by the proxy
```json
{ "sub": "agent-a", "role": "analyst", "session": "sess-abc123", "iat": …, "exp": … }
```
Sign demo tokens with the secret in `.env` → `JWT_SECRET=mcp-shield-dev`.

## Policy.yaml schema
```yaml
roles:
  analyst:
    allowed_tools: [query_db, read_report, list_tables]
    denied_tools:  [delete_record, drop_table, export_all]
  admin:
    allowed_tools: ["*"]
  untrusted:
    allowed_tools: []
```
`"*"` means all tools allowed. Empty `allowed_tools` means all blocked.
`denied_tools` takes precedence over `allowed_tools` (explicit deny wins).

## Audit log schema (SQLite)
```sql
CREATE TABLE audit_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ts            TEXT    NOT NULL,   -- ISO 8601
  agent_id      TEXT    NOT NULL,
  session_id    TEXT    NOT NULL,
  tool_name     TEXT    NOT NULL,
  decision      TEXT    NOT NULL CHECK(decision IN ('allow','block','hijack')),
  policy_rule   TEXT,               -- which rule triggered
  request_hash  TEXT    NOT NULL,   -- SHA-256 of full JSON-RPC body
  latency_ms    INTEGER             -- proxy overhead
);
```

## Error response shape (blocked calls)
```json
{
  "jsonrpc": "2.0", "id": 1,
  "error": {
    "code": -32001,
    "message": "Access denied",
    "data": {
      "agent": "agent-b",
      "tool": "query_db",
      "reason": "Role 'untrusted' has no allowed tools",
      "policy_rule": "roles.untrusted.allowed_tools=[]"
    }
  }
}
```

## SSE event shape (proxy → dashboard)
```json
{ "type": "audit", "row": { ...audit_log columns... } }
```
Endpoint: `GET /events` on the proxy server.

## Environment variables
```
PROXY_PORT=4000
TARGET_MCP_URL=http://localhost:3001   # default MCP server to forward to
JWT_SECRET=mcp-shield-dev
POLICY_FILE=../policy.yaml
DB_FILE=./audit.db
CORS_ORIGIN=http://localhost:5173
```

## Demo scenario (hardcoded for presentation)
1. **agent-a** (role: analyst) calls `query_db` → **ALLOWED**, green in dashboard
2. **agent-b** (role: untrusted) calls `query_db` → **BLOCKED**, red alert
3. **agent-a** calls `delete_record` → **BLOCKED** (in denied_tools), red alert
4. **agent-c** swaps token mid-session → **HIJACK DETECTED**, orange alert

## Do NOT do these things
- Do not require changes to mock-servers/ — they must be unmodified pass-through targets
- Do not store JWT secrets in source files — use .env
- Do not add authentication to the /events SSE endpoint (demo only)
- Do not use an ORM — raw better-sqlite3 statements only
- Do not add rate limiting (out of scope for hackathon)
