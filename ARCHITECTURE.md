# MCP-Shield Architecture

## System overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            AI Agent Layer                               │
│  Agent A (analyst)       Agent B (untrusted)      Agent C (analyst)    │
│  POST /mcp + JWT         POST /mcp + JWT          POST /mcp + JWT      │
└──────────┬───────────────────────┬───────────────────────┬─────────────┘
           │                       │                       │
           ▼                       ▼                       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                   MCP-Shield Gateway  :4000  (Fastify v5)               │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     preHandler chain                            │   │
│  │                                                                 │   │
│  │  ┌──────────────┐   ┌────────────────┐   ┌──────────────────┐  │   │
│  │  │  JWT Verify  │ → │ Session Binder │ → │  Policy Engine   │  │   │
│  │  │ auth.ts      │   │ auth.ts        │   │  policy.ts       │  │   │
│  │  │              │   │                │   │  role × tool     │  │   │
│  │  │ Extracts:    │   │ Binds sess-id  │   │  check()         │  │   │
│  │  │ sub, role,   │   │ to token hash. │   │                  │  │   │
│  │  │ session      │   │ Token swap →   │   │  denied_tools    │  │   │
│  │  │              │   │ HIJACK         │   │  beats allowed   │  │   │
│  │  └──────────────┘   └────────────────┘   └────────┬─────────┘  │   │
│  └──────────────────────────────────────────────────────────────── ┘   │
│                                                        │                │
│                              ┌─────────────────────────┴──────────┐    │
│                              ▼ ALLOW                    BLOCK ▼    │    │
│                     ┌─────────────────┐        ┌─────────────────┐ │    │
│                     │    Router       │        │  AccessRequest  │ │    │
│                     │  router.ts      │        │  access-        │ │    │
│                     │                │        │  requests.ts    │ │    │
│                     │ tool → server  │        │                 │ │    │
│                     │ via policy     │        │ MCPA-XXX-XXXXX  │ │    │
│                     │ .routes +      │        │ auto-created,   │ │    │
│                     │ .servers       │        │ ID in 403 body  │ │    │
│                     └────────┬───────┘        └─────────────────┘ │    │
│                              │                                     │    │
│                     ┌────────▼───────┐                            │    │
│                     │   Forwarder    │                            │    │
│                     │  forwarder.ts  │                            │    │
│                     │  node-fetch    │                            │    │
│                     └────────┬───────┘                            │    │
│                              │                                     │    │
│  ┌───────────────────────────▼─────────────────────────────────┐  │    │
│  │                    onResponse hook                           │  │    │
│  │                                                             │  │    │
│  │   audit.write(entry, rawBody)                               │  │    │
│  │      │                                                      │  │    │
│  │      ├─ SQLite INSERT (better-sqlite3, synchronous)         │  │    │
│  │      ├─ SSE broadcast  { type: "audit", row }              │  │    │
│  │      ├─ threatDetector.analyze() → SSE { type: "threat" }  │  │    │
│  │      └─ riskScorer.update()     → SSE { type: "risk" }     │  │    │
│  └─────────────────────────────────────────────────────────────┘  │    │
└─────────────────────────────────────────────────────────────────────────┘
           │  SSE  GET /events            │  HTTP
           │                             │
    ┌──────▼──────────────────┐   ┌──────┴────────────────────────────────┐
    │  React Dashboard :5173  │   │         MCP Servers (mock)            │
    │                         │   │                                        │
    │  /          Dashboard   │   │  :3001  db-server     server-a.ts     │
    │  /access    Portal      │   │  :3002  api-server    server-b.ts     │
    │  /access/:id Detail     │   │  :3003  report-server server-c.ts     │
    │                         │   └────────────────────────────────────────┘
    │  ActivityFeed           │
    │  ThreatFeed             │
    │  RiskPanel (gauges)     │
    │  RoutingMap             │
    │  PolicyEditor           │
    │  AccessPortal           │
    └─────────────────────────┘
