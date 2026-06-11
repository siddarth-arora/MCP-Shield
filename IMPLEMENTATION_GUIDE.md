# MCP-Shield — Step-by-Step Implementation Guide
# Claude Code Prompts + Commands for Every Phase

---

## Pre-flight setup (do this first, ~10 min)

```bash
# 1. Create monorepo
mkdir mcp-shield && cd mcp-shield
git init

# 2. Create folder structure
mkdir -p proxy/src/{middleware,routes} \
         dashboard/src/{hooks,components,utils} \
         mock-servers \
         demo

# 3. Copy CLAUDE.md and ARCHITECTURE.md into root (from this package)
# These are already generated — just place them here

# 4. Open VS Code
code .

# 5. Open Claude Code terminal
# Run: claude
```

> **Tip:** Keep one terminal with `claude` open at the repo root.
> Open a second terminal tab for running servers.

---

## Phase 1 — Proxy skeleton (Hours 1–2)

### Step 1.1 — Bootstrap proxy package

Run this in the **regular terminal** (not Claude Code):

```bash
cd proxy
npm init -y
npm install fastify @fastify/cors node-fetch dotenv
npm install -D typescript @types/node ts-node-dev
npx tsc --init --target ES2022 --module commonjs \
  --rootDir src --outDir dist --strict --esModuleInterop
```

### Step 1.2 — Bootstrap mock servers

```bash
cd ../mock-servers
npm init -y
npm install fastify
npm install -D typescript @types/node ts-node
```

### 🤖 Claude Code Prompt 1 — Create the mock MCP server

Open `claude` at repo root and run:

```
Create mock-servers/server-a.ts — a minimal Fastify server on port 3001 that
handles POST /mcp with a JSON-RPC 2.0 body. For any request, log the method
and params to console, then respond with:
  { "jsonrpc": "2.0", "id": <same id>, "result": { "ok": true, "echo": <params> } }

Also create mock-servers/server-b.ts doing the same on port 3002.
Add a package.json script "start:a" and "start:b" that run each with ts-node.
```

---

### 🤖 Claude Code Prompt 2 — Create proxy entry point + forwarder

```
Create proxy/src/types.ts with these TypeScript interfaces:
  - JsonRpcRequest: jsonrpc, id, method, params
  - JsonRpcResponse: jsonrpc, id, result?, error?
  - JsonRpcError: code, message, data?
  - AuditEntry: id?, ts, agentId, sessionId, toolName, decision
    ('allow'|'block'|'hijack'), policyRule?, requestHash, latencyMs?
  - AgentClaims: sub, role, session, iat, exp (JWT payload shape)

Then create proxy/src/forwarder.ts:
  - export async function forward(body: JsonRpcRequest, targetUrl: string)
  - Use node-fetch to POST the body to targetUrl with Content-Type application/json
  - Return the parsed JSON response
  - On network error, return a JSON-RPC error: code -32603 "Upstream unavailable"

Then create proxy/src/index.ts:
  - Fastify server, load .env with dotenv
  - Register @fastify/cors with origin from CORS_ORIGIN env var
  - POST /mcp handler: parse body as JsonRpcRequest, forward to TARGET_MCP_URL,
    return the upstream response
  - GET /health: return { status: 'ok', ts: new Date().toISOString() }
  - Listen on PROXY_PORT (default 4000)
  - Log "MCP-Shield proxy listening on :4000" on start
```

---

### Step 1.3 — Create .env

Paste this into `proxy/.env` manually (never commit):

```
PROXY_PORT=4000
TARGET_MCP_URL=http://localhost:3001
JWT_SECRET=mcp-shield-dev
POLICY_FILE=../policy.yaml
DB_FILE=./audit.db
CORS_ORIGIN=http://localhost:5173
```

### Step 1.4 — Verify round-trip

```bash
# Terminal 1: start mock server
cd mock-servers && npx ts-node server-a.ts

# Terminal 2: start proxy
cd proxy && npx ts-node-dev src/index.ts

# Terminal 3: test
curl -s -X POST http://localhost:4000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"ping","arguments":{}}}' \
  | jq .
```

