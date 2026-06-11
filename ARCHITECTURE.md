# MCP-Shield Architecture

## System overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        AI Agent Layer                           │
│   Agent A (JWT: analyst)   Agent B (JWT: untrusted)  Agent C   │
└────────────┬───────────────────────┬───────────────────┬───────┘
             │  POST /mcp            │                   │
             │  Authorization: Bearer│<jwt>              │
             ▼                       ▼                   ▼
┌─────────────────────────────────────────────────────────────────┐
│               MCP-Shield Gateway  :4000  (Fastify)              │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐   │
│  │  RPC Parser  │→ │Session Binder│→ │   Policy Engine    │   │
│  │ JSON-RPC 2.0 │  │ JWT + Map    │  │ YAML role×tool     │   │
│  └──────────────┘  └──────────────┘  └────────┬───────────┘   │
│                                               │                 │
│                            ┌──────────────────┴──────────┐     │
│                            ▼ ALLOW              BLOCK ▼   │     │
│                    ┌───────────────┐    ┌───────────────┐ │     │
│                    │  Forwarder    │    │  403 Builder  │ │     │
│                    │ http-proxy    │    │ structured err│ │     │
│                    └───────┬───────┘    └───────────────┘ │     │
│                            │                              │     │
│                    ┌───────▼───────────────────────────┐  │     │
│                    │        Audit Logger               │  │     │
│                    │  SQLite append + SSE broadcast    │  │     │
│                    └───────────────────────────────────┘  │     │
└────────────────────────────┬────────────────────────────────────┘
                             │
             ┌───────────────┼───────────────┐
             ▼               ▼               ▼
     ┌──────────────┐ ┌────────────┐ ┌────────────┐
     │ DB MCP :3001 │ │API MCP :3002│ │Tool MCP    │
     │ (mock)       │ │(mock)      │ │:3003(mock) │
     └──────────────┘ └────────────┘ └────────────┘
             
                    SSE  GET /events
                         │
             ┌───────────▼───────────────────┐
             │    React Dashboard  :5173      │
             │  Activity feed  │  Violations  │
             │  Session timeline│  Stats      │
             └───────────────────────────────┘
```

## Phase-by-phase build plan

### Phase 1 — Proxy skeleton

**Goal:** Fastify server receives any JSON-RPC POST and forwards it unchanged to a mock MCP server. Proves round-trip works before adding any logic.

**Files to create:**
```
proxy/
  package.json
  tsconfig.json
  .env
  src/
    index.ts        ← Fastify server, registers routes
    forwarder.ts    ← HTTP forward using node-fetch or axios
    types.ts        ← Shared TypeScript interfaces
mock-servers/
  server-a.ts      ← Minimal JSON-RPC responder on :3001
```

**Acceptance test:**
```bash
curl -X POST http://localhost:4000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"ping","arguments":{}}}'
# Should get back the mock server's response
```

---

### Phase 2 — Session binding + token validation

**Goal:** Every request must carry a valid JWT. The first request in a session binds `sessionId → agentId`. Any subsequent request with a different agent identity gets rejected.

**Files to create/modify:**
```
proxy/src/
  session.ts      ← SessionMap class, bind(), verify(), detect hijack
  middleware/
    auth.ts       ← Fastify preHandler: extract + verify JWT
demo/
  gen-tokens.ts   ← Script to generate demo JWTs
```

**Session Map structure:**
```typescript
interface SessionEntry {
  agentId: string;
  role: string;
  token: string;        // full JWT string, for exact-match comparison
  firstSeen: Date;
  lastSeen: Date;
  callCount: number;
}
const sessions = new Map<string, SessionEntry>();
```

**Hijack detection logic:**
```
IF session exists AND incoming token !== stored token
  → decision = 'hijack', return error -32002
IF session exists AND incoming agentId !== stored agentId
  → decision = 'hijack', return error -32002
ELSE IF session new
  → bind and continue
```

**Token extraction:** Look for `Authorization: Bearer <token>` header OR `x-mcp-token` header (fallback for MCP clients that don't use standard auth).

---

### Phase 3 — Policy engine

**Goal:** Check every tool call against `policy.yaml`. Return structured 403 on violation.

**Files to create/modify:**
```
policy.yaml             ← Root of repo
proxy/src/
  policy.ts            ← load(), check(), hot-reload watcher
```

**Policy check algorithm:**
```
function check(role, toolName):
  rules = policy.roles[role]
  IF rules is undefined → BLOCK ("unknown role")
  
  IF toolName in rules.denied_tools → BLOCK ("explicit deny")
  
  IF rules.allowed_tools == ["*"] → ALLOW
  IF toolName in rules.allowed_tools → ALLOW
  
  → BLOCK ("not in allowed list")
```

**Hot reload:** Use `chokidar.watch(POLICY_FILE)` on `change` event → re-parse yaml → replace in-memory policy object. Log "Policy reloaded" to console. This lets you edit policy.yaml live during the demo without restarting.

**Sample policy for demo:**
```yaml
roles:
  analyst:
    allowed_tools:
      - query_db
      - read_report
      - list_tables
    denied_tools:
      - delete_record
      - drop_table
      - export_all

  admin:
    allowed_tools:
      - "*"

  untrusted:
    allowed_tools: []
```

---

### Phase 4 — Audit trail

**Goal:** Every decision (allow, block, hijack) writes one row to SQLite. Hash the request body for tamper-evidence. Broadcast via SSE.

**Files to create/modify:**
```
proxy/src/
  audit.ts            ← DB init, write(), broadcastSSE()
  routes/events.ts    ← GET /events SSE endpoint
