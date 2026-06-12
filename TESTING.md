# MCP-Shield — Complete Testing Guide

All commands run from the repo root unless otherwise noted.
Every `curl` test assumes the proxy is on `:4000` and the dashboard on `:5173`.

---

## 1. Start the stack

### Option A — one command (recommended for demos)
```bash
bash demo/run-demo.sh
```
This starts all mock servers, the proxy, generates tokens, and fires the agent-a sequence automatically.

Open the dashboard in a second terminal:
```bash
cd dashboard && npm run dev
# → http://localhost:5173
```

### Option B — manually (for step-by-step testing)

**Terminal 1 — mock servers**
```bash
cd mock-servers
npx ts-node server-a.ts &   # :3001  db-server
npx ts-node server-b.ts &   # :3002  api-server
npx ts-node server-c.ts &   # :3003  report-server
```

**Terminal 2 — proxy**
```bash
cd proxy && npm run dev
```
Expected output:
```
{"level":"info","msg":"Server listening at http://0.0.0.0:4000"}
proxy listening on http://0.0.0.0:4000
```

**Terminal 3 — dashboard**
```bash
cd dashboard && npm run dev
# → http://localhost:5173
```

**Terminal 4 — generate tokens (keep this shell alive)**
```bash
cd demo
eval "$(npx ts-node gen-tokens.ts)"
echo $AGENT_A_TOKEN   # should print a JWT
```

---

## 2. Health check

```bash
curl http://localhost:4000/health
```
Expected:
```json
{"status":"ok"}
```

---

## 3. Mock server smoke test

Confirm each mock server responds before the proxy is involved:
```bash
curl -s -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"ping","arguments":{}}}' \
  | python3 -m json.tool

curl -s -X POST http://localhost:3002/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"ping","arguments":{}}}' \
  | python3 -m json.tool

curl -s -X POST http://localhost:3003/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"ping","arguments":{}}}' \
  | python3 -m json.tool
```
Expected (server-c example):
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": { "ok": true, "server": "report-server", "echo": { "name": "ping", "arguments": {} } }
}
```

---

## 4. JWT authentication

### 4a. No token → rejected
```bash
curl -s -X POST http://localhost:4000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"query_db","arguments":{}}}' \
  | python3 -m json.tool
```
Expected: HTTP 401, JSON-RPC error about missing/invalid token.

### 4b. Tampered token → rejected
```bash
curl -s -X POST http://localhost:4000/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJoYWNrZXIifQ.bad" \
  -H "x-session-id: sess-hack" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"query_db","arguments":{}}}' \
  | python3 -m json.tool
```
Expected: JWT verification error.

### 4c. Valid token → processed
```bash
curl -s -X POST http://localhost:4000/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AGENT_A_TOKEN" \
  -H "x-session-id: sess-a" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"query_db","arguments":{}}}' \
  | python3 -m json.tool
```
Expected:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": { "ok": true, "server": "db-server", "echo": { "name": "query_db", "arguments": {} } }
}
```

---

## 5. Policy enforcement

### 5a. ALLOW — analyst calling permitted tool
```bash
curl -s -X POST http://localhost:4000/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AGENT_A_TOKEN" \
  -H "x-session-id: sess-a" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"send_email","arguments":{}}}' \
  | python3 -m json.tool
```
Expected: `result.server = "api-server"` — routed to the correct upstream.

### 5b. BLOCK — analyst calling denied tool
```bash
curl -s -X POST http://localhost:4000/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AGENT_A_TOKEN" \
  -H "x-session-id: sess-a" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"delete_record","arguments":{}}}' \
  | python3 -m json.tool
```
Expected:
```json
{
  "error": {
    "code": -32001,
    "message": "Access denied",
    "data": {
      "tool": "delete_record",
      "reason": "Tool 'delete_record' is explicitly denied for role 'analyst'",
      "access_request": {
        "id": "MCPA-...",
        "portal_url": "http://localhost:5173/access/MCPA-...",
        "message": "To request access, visit go/mcpaccess with ID MCPA-..."
      }
    }
  }
}
```

### 5c. BLOCK — untrusted role (zero tools allowed)
```bash
curl -s -X POST http://localhost:4000/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AGENT_B_TOKEN" \
  -H "x-session-id: sess-b" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"query_db","arguments":{}}}' \
  | python3 -m json.tool
```
Expected: error code -32001, `policy_rule: "roles.untrusted.allowed_tools=[]"`, access_request field present.

---

## 6. Session hijack detection

**Step 1 — bind the session**
```bash
curl -s -X POST http://localhost:4000/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AGENT_C_TOKEN" \
  -H "x-session-id: sess-hijack-test" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"query_db","arguments":{}}}' \
  | python3 -m json.tool
```
Expected: `result.ok = true` (session bound).