```

---

## Component breakdown

### Proxy (proxy/src/)

| File | Role |
|------|------|
| `index.ts` | Fastify server, all route registrations, `onResponse` audit hook |
| `middleware/auth.ts` | JWT verify → session bind → hijack detect; augments `FastifyRequest` |
| `policy.ts` | Parses `policy.yaml`, exposes `check(role, tool)`, hot-reloads via chokidar |
| `router.ts` | Maps tool names to named servers via `policy.routes` + `policy.servers`; falls back to `TARGET_MCP_URL` |
| `forwarder.ts` | `node-fetch` POST to resolved MCP server URL |
| `audit.ts` | `write()` → SQLite INSERT → SSE broadcast; `getRecent/Stats/Threats/RiskScores`; SSE client registry |
| `threat-detector.ts` | Rolling timestamp windows per agent; emits `ThreatEvent` for probing, hijack, rate abuse, repeated violations |
| `risk-scorer.ts` | 0–100 score per agent; +40 hijack, +15 sensitive block, +8 block, −1 allow |
| `access-requests.ts` | CRUD for `AccessRequest` records in SQLite; `resolve(APPROVED)` patches `policy.yaml` in-place |
| `routes/events.ts` | SSE endpoint — flushes backlog on connect, 15s heartbeat |
| `routes/policy.ts` | `GET/POST /policy`, `GET /policy/simulate` |
| `types.ts` | `AuditEntry`, `AgentClaims`, `JsonRpcRequest/Response` |

### Dashboard (dashboard/src/)

| File | Role |
|------|------|
| `main.tsx` | `BrowserRouter` + route table (`/`, `/access`, `/access/:id`) |
| `App.tsx` | Main dashboard layout — StatsBar, RiskPanel, ActivityFeed, ThreatFeed, RoutingMap, PolicyEditor |
| `hooks/useAuditStream.ts` | `EventSource` wrapper; returns `{ rows, threats, riskScores, accessRequests, connected }` |
| `pages/AccessPortal.tsx` | Lists all access requests; filter tabs; inline approve/deny; live SSE updates |
| `pages/AccessDetail.tsx` | Single request detail; timeline; approve/deny forms; live SSE update on resolution |
| `components/ActivityFeed.tsx` | Scrolling audit rows — decision badge + access request pill for blocks |
| `components/ThreatFeed.tsx` | Threat event cards, severity-colored borders |
| `components/RiskPanel.tsx` | Grid of `RiskGauge` SVG semicircles per agent |
| `components/RiskGauge.tsx` | SVG arc gauge `M 10 70 A 50 50 0 0 1 110 70`, sweep proportional to score |
| `components/RoutingMap.tsx` | Server cards with live call counts + routing table with flash on live call |
| `components/PolicyEditor.tsx` | Role cards, save button, what-if simulator (`GET /policy/simulate`) |

---

## Request lifecycle

```
1. Agent sends POST /mcp
   Headers: Authorization: Bearer <jwt>
            x-session-id: sess-abc

2. auth preHandler:
   a. Extract Bearer token
   b. jwt.verify(token, JWT_SECRET) → { sub, role, session }
   c. Compute SHA-256 of token → tokenHash
   d. sessions.get(sessionId)?
      - New session       → bind { agentId, tokenHash }
      - Known, same hash  → OK
      - Known, diff hash  → request.decision = 'hijack', reply 403

3. Policy engine:
   toolName = body.params.name
   policyEngine.check(role, toolName)
   → { allowed: false, reason, rule } → request.decision = 'block'
   → { allowed: true }               → continue

4a. BLOCK path:
    - SHA-256(rawBody) for cross-reference with audit log
    - accessRequests.create(...)  → MCPA-XXX-XXXXX
    - request.accessRequestId = id
    - Return JSON-RPC error -32001 with access_request field
    - SSE: { type: "access_request", request }

