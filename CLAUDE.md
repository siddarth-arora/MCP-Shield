# MCP-Shield — Claude Code Context

## What this project is
MCP-Shield is a **reverse proxy gateway** that sits between AI agents and MCP servers.
It validates agent identity, enforces YAML-defined policies, blocks unauthorized tool
calls in real-time, auto-creates access requests on every block, and streams every
decision to a live compliance dashboard.

## Monorepo layout
```
mcp-shield/
├── proxy/          Node.js + Fastify + TypeScript — the gateway core
├── dashboard/      React + Vite — live compliance dashboard
├── mock-servers/   Three tiny JSON-RPC MCP servers for demo
├── demo/           Demo agent scripts + token generator + run-demo.sh
├── policy.yaml     The policy-as-code file (single source of truth)
└── CLAUDE.md       This file
```

## Tech stack decisions
- **Fastify v5** — typed plugins, built-in JSON schema, faster; requires `async function start()` wrapper to use top-level await in CommonJS
- **better-sqlite3** — synchronous, zero-config audit log; multiple connections to same file are safe in single process
- **js-yaml** + **chokidar** — parse + hot-reload policy.yaml without restart
- **jsonwebtoken** — decode and verify agent JWTs
- **Server-Sent Events (SSE)** via PassThrough stream — `reply.send(stream)` pattern; CORS headers set on `reply.raw` directly because EventSource bypasses Fastify pipeline
- **React + Vite + Tailwind v4** — `@import "tailwindcss"` + `@tailwindcss/vite` plugin
- **react-router-dom v7** — client-side routing for `/`, `/access`, `/access/:id`

## Core data flow
```
Agent → [POST /mcp] Fastify proxy
           ↓
        1. Parse JSON-RPC 2.0 body
        2. Extract + validate JWT (auth middleware)
        3. Session binding check — hijack detection
        4. Resolve agent role from JWT claims
        5. Policy engine: role × tool → allow | block
        6a. ALLOW  → router.resolve(tool) → forward to target MCP server
        6b. BLOCK  → auto-create AccessRequest, return structured 403
           ↓
        onResponse hook → audit.write()
           ↓
        SQLite insert → threat analysis → risk scoring → SSE broadcast
           ↓
        Dashboard (Activity Feed, Threat Feed, Risk Panel, Access Portal)
```

## Key files to know
| File | Purpose |
|------|---------|
| `proxy/src/index.ts` | Fastify server entry — all routes, onResponse hook |
| `proxy/src/middleware/auth.ts` | JWT extraction + session hijack detection |
| `proxy/src/policy.ts` | YAML loader, hot-reload via chokidar, `check()` function |
| `proxy/src/router.ts` | Resolves tool → named server via policy.routes + policy.servers |
| `proxy/src/audit.ts` | SQLite writer + SSE broadcaster |
| `proxy/src/forwarder.ts` | HTTP forward to real MCP server via node-fetch |
| `proxy/src/threat-detector.ts` | Rolling-window threat analysis, 4 threat types |
| `proxy/src/risk-scorer.ts` | Per-agent 0–100 risk score with level thresholds |
| `proxy/src/access-requests.ts` | Access request CRUD, policy write-back on APPROVE |
| `proxy/src/routes/events.ts` | SSE endpoint — flushes state on connect, heartbeat every 15s |
| `proxy/src/routes/policy.ts` | GET/POST /policy, GET /policy/simulate |
| `policy.yaml` | Role → tool rules + server definitions + routing table |
| `dashboard/src/App.tsx` | Dashboard root — all panel layout |
| `dashboard/src/hooks/useAuditStream.ts` | SSE consumer — returns rows, threats, riskScores, accessRequests |
| `dashboard/src/pages/AccessPortal.tsx` | go/mcpaccess — list + resolve access requests |
| `dashboard/src/pages/AccessDetail.tsx` | Single request detail + approve/deny forms |

## JSON-RPC 2.0 shape MCP uses
```json
{ "jsonrpc": "2.0", "id": 1, "method": "tools/call",
  "params": { "name": "query_db", "arguments": { "sql": "SELECT …" } } }
```
The tool name lives at `params.name`. That's what the policy engine and router check.

## JWT claims shape expected by the proxy
```json
{ "sub": "agent-a", "role": "analyst", "session": "sess-abc123", "iat": …, "exp": … }
```
Sign demo tokens with the secret in `.env` → `JWT_SECRET=mcp-shield-dev`.
Attach as `Authorization: Bearer <token>` + `x-session-id: <session>`.

## FastifyRequest augmentation (middleware/auth.ts)
```typescript
declare module "fastify" {
  interface FastifyRequest {
    agentClaims: AgentClaims;
    sessionId: string;
    rawToken: string;
    decision: "allow" | "block" | "hijack" | "error";
    startTime: number;
    rawBody: string;
    toolName: string;
    policyRule: string | null;
    targetServer: string | null;
    accessRequestId: string | null;
  }
}
```