Expected: `{ "result": { "ok": true, "echo": { "name": "ping", ... } } }`
✅ Phase 1 done when this works.

---

## Phase 2 — Session binding + token validation (Hours 2–4)

### Step 2.1 — Install JWT dependency

```bash
cd proxy
npm install jsonwebtoken
npm install -D @types/jsonwebtoken
```

### 🤖 Claude Code Prompt 3 — Session store + auth middleware

```
Create proxy/src/session.ts:

  Interface SessionEntry: agentId, role, token (full JWT string),
  firstSeen (Date), lastSeen (Date), callCount (number)

  export class SessionStore:
    private map: Map<string, SessionEntry>

    bind(sessionId: string, claims: AgentClaims, token: string): void
      - Create new entry and store in map

    verify(sessionId: string, incomingToken: string, incomingAgentId: string):
      { valid: boolean; reason?: string }
      - If session not found: return { valid: true } (first call, will bind next)
      - If stored token !== incomingToken: return { valid: false, reason: 'token_mismatch' }
      - If stored agentId !== incomingAgentId: return { valid: false, reason: 'agent_mismatch' }
      - Else: update lastSeen and callCount, return { valid: true }

    get(sessionId: string): SessionEntry | undefined

  export const sessionStore = new SessionStore()

---

Create proxy/src/middleware/auth.ts as a Fastify preHandler hook:

  1. Read Authorization header → extract Bearer token
     Also accept x-mcp-token header as fallback
     If neither present → return JSON-RPC error: code -32000 "Missing authentication"

  2. jwt.verify(token, process.env.JWT_SECRET) → AgentClaims
     If invalid or expired → return JSON-RPC error: code -32000 "Invalid token"

  3. Read x-session-id header (required)
     If missing → return JSON-RPC error: code -32000 "Missing x-session-id header"

  4. sessionStore.verify(sessionId, token, claims.sub)
     If not valid:
       - Set request.decision = 'hijack'
       - Return JSON-RPC error: code -32002 "Session token hijacking detected"
         with data: { sessionId, expectedAgent: stored.agentId, incomingAgent: claims.sub }

  5. If new session: sessionStore.bind(sessionId, claims, token)

  6. Attach to request: request.agentClaims = claims, request.sessionId = sessionId,
     request.rawToken = token

  Register this as a Fastify preHandler on the POST /mcp route.
```

---

### 🤖 Claude Code Prompt 4 — Generate demo tokens script

```
Create demo/gen-tokens.ts:

  Import jsonwebtoken. Read JWT_SECRET from process.env (load dotenv from ../proxy/.env).

  Generate and console.log 3 JWTs with 24h expiry:

  AGENT_A_TOKEN: { sub: 'agent-a', role: 'analyst',  session: 'demo-session-a' }
  AGENT_B_TOKEN: { sub: 'agent-b', role: 'untrusted', session: 'demo-session-b' }
  AGENT_C_TOKEN: { sub: 'agent-c', role: 'analyst',   session: 'demo-session-c' }

  Print them as:
    export AGENT_A_TOKEN="<token>"
    export AGENT_B_TOKEN="<token>"
    export AGENT_C_TOKEN="<token>"

  So the user can eval the output in their shell.
```

Run it: `cd demo && npx ts-node gen-tokens.ts`

### Step 2.2 — Test session binding

```bash
# Get tokens
eval $(cd demo && npx ts-node gen-tokens.ts)

# First call — should succeed (creates session)
curl -s -X POST http://localhost:4000/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AGENT_A_TOKEN" \
  -H "x-session-id: demo-session-a" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"ping","arguments":{}}}' \
  | jq .

# Swap to Agent B token on same session — should get hijack error
curl -s -X POST http://localhost:4000/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AGENT_B_TOKEN" \
  -H "x-session-id: demo-session-a" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"ping","arguments":{}}}' \
  | jq .
```

✅ Phase 2 done when second call returns `-32002` hijack error.

---

## Phase 3 — Policy engine (Hours 4–6)

