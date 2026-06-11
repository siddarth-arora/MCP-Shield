# MCP-Shield — Hackathon Cheat Sheet

## Start order (always in this sequence)
```
1. cd mock-servers  →  npx ts-node server-a.ts
2. cd proxy         →  npx ts-node-dev src/index.ts
3. cd dashboard     →  npm run dev
4. cd demo          →  eval $(npx ts-node gen-tokens.ts)
5. cd demo          →  bash run-demo.sh
```

## Ports
| What          | Port |
|---------------|------|
| Proxy         | 4000 |
| Mock MCP      | 3001 |
| Dashboard     | 5173 |

## Key endpoints
```
POST http://localhost:4000/mcp          ← all agent traffic goes here
GET  http://localhost:4000/events       ← SSE stream to dashboard
GET  http://localhost:4000/audit/recent ← last 100 rows as JSON
GET  http://localhost:4000/audit/stats  ← { totalCalls, blocked, hijacks }
GET  http://localhost:4000/health       ← { status: 'ok' }
```

## Required headers on every agent call
```
Authorization: Bearer <jwt>
x-session-id: <any-unique-string>
Content-Type: application/json
```

## Demo scenario summary
| Event | Agent | Tool           | Expected    |
|-------|-------|----------------|-------------|
| 1     | A     | query_db       | ✅ ALLOW    |
| 2     | A     | list_tables    | ✅ ALLOW    |
| 3     | A     | delete_record  | ❌ BLOCK    |
| 4     | B     | query_db       | ❌ BLOCK    |
| 5     | B     | read_report    | ❌ BLOCK    |
| 6     | C     | query_db (swap)| ⚠️ HIJACK  |

## Live policy edit trick (impressive for demo)
While the proxy is running, edit policy.yaml and add analyst to delete_record allowed:
  → The next call from agent-a to delete_record will ALLOW (shows hot-reload live)
Then remove it to restore.

## Check audit log from CLI
```bash
sqlite3 proxy/audit.db \
  "SELECT ts, agent_id, tool_name, decision, policy_rule FROM audit_log ORDER BY id DESC LIMIT 10;" \
  -column -header
```

## If dashboard shows no data
```bash
# Check SSE endpoint directly
curl -N http://localhost:4000/events
# Should stream "data: ..." lines — if it hangs silently, the proxy is not running
```

## Common Claude Code prompts during build

Fix TypeScript errors:
```
Fix all TypeScript compile errors in proxy/src/ — run tsc --noEmit to check.
Do not use 'any'. Do not change runtime logic.
```

Debug a specific flow:
```
The policy check is returning 'allow' for untrusted role. Look at proxy/src/policy.ts
and trace why check('untrusted', 'query_db') might return allowed=true.
```

Add a feature fast:
```
Add a GET /sessions endpoint to proxy/src/index.ts that returns all active sessions
from sessionStore as a JSON array. Include agentId, role, callCount, lastSeen.
```