```

**Write flow:**
```typescript
async function write(entry: AuditEntry) {
  // 1. Compute SHA-256 of full raw request body
  const hash = crypto.createHash('sha256').update(rawBody).digest('hex');
  
  // 2. Insert row (synchronous with better-sqlite3)
  db.prepare(`INSERT INTO audit_log VALUES (?,?,?,?,?,?,?,?,?)`).run(...);
  
  // 3. Broadcast to all SSE clients
  sseClients.forEach(res => {
    res.write(`data: ${JSON.stringify({ type: 'audit', row: entry })}\n\n`);
  });
}
```

**SSE endpoint:**
```typescript
fastify.get('/events', (req, reply) => {
  reply.raw.writeHead(200, {
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection':    'keep-alive',
    'Access-Control-Allow-Origin': process.env.CORS_ORIGIN,
  });
  sseClients.add(reply.raw);
  req.socket.on('close', () => sseClients.delete(reply.raw));
  
  // Send last 50 rows on connect (dashboard catches up)
  const recent = db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 50').all();
  recent.reverse().forEach(row =>
    reply.raw.write(`data: ${JSON.stringify({ type: 'audit', row })}\n\n`)
  );
});
```

---

### Phase 5 — Dashboard UI

**Goal:** React app consuming SSE, showing live feed, violations, session timeline.

**Files to create:**
```
dashboard/
  package.json
  vite.config.ts
  src/
    App.tsx
    hooks/
      useAuditStream.ts    ← EventSource wrapper, returns rows[]
    components/
      ActivityFeed.tsx     ← Scrolling list of recent calls
      ViolationAlert.tsx   ← Red card for blocks/hijacks
      SessionTimeline.tsx  ← recharts timeline per agent
      StatsBar.tsx         ← Total calls / blocks / agents today
    utils/
      format.ts            ← Date formatting, decision color map
```

**useAuditStream hook:**
```typescript
export function useAuditStream(url: string) {
  const [rows, setRows] = useState<AuditRow[]>([]);
  
  useEffect(() => {
    const es = new EventSource(url);
    es.onmessage = (e) => {
      const { row } = JSON.parse(e.data);
      setRows(prev => [row, ...prev].slice(0, 200)); // keep last 200
    };
    return () => es.close();
  }, [url]);
  
  return rows;
}
```

**Decision color map:**
```typescript
const DECISION_COLOR = {
  allow:  { bg: 'bg-green-50',  text: 'text-green-800',  badge: '✓ Allowed' },
  block:  { bg: 'bg-red-50',    text: 'text-red-800',    badge: '✗ Blocked' },
  hijack: { bg: 'bg-amber-50',  text: 'text-amber-800',  badge: '⚠ Hijack'  },
};
```

---

### Phase 6 — Demo scripts

**Goal:** Three self-contained scripts that run the exact demo scenario.

**Files to create:**
```
demo/
  gen-tokens.ts      ← Generate and print all demo JWTs
  agent-a.ts         ← Authorized analyst, calls query_db
  agent-b.ts         ← Untrusted, calls query_db → blocked
  agent-c.ts         ← Token swap mid-session → hijack
  run-demo.sh        ← Shell script: start all, run sequence, show output
```

**agent-b.ts pattern:**
```typescript
const res = await fetch('http://localhost:4000/mcp', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${AGENT_B_TOKEN}`,
    'x-session-id': 'demo-session-b',
  },
  body: JSON.stringify({
    jsonrpc: '2.0', id: 1,
    method: 'tools/call',
    params: { name: 'query_db', arguments: { sql: 'SELECT * FROM users' } }
  })
});
console.log(await res.json());
// Expected: { error: { code: -32001, message: 'Access denied', data: {...} } }
```

---

## Request lifecycle (detailed)

```
1.  Agent sends POST /mcp with JSON-RPC body + JWT header

2.  Fastify content-type parser reads raw body string (needed for SHA-256)

3.  auth middleware:
    a. Extract Bearer token
    b. jwt.verify(token, JWT_SECRET) → decoded claims
    c. If invalid/expired → return JSON-RPC error -32000 "Unauthenticated"

4.  session middleware:
    a. sessions.get(sessionId)?
    b. New session → sessions.set(sessionId, { agentId, role, token, ... })
    c. Existing session + token mismatch → 'hijack', skip to step 7

5.  Policy engine:
    a. toolName = body.params?.name
    b. policy.check(role, toolName) → { allowed, rule }
    c. If blocked → decision = 'block', skip to step 7

6.  Forward to MCP server:
    a. forwarder.send(body, targetUrl) → response
    b. decision = 'allow'
    c. Return MCP server response to agent

7.  Audit write:
    a. audit.write({ ts, agentId, sessionId, toolName, decision, rule, hash, latency })
    b. SSE broadcast to dashboard

8.  If blocked/hijack: return JSON-RPC error body with structured data
```

## Security properties achieved

| Threat | Mitigation |
|--------|-----------|
| Unauthorized tool call | Policy engine blocks unknown roles and denied tools |
| Token hijacking | Session binding detects token swap mid-session |
| Post-hoc denial | SHA-256 request hash in audit log proves what was sent |
| Policy drift | YAML-as-code, version-controlled, hot-reloaded |
| Silent bypass | All traffic must flow through proxy — no direct MCP access in demo |

## Port map
| Service | Port |
|---------|------|
| MCP-Shield proxy | 4000 |
| Mock MCP server A (DB) | 3001 |
| Mock MCP server B (API) | 3002 |
| React dashboard | 5173 |