### Step 3.1 — Create policy.yaml

Create this at the **repo root** (`mcp-shield/policy.yaml`):

```yaml
# MCP-Shield Policy — edit live during demo (auto-reloads)
roles:
  analyst:
    allowed_tools:
      - query_db
      - read_report
      - list_tables
      - get_schema
    denied_tools:
      - delete_record
      - drop_table
      - export_all
      - bulk_delete

  admin:
    allowed_tools:
      - "*"

  untrusted:
    allowed_tools: []

  readonly:
    allowed_tools:
      - list_tables
      - get_schema
      - read_report
    denied_tools: []
```

### Step 3.2 — Install chokidar

```bash
cd proxy && npm install chokidar js-yaml
npm install -D @types/js-yaml @types/chokidar
```

### 🤖 Claude Code Prompt 5 — Policy engine

```
Create proxy/src/policy.ts:

  Types:
    RolePolicy: { allowed_tools: string[], denied_tools: string[] }
    PolicyFile:  { roles: Record<string, RolePolicy> }

  export class PolicyEngine:

    private policy: PolicyFile = { roles: {} }
    private policyFile: string

    constructor(policyFile: string):
      this.policyFile = policyFile
      this.load()
      this.watchForChanges()

    private load(): void
      - Read policyFile with fs.readFileSync
      - Parse with js-yaml
      - Replace this.policy
      - console.log('[Policy] Loaded', Object.keys(this.policy.roles).length, 'roles')

    private watchForChanges(): void
      - Use chokidar.watch(policyFile, { persistent: false })
      - On 'change' event: this.load(), console.log('[Policy] Hot-reloaded')

    check(role: string, toolName: string):
      { allowed: boolean; reason: string; rule: string }
      
      Algorithm (in order):
      1. If role not in this.policy.roles:
           return { allowed: false, reason: 'Unknown role', rule: 'roles.' + role + '=undefined' }
      
      2. const r = this.policy.roles[role]
         
      3. If r.denied_tools includes toolName:
           return { allowed: false, reason: 'Explicit deny', rule: 'roles.'+role+'.denied_tools' }
      
      4. If r.allowed_tools includes '*':
           return { allowed: true, reason: 'Wildcard allow', rule: 'roles.'+role+'.allowed_tools=*' }
      
      5. If r.allowed_tools includes toolName:
           return { allowed: true, reason: 'Explicit allow', rule: 'roles.'+role+'.allowed_tools' }
      
      6. If r.allowed_tools is empty array:
           return { allowed: false, reason: 'No tools allowed for this role',
                    rule: 'roles.'+role+'.allowed_tools=[]' }
      
      7. return { allowed: false, reason: 'Tool not in allowed list',
                  rule: 'roles.'+role+'.allowed_tools' }

    getRoles(): string[]
      return Object.keys(this.policy.roles)

  export const policyEngine = new PolicyEngine(process.env.POLICY_FILE || '../policy.yaml')
```

---

### 🤖 Claude Code Prompt 6 — Wire policy into request handler

```
Update proxy/src/index.ts POST /mcp handler to:

  After auth middleware has attached request.agentClaims:

  1. Extract toolName = request.body?.params?.name ?? 'unknown'

  2. const { allowed, reason, rule } = policyEngine.check(
       request.agentClaims.role, toolName
     )

  3. If NOT allowed:
     - Immediately return JSON-RPC error response:
       { jsonrpc: '2.0', id: request.body.id,
         error: { code: -32001, message: 'Access denied',
                  data: { agent: agentClaims.sub, role: agentClaims.role,
                          tool: toolName, reason, policy_rule: rule } } }
     - Set a flag request.decision = 'block', request.policyRule = rule
     - Do NOT forward to upstream

  4. If allowed:
     - Forward to upstream (as before)
     - Set request.decision = 'allow', request.policyRule = rule

  5. At the end of every request (use Fastify onResponse hook):
     - Record startTime at request start, compute latencyMs
     - Write audit entry (we'll wire this in Phase 4)
     - For now: console.log the decision as JSON
```