**Step 2 — swap the token on the same session**
```bash
curl -s -X POST http://localhost:4000/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AGENT_B_TOKEN" \
  -H "x-session-id: sess-hijack-test" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"query_db","arguments":{}}}' \
  | python3 -m json.tool
```
Expected: error about session hijack / token mismatch, `decision: "hijack"` in the audit log.

---

## 7. Multi-target routing

Each tool should reach the correct upstream server:
```bash
# query_db → db-server (:3001)
curl -s -X POST http://localhost:4000/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AGENT_A_TOKEN" \
  -H "x-session-id: sess-routing" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"query_db","arguments":{}}}' \
  | python3 -m json.tool
# → result.server = "db-server"

# send_email → api-server (:3002)
curl -s -X POST http://localhost:4000/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AGENT_A_TOKEN" \
  -H "x-session-id: sess-routing" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"send_email","arguments":{}}}' \
  | python3 -m json.tool
# → result.server = "api-server"

# generate_report → report-server (:3003)
curl -s -X POST http://localhost:4000/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AGENT_A_TOKEN" \
  -H "x-session-id: sess-routing" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"generate_report","arguments":{}}}' \
  | python3 -m json.tool
# → result.server = "report-server"
```

Verify the routing table matches:
```bash
curl -s http://localhost:4000/routes | python3 -m json.tool
curl -s http://localhost:4000/servers | python3 -m json.tool
```

---

## 8. Audit log

### 8a. Recent rows via API
```bash
curl -s http://localhost:4000/audit/recent | python3 -m json.tool
```
Verify: rows contain `ts`, `agent_id`, `tool_name`, `decision`, `target_server`, `access_request_id` (non-null for blocks).

### 8b. Stats
```bash
curl -s http://localhost:4000/audit/stats | python3 -m json.tool
```
Expected shape:
```json
{ "totalCalls": N, "blocked": N, "hijacks": N, "allowRate": 0.xx }
```

### 8c. Direct SQLite inspection
```bash
sqlite3 proxy/audit.db \
  "SELECT ts, agent_id, tool_name, decision, target_server, access_request_id \
   FROM audit_log ORDER BY id DESC LIMIT 10;" \
  -column -header
```

---

## 9. SSE stream

```bash
curl -N http://localhost:4000/events
```
Leave this running. In another terminal, fire a call — you should see events print live:
```
data: {"type":"audit","row":{...}}
data: {"type":"risk","agentId":"agent-a","state":{...}}
```

Fire a block to see the access_request event:
```bash
curl -s -X POST http://localhost:4000/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AGENT_B_TOKEN" \
  -H "x-session-id: sess-sse-test" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"query_db","arguments":{}}}' > /dev/null
```
The SSE stream should show three events in sequence: `audit` → `risk` → `access_request`.

---

## 10. Threat detection

Run agent-b (3 blocks in quick succession) to trigger a threat event:
```bash
cd demo && npx ts-node agent-b.ts
```
Then check:
```bash
curl -s http://localhost:4000/threats/recent | python3 -m json.tool
```
Expected: at least one `ThreatEvent` with `threatType: "PROBING_ATTACK"` or `"REPEATED_VIOLATION"`.

Watch the Threat Feed panel in the dashboard turn red.

---

## 11. Risk scores

```bash
curl -s http://localhost:4000/risk-scores | python3 -m json.tool
```
Expected: after running agent-b, `agent-b` should have a high score and level `HIGH` or `CRITICAL`.

```json
{
  "agent-b": {
    "score": 24,
    "level": "LOW",
    "totalCalls": 3,
    "blockedCalls": 3,
    "hijackAttempts": 0
  }
}
```

---

## 12. Access requests

### 12a. List all
```bash
curl -s http://localhost:4000/access-requests | python3 -m json.tool
```

### 12b. Filter by status
```bash
curl -s "http://localhost:4000/access-requests?status=PENDING" | python3 -m json.tool
```

### 12c. Get single request
```bash
# Replace with a real ID from the list above
curl -s http://localhost:4000/access-requests/MCPA-XXX-XXXXX | python3 -m json.tool
```

### 12d. Approve a request
```bash
curl -s -X POST http://localhost:4000/access-requests/MCPA-XXX-XXXXX/resolve \
  -H "Content-Type: application/json" \
  -d '{"status":"APPROVED","resolvedBy":"test-admin","note":"Testing approval flow"}' \
  | python3 -m json.tool
```
Expected: response with `status: "APPROVED"`, `resolvedAt`, `resolvedBy`.

**Verify policy.yaml was patched:**
```bash
cat policy.yaml | grep -A5 "untrusted:"
```
The approved tool should now appear in `allowed_tools` for that role.

**Verify the proxy picked it up (no restart needed):**
```bash
curl -s "http://localhost:4000/policy/simulate?role=untrusted&tool=query_db" | python3 -m json.tool
# Expected: { "allowed": true, ... }
```