## Policy.yaml schema
```yaml
roles:
  analyst:
    allowed_tools: [query_db, list_tables, send_email, generate_report]
    denied_tools:  [delete_record, drop_table, export_all]
  admin:
    allowed_tools: ["*"]       # wildcard — all tools allowed
  untrusted:
    allowed_tools: []          # empty — all tools blocked

servers:
  db-server:     { url: http://localhost:3001, description: Internal database MCP server }
  api-server:    { url: http://localhost:3002, description: Internal API MCP server }
  report-server: { url: http://localhost:3003, description: Report generation server }
  default:       { url: http://localhost:3001, description: Fallback for unmapped tools }

routes:
  query_db:        db-server
  list_tables:     db-server
  delete_record:   db-server
  send_email:      api-server
  webhook_call:    api-server
  generate_report: report-server
  export_pdf:      report-server
```
`denied_tools` takes precedence over `allowed_tools`.
`router.resolve(tool)` falls back: routes[tool] → servers[name] → servers["default"] → `TARGET_MCP_URL`.
On `APPROVED` access request, the proxy writes the new tool into `allowed_tools` and removes it from `denied_tools` — chokidar picks it up automatically.

## Audit log schema (SQLite)
```sql
CREATE TABLE audit_log (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  ts                TEXT    NOT NULL,   -- ISO 8601
  agent_id          TEXT    NOT NULL,
  session_id        TEXT    NOT NULL,
  tool_name         TEXT    NOT NULL,
  decision          TEXT    NOT NULL CHECK(decision IN ('allow','block','hijack','error')),
  policy_rule       TEXT,               -- which rule triggered
  request_hash      TEXT    NOT NULL,   -- SHA-256 of full JSON-RPC body
  latency_ms        INTEGER,            -- proxy overhead ms
  target_server     TEXT,               -- named server used (e.g. db-server)
  access_request_id TEXT                -- MCPA-XXX-XXXXX if decision=block
);
```
Migrations: `ALTER TABLE … ADD COLUMN` wrapped in try/catch for existing DBs.

## Access request ID format
`MCPA-[3 alphanum]-[5 alphanum]` — generated via `crypto.randomBytes` mapped through `A-Z0-9`. Never sequential.

## Error response shape (blocked calls)
```json
{
  "jsonrpc": "2.0", "id": 1,
  "error": {
    "code": -32001,
    "message": "Access denied",
    "data": {
      "agent": "agent-b",
      "role": "untrusted",
      "tool": "query_db",
      "reason": "Role 'untrusted' has no allowed tools",
      "policy_rule": "roles.untrusted.allowed_tools=[]",
      "access_request": {
        "id": "MCPA-7K2-X9P4Q",
        "portal_url": "http://localhost:5173/access/MCPA-7K2-X9P4Q",
        "message": "To request access, visit go/mcpaccess with ID MCPA-7K2-X9P4Q"
      }
    }
  }
}
```

## SSE event shapes (proxy → dashboard)
Four event types, all sent as `data: <json>\n\n` on `GET /events`:
```json
{ "type": "audit",          "row": { ...audit_log columns... } }
{ "type": "threat",         "threat": { id, ts, agentId, severity, threatType, description, relatedTools } }
{ "type": "risk",           "agentId": "agent-b", "state": { score, level, lastUpdated, totalCalls, blockedCalls, hijackAttempts } }
{ "type": "access_request", "request": { id, createdAt, agentId, agentRole, toolName, ... status } }
```
On SSE connect, the server flushes: last 50 audit rows, last 20 threats, all risk scores, all PENDING access requests.

## Threat detector (threat-detector.ts)
Four threat types with 10-second cooldown between alerts per agent:
- `SESSION_HIJACKING` — any hijack decision
- `PROBING_ATTACK` — ≥4 blocks in 30s window on ≥3 distinct tools
- `REPEATED_VIOLATION` — same tool blocked ≥3 times
- `RATE_ABUSE` — ≥10 calls in 10s window

Severities: `LOW | MEDIUM | HIGH | CRITICAL`

## Risk scorer (risk-scorer.ts)
Per-agent 0–100 score, clamped. Score changes per decision:
- Hijack: +40
- Block on sensitive tool (delete_record / drop_table / export_all / bulk_delete): +15
- Block on other tool: +8
- Allow: −1

Levels: 0–20 SAFE · 21–40 LOW · 41–65 MEDIUM · 66–85 HIGH · 86–100 CRITICAL

## Environment variables
```
PROXY_PORT=4000
TARGET_MCP_URL=http://localhost:3001   # fallback if router has no match
JWT_SECRET=mcp-shield-dev
POLICY_FILE=../policy.yaml
DB_FILE=./audit.db
CORS_ORIGIN=http://localhost:5173
DASHBOARD_URL=http://localhost:5173    # used in access_request.portal_url
```

## Demo scenario
| Agent | Role | Calls | Expected |
|-------|------|-------|----------|
| agent-a | analyst | query_db → db-server, send_email → api-server, delete_record, generate_report → report-server | 3× ALLOW, 1× BLOCK |
| agent-b | untrusted | query_db, list_tables, delete_record | 3× BLOCK — each creates an access request |
| agent-c | analyst | query_db (real token), read_report (forged token, same session), delete_record | ALLOW, HIJACK, BLOCK |

## Dashboard routes
- `/` — main dashboard (Activity Feed, Threat Feed, Risk Panel, Routing Map, Policy Editor)
- `/access` — Access Portal (list all requests, filter, inline approve/deny)
- `/access/:id` — Access Detail (full request info, timeline, approve/deny forms)

## Do NOT do these things
- Do not require changes to mock-servers/ — they must be unmodified pass-through targets
- Do not store JWT secrets in source files — use .env
- Do not add authentication to the /events SSE endpoint (demo only)
- Do not use an ORM — raw better-sqlite3 statements only
- Do not add rate limiting (out of scope for hackathon)