### Step 3.3 — Test policy

```bash
eval $(cd demo && npx ts-node gen-tokens.ts)

# Analyst calling allowed tool — should succeed
curl -s -X POST http://localhost:4000/mcp \
  -H "Authorization: Bearer $AGENT_A_TOKEN" \
  -H "x-session-id: sess-test-1" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"query_db","arguments":{}}}' \
  | jq .

# Untrusted agent — should be blocked
curl -s -X POST http://localhost:4000/mcp \
  -H "Authorization: Bearer $AGENT_B_TOKEN" \
  -H "x-session-id: sess-test-2" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"query_db","arguments":{}}}' \
  | jq .

# Analyst calling denied tool — should be blocked
curl -s -X POST http://localhost:4000/mcp \
  -H "Authorization: Bearer $AGENT_A_TOKEN" \
  -H "x-session-id: sess-test-1" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"delete_record","arguments":{}}}' \
  | jq .
```

✅ Phase 3 done when block returns structured error with `policy_rule` field.

---

## Phase 4 — Audit trail (Hours 6–7)

### Step 4.1 — Install SQLite

```bash
cd proxy
npm install better-sqlite3
npm install -D @types/better-sqlite3
```

### 🤖 Claude Code Prompt 7 — Audit logger + SSE

```
Create proxy/src/audit.ts:

  Import better-sqlite3, crypto (built-in Node), path.
  DB file from process.env.DB_FILE || './audit.db'.

  On module load:
    - Open the DB
    - Run CREATE TABLE IF NOT EXISTS audit_log with this exact schema:
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        ts           TEXT NOT NULL,
        agent_id     TEXT NOT NULL,
        session_id   TEXT NOT NULL,
        tool_name    TEXT NOT NULL,
        decision     TEXT NOT NULL CHECK(decision IN ('allow','block','hijack')),
        policy_rule  TEXT,
        request_hash TEXT NOT NULL,
        latency_ms   INTEGER
    - Prepare the INSERT statement

  Maintain a Set<ServerResponse> called sseClients for SSE connections.

  export function write(entry: Omit<AuditEntry, 'id'>, rawBody: string): AuditEntry
    - Compute request_hash = SHA-256 hex of rawBody string
    - Insert row using prepared statement (synchronous)
    - Get lastInsertRowid as the new id
    - Build complete row object
    - Broadcast to all sseClients:
        clients.forEach(res => res.write('data: ' + JSON.stringify({ type: 'audit', row }) + '\n\n'))
    - Return the complete row

  export function addSseClient(res: ServerResponse): void
    sseClients.add(res)

  export function removeSseClient(res: ServerResponse): void
    sseClients.delete(res)

  export function getRecent(limit = 50): AuditEntry[]
    return db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?').all(limit) as AuditEntry[]

---

Create proxy/src/routes/events.ts as a Fastify plugin:

  Register GET /events:
    - Set headers: Content-Type: text/event-stream, Cache-Control: no-cache,
      Connection: keep-alive, Access-Control-Allow-Origin: CORS_ORIGIN env var
    - Add client to sseClients set
    - On socket close: remove client
    - Send a heartbeat comment every 15s: ": heartbeat\n\n"
    - Send last 50 audit rows immediately on connect (so dashboard populates)
    - Never call reply.send() — keep the connection open

  Register GET /audit/recent: return last 100 rows as JSON array
  Register GET /audit/stats: return { totalCalls, blocked, hijacks, allowRate }
    computed from a single SQL query
```

---

### 🤖 Claude Code Prompt 8 — Wire audit into request lifecycle

```
Update proxy/src/index.ts:

  At the very start of POST /mcp handler, record startTime = Date.now().
  Store rawBody = JSON.stringify(request.body) on the request object.

  Replace the console.log placeholder from Phase 3 with a real audit.write() call.
  Call it in a Fastify onSend or onResponse hook so it runs after BOTH allow and block paths.

  The audit.write call should use:
    ts: new Date().toISOString()
    agent_id: request.agentClaims?.sub ?? 'unknown'
    session_id: request.sessionId ?? 'unknown'
    tool_name: extracted toolName
    decision: request.decision  (set to 'allow', 'block', or 'hijack' earlier)
    policy_rule: request.policyRule
    latency_ms: Date.now() - startTime
    rawBody: request.rawBody

  Also register the /events route from routes/events.ts.
```