### 12e. Deny a request
```bash
curl -s -X POST http://localhost:4000/access-requests/MCPA-YYY-YYYYY/resolve \
  -H "Content-Type: application/json" \
  -d '{"status":"DENIED","resolvedBy":"test-admin","note":"Not authorized"}' \
  | python3 -m json.tool
```
Expected: `status: "DENIED"`, policy.yaml unchanged.

---

## 13. Policy CRUD

### 13a. Read current policy
```bash
curl -s http://localhost:4000/policy | python3 -m json.tool
```

### 13b. Simulate a policy check
```bash
curl -s "http://localhost:4000/policy/simulate?role=analyst&tool=query_db" | python3 -m json.tool
# Expected: { "allowed": true, ... }

curl -s "http://localhost:4000/policy/simulate?role=analyst&tool=drop_table" | python3 -m json.tool
# Expected: { "allowed": false, "reason": "...", "rule": "..." }

curl -s "http://localhost:4000/policy/simulate?role=untrusted&tool=anything" | python3 -m json.tool
# Expected: { "allowed": false, ... }
```

### 13c. Policy hot-reload

Edit `policy.yaml` directly — add a new tool to analyst's `allowed_tools`:
```bash
# Add "bulk_read" to analyst.allowed_tools
python3 -c "
import yaml, sys
with open('policy.yaml') as f: p = yaml.safe_load(f)
p['roles']['analyst']['allowed_tools'].append('bulk_read')
print(yaml.dump(p))
" > policy.yaml.tmp && mv policy.yaml.tmp policy.yaml
```

Wait 1 second (chokidar debounce), then check:
```bash
curl -s "http://localhost:4000/policy/simulate?role=analyst&tool=bulk_read" | python3 -m json.tool
# Expected: { "allowed": true } — no proxy restart needed
```

Restore the original policy:
```bash
git checkout policy.yaml
```

---

## 14. Full demo agents

Run each agent and observe output + dashboard simultaneously:

```bash
cd demo

# agent-a: 3 ALLOW, 1 BLOCK (delete_record)
npx ts-node agent-a.ts

# agent-b: 3 BLOCK — prints access required banner for each
npx ts-node agent-b.ts

# agent-c: ALLOW → HIJACK → BLOCK
npx ts-node agent-c.ts
```

Expected agent-b terminal output:
```
[agent-b] Starting — role: untrusted (zero tool access)

  1. query_db      (untrusted role — no tools allowed)
     BLOCKED — Role 'untrusted' has no allowed tools
  ─────────────────────────────────────
  ACCESS REQUIRED
  Request ID: MCPA-7K2-X9P4Q
  Portal:     go/mcpaccess
  Direct URL: http://localhost:5173/access/MCPA-7K2-X9P4Q
  ─────────────────────────────────────
```

Expected agent-c terminal output:
```
[agent-c] Starting — demonstrates session hijack detection

  1. query_db  (analyst role — legitimate call)
     OK — session sess-c now bound to agent-c token

  2. read_report  (FORGED TOKEN — same session sess-c)
     Token swapped: agent-c → agent-x on live session
     HIJACK DETECTED — ...

  3. delete_record  (analyst role — in denied_tools)
     BLOCKED — ...
     ─────────────────────────────────────
     ACCESS REQUIRED
     ...
```

---

## 15. Dashboard walkthrough

With traffic flowing, verify each panel at `http://localhost:5173`:

| Panel | What to verify |
|-------|---------------|
| **Stats bar** | Total calls, blocked count, hijack count update live |
| **Activity Feed** | New rows appear at top with correct decision badge (green/red/amber/gray) |
| **Activity Feed** | Blocked rows show `MCPA-... →` pill; clicking navigates to `/access/:id` |
| **Threat Feed** | agent-b's repeated blocks generate a threat card |
| **Risk Panel** | agent-b gauge shows elevated score; agent-c shows HIJACK contribution |
| **Routing Map** | Server cards show call counts; table highlights active route |
| **Policy Editor** | Open, edit a role's tools, save — verify simulate returns new result |
| **Header badge** | "N pending" badge appears after blocks; clicking goes to `/access` |

---

## 16. Access portal UI

Navigate to `http://localhost:5173/access`:

1. Pending requests are listed (default filter)
2. Click a card → navigates to `/access/:id`
3. On the detail page: click **Approve access** → form expands with fine print
4. Fill in reviewer name → click **Confirm approval**
5. Status badge updates to APPROVED, green banner appears
6. Navigate back → card is gone from PENDING filter, appears under APPROVED
7. Verify `policy.yaml` was patched:
   ```bash
   cat policy.yaml
   ```

---

## 17. Kill all services

```bash
for port in 3001 3002 3003 4000; do
  pid=$(lsof -ti TCP:$port 2>/dev/null) && kill -9 $pid && echo "killed :$port"
done
```