4b. ALLOW path:
    - router.resolve(toolName) → { serverName, url }
    - request.targetServer = serverName
    - forward(body, url + "/mcp") → result
    - Return result to agent

5. onResponse hook (runs after reply is sent):
   - audit.write({ ts, agentId, sessionId, toolName, decision,
                   policyRule, latency_ms, targetServer, accessRequestId },
                  rawBody)
   - SQLite INSERT (synchronous)
   - SSE: { type: "audit", row }
   - threatDetector.analyze(row) → ThreatEvent?
     → SSE: { type: "threat", threat }
   - riskScorer.update(row) → AgentRiskState
     → SSE: { type: "risk", agentId, state }
```

---

## Access request lifecycle

```
Block event
    ↓
accessRequests.create()  →  PENDING record in SQLite
    ↓
SSE broadcast  { type: "access_request" }
    ↓
Dashboard header shows "N pending" badge (links to /access)
ActivityFeed row shows "MCPA-... →" pill
    ↓
Reviewer opens /access  →  AccessPortal lists all PENDING
Reviewer opens /access/:id  →  AccessDetail shows full info
    ↓
POST /access-requests/:id/resolve  { status: "APPROVED", resolvedBy, note }
    ↓
APPROVED path:
  policyEngine.getPolicy()           ← read live policy
  add toolName to role.allowed_tools
  remove from role.denied_tools if present
  write YAML back to POLICY_FILE
  chokidar detects change → hot-reload
    ↓
SSE broadcast  { type: "access_request", request }  (status: APPROVED)
Dashboard updates in place (portal + detail page)
```

---

## Session hijack detection

```
Session ID (x-session-id header) is bound to the SHA-256 of the JWT
on the first request in that session.

If a subsequent request presents a different JWT for the same session ID:
  → decision = 'hijack'
  → audit row written with decision='hijack'
  → ThreatEvent generated: SESSION_HIJACKING / CRITICAL
  → Risk score +40
  → Dashboard shows amber card in Threat Feed

Demo: agent-c makes first call with real token (binds sess-c),
then sends a forged JWT (sub: agent-x, same secret) on the same
session → proxy catches the token hash mismatch.
```

---

## Security properties

| Threat | Mitigation |
|--------|-----------|
| Unauthorized tool call | Policy engine blocks unknown roles + denied tools; zero trust on role |
| Session token hijacking | Session map binds sess-id → token hash; any swap detected instantly |
| Probing / enumeration | Threat detector flags ≥4 blocks in 30s across ≥3 tools |
| Repeated violations | Repeated blocks on same tool → REPEATED_VIOLATION alert |
| Rate abuse | ≥10 calls in 10s → RATE_ABUSE alert |
| Audit tampering | SHA-256 of full request body stored in audit log; append-only SQLite |
| Policy drift | YAML-as-code, version-controlled, changes logged |
| Silent tool bypass | All agent traffic must traverse the proxy; mock servers not directly accessible in demo |
| Access creep | Approvals write directly to policy.yaml and are SSE-broadcast; no silent grants |

---

## Port map

| Service | Port | File |
|---------|------|------|
| MCP-Shield proxy | 4000 | `proxy/src/index.ts` |
| React dashboard | 5173 | `dashboard/` |
| Mock db-server | 3001 | `mock-servers/server-a.ts` |
| Mock api-server | 3002 | `mock-servers/server-b.ts` |
| Mock report-server | 3003 | `mock-servers/server-c.ts` |

---

## SSE event reference

All events delivered on `GET http://localhost:4000/events` as `text/event-stream`.

```
data: { "type": "audit",          "row": AuditEntry }
data: { "type": "threat",         "threat": ThreatEvent }
data: { "type": "risk",           "agentId": string, "state": AgentRiskState }
data: { "type": "access_request", "request": AccessRequest }
```

On connect the server immediately flushes:
- Last 50 audit rows (oldest first)
- Last 20 threat events
- All current risk scores
- All PENDING access requests