### Step 4.2 — Verify audit trail

```bash
# Run a few test calls, then:
sqlite3 proxy/audit.db "SELECT ts, agent_id, tool_name, decision FROM audit_log ORDER BY id DESC LIMIT 10;"
```

✅ Phase 4 done when every test call shows up as a row.

---

## Phase 5 — Dashboard (Hours 7–9)

### Step 5.1 — Bootstrap React app

```bash
cd dashboard
npm create vite@latest . -- --template react-ts
npm install recharts
npm install -D tailwindcss @types/node
npx tailwindcss init
```

### 🤖 Claude Code Prompt 9 — SSE hook + types

```
Create dashboard/src/types.ts matching the AuditEntry interface from the proxy.

Create dashboard/src/hooks/useAuditStream.ts:

  export function useAuditStream(url: string): { rows: AuditEntry[], connected: boolean }

  - Use useState for rows (AuditEntry[]) and connected (boolean)
  - Use useEffect to create an EventSource to url
    - On open: setConnected(true)
    - On error: setConnected(false)
    - On message: parse JSON, prepend row to rows, keep max 200 entries
    - Return cleanup function that closes the EventSource
  - Return { rows, connected }
```

---

### 🤖 Claude Code Prompt 10 — Dashboard components

```
Create dashboard/src/components/StatsBar.tsx:
  Props: rows: AuditEntry[]
  Compute and display in a flex row:
    - Total calls (count of rows)
    - Allowed (green badge)
    - Blocked (red badge)
    - Hijacks (amber badge)
    - Allow rate as a percentage
  Use simple div/span elements with inline Tailwind classes.

Create dashboard/src/components/ActivityFeed.tsx:
  Props: rows: AuditEntry[]
  Show last 20 rows as a scrollable list.
  Each row shows: [timestamp] [agent_id] → [tool_name] → [ALLOW/BLOCK/HIJACK badge]
  Color-code the left border: green for allow, red for block, amber for hijack.
  Newest entry at the top.
  Add a subtle pulse animation on the most recent entry.

Create dashboard/src/components/ViolationAlert.tsx:
  Props: row: AuditEntry
  Show as a red/amber card with: icon, agent name, tool name, reason (policy_rule).
  Used to display the last 5 block/hijack events prominently.

Create dashboard/src/components/SessionTimeline.tsx:
  Props: rows: AuditEntry[]
  Group rows by agent_id.
  For each agent, show a horizontal bar with colored dots for each call
  (green dot = allow, red = block, amber = hijack).
  Use recharts ScatterChart or just CSS flex dots — keep it simple.

Create dashboard/src/App.tsx:
  - Use useAuditStream('http://localhost:4000/events')
  - Show a connection status indicator (green dot or gray)
  - Layout: StatsBar at top, then 2-column: ActivityFeed left, ViolationAlerts right
  - SessionTimeline below
  - Title: "MCP-Shield — Compliance Dashboard"
  - Dark-friendly color scheme using gray-900/gray-800 backgrounds
```

### Step 5.2 — Run dashboard

```bash
cd dashboard && npm run dev
# Open http://localhost:5173
```

---

## Phase 6 — Demo scripts (Hours 9–10)

### 🤖 Claude Code Prompt 11 — Demo agent scripts

```
Create demo/agent-a.ts — authorized analyst:

  Load dotenv from ../proxy/.env.
  Read AGENT_A_TOKEN from environment (must be set via gen-tokens.ts).
  
  Run 3 sequential calls with 1 second delay between each:
    Call 1: tool=query_db       (should: ALLOW)
    Call 2: tool=list_tables    (should: ALLOW)
    Call 3: tool=delete_record  (should: BLOCK — in denied_tools)
  
  For each call, pretty-print: "→ [tool] ... [ALLOWED/BLOCKED]: [result or error.data.reason]"
  Use a consistent session ID: 'demo-session-a'

Create demo/agent-b.ts — untrusted agent:

  Run 2 sequential calls:
    Call 1: tool=query_db    (should: BLOCK — untrusted has no allowed tools)
    Call 2: tool=read_report (should: BLOCK)
  Session ID: 'demo-session-b'

Create demo/agent-c.ts — token hijack simulation:

  Step 1: Make 1 normal call with AGENT_A_TOKEN on session 'demo-session-c'
           (should: ALLOW)
  Step 2: Wait 500ms
  Step 3: Make same call with AGENT_B_TOKEN on the same session ID 'demo-session-c'
           (should: HIJACK DETECTED — token changed mid-session)
  
  Print the hijack error response clearly.

Create demo/run-demo.sh:
  #!/bin/bash
  echo "=== MCP-Shield Demo Scenario ==="
  echo ""
  echo "--- Agent A (Analyst role) ---"
  npx ts-node agent-a.ts
  echo ""
  echo "--- Agent B (Untrusted role) ---"
  npx ts-node agent-b.ts
  echo ""
  echo "--- Agent C (Token hijack) ---"
  npx ts-node agent-c.ts
  echo ""
  echo "=== Check dashboard at http://localhost:5173 ==="
```

---

### 🤖 Claude Code Prompt 12 — README for judges

```
Create README.md at the repo root with:

  # MCP-Shield

  One-paragraph pitch (use the project description from the hackathon brief).

  ## Quick start (3 commands)
  
  ## What it does (3 bullet points)

  ## Demo scenario
    Show the exact 4 events the demo produces and what they prove.

  ## Architecture (one-paragraph prose, no diagram — diagram is in ARCHITECTURE.md)

  ## Security properties table (copy from ARCHITECTURE.md)

  ## Tech stack list

  Keep it to 1 page. Judges read fast.
```

---

## Final wiring checklist

Before the demo, run through this in order:

```bash
# Terminal 1 — Mock MCP server
cd mock-servers && npx ts-node server-a.ts

# Terminal 2 — Proxy
cd proxy && npx ts-node-dev src/index.ts

# Terminal 3 — Dashboard
cd dashboard && npm run dev

# Terminal 4 — Generate tokens + run demo
cd demo
eval $(npx ts-node gen-tokens.ts)
bash run-demo.sh
```

Open http://localhost:5173 — you should see 6 events populate:
- 2 green (agent-a allowed calls)
- 1 red (agent-a trying delete_record)
- 2 red (agent-b blocked)
- 1 amber (agent-c hijack)

Dashboard updates live as each call hits the proxy. ✅

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Cannot find module 'better-sqlite3'` | Run `npm install better-sqlite3` in proxy/ |
| JWT verify fails | Check JWT_SECRET in proxy/.env matches what gen-tokens.ts uses |
| SSE disconnects immediately | Ensure the Fastify route never calls `reply.send()` |
| CORS errors in dashboard | Check CORS_ORIGIN in proxy/.env = `http://localhost:5173` |
| Policy not hot-reloading | Check POLICY_FILE path is relative to where `ts-node-dev` runs |
| SQLite locked error | Only one process should open audit.db — don't run two proxies |

---

## Claude Code power tips

**When stuck on a specific file, use this prompt pattern:**
```
Look at proxy/src/index.ts and proxy/src/session.ts.
The auth middleware is not attaching agentClaims to the request object.
Here is the error: [paste error].
Fix it without changing the session binding logic.
```

**For the dashboard styling:**
```
Look at dashboard/src/components/ActivityFeed.tsx.
Make the component look like a real-time security console — dark background,
monospace font for agent IDs and tool names, green/red/amber left borders.
Use only Tailwind utility classes. No external component libraries.
```

**For any TypeScript type errors:**
```
Fix all TypeScript errors in proxy/src/ without changing runtime behavior.
Run the types strictly — do not use 'any'.
```
