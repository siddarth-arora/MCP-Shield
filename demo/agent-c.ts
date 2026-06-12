import * as dotenv from "dotenv";
import * as path from "path";
import * as jwt from "jsonwebtoken";

dotenv.config({ path: path.resolve(__dirname, "../proxy/.env"), quiet: true });

const PROXY = "http://localhost:4000/mcp";
const TOKEN = process.env["AGENT_C_TOKEN"];
const SESSION = "sess-c";

if (!TOKEN) {
  process.stderr.write("Error: AGENT_C_TOKEN not set — run: eval $(npx ts-node gen-tokens.ts)\n");
  process.exit(1);
}

const JWT_SECRET = process.env["JWT_SECRET"];
if (!JWT_SECRET) {
  process.stderr.write("Error: JWT_SECRET not set in ../proxy/.env\n");
  process.exit(1);
}

interface AccessRequestData {
  id: string;
  portal_url: string;
  message: string;
}

interface RpcResponse {
  result?: unknown;
  error?: {
    message: string;
    data?: {
      reason?: string;
      access_request?: AccessRequestData;
    };
  };
}

function printAccessDenied(access_request: AccessRequestData) {
  console.log("  ─────────────────────────────────────");
  console.log("  ACCESS REQUIRED");
  console.log("  Request ID: " + access_request.id);
  console.log("  Portal:     go/mcpaccess");
  console.log("  Direct URL: " + access_request.portal_url);
  console.log("  ─────────────────────────────────────");
}

async function callProxy(tool: string, id: number, token: string): Promise<RpcResponse> {
  const res = await fetch(PROXY, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      "x-session-id": SESSION,   // same session ID throughout — hijack is the token swap
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method: "tools/call",
      params: { name: tool, arguments: {} },
    }),
  });
  return res.json() as Promise<RpcResponse>;
}

async function run() {
  console.log("[agent-c] Starting — demonstrates session hijack detection\n");

  // ── Call 1: legitimate request, binds sess-c to AGENT_C_TOKEN ─────────────
  console.log("  1. query_db  (analyst role — legitimate call)");
  try {
    const r = await callProxy("query_db", 1, TOKEN!);
    if (r.error) {
      const reason = r.error.data?.reason ?? r.error.message;
      console.log(`     BLOCKED — ${reason}`);
      const ar = r.error.data?.access_request;
      if (ar) printAccessDenied(ar);
    } else {
      console.log("     OK — session sess-c now bound to agent-c token");
    }
  } catch (err) {
    console.log(`     ERROR — ${err instanceof Error ? err.message : String(err)}`);
  }

  console.log();
  await new Promise((resolve) => setTimeout(resolve, 600));

  // ── Call 2: swap to a forged token on the same session ───────────────────
  // Signs a new JWT with a different sub — proxy detects the token changed
  // for an already-bound session and raises a HIJACK decision.
  const forgedToken = jwt.sign(
    { sub: "agent-x", role: "analyst", session: SESSION },
    JWT_SECRET!,
    { expiresIn: "1h" }
  );

  console.log("  2. read_report  (FORGED TOKEN — same session sess-c)");
  console.log("     Token swapped: agent-c → agent-x on live session");
  try {
    const r = await callProxy("read_report", 2, forgedToken);
    if (r.error) {
      const reason = r.error.data?.reason ?? r.error.message;
      console.log(`     HIJACK DETECTED — ${reason}`);
      const ar = r.error.data?.access_request;
      if (ar) printAccessDenied(ar);
    } else {
      console.log("     OK (unexpected — hijack not caught)");
    }
  } catch (err) {
    console.log(`     ERROR — ${err instanceof Error ? err.message : String(err)}`);
  }

  console.log();
  await new Promise((resolve) => setTimeout(resolve, 600));

  // ── Call 3: blocked tool on original token (extra demo beat) ─────────────
  console.log("  3. delete_record  (analyst role — in denied_tools)");
  try {
    const r = await callProxy("delete_record", 3, TOKEN!);
    if (r.error) {
      const reason = r.error.data?.reason ?? r.error.message;
      console.log(`     BLOCKED — ${reason}`);
      const ar = r.error.data?.access_request;
      if (ar) printAccessDenied(ar);
    } else {
      console.log("     OK (unexpected allow)");
    }
  } catch (err) {
    console.log(`     ERROR — ${err instanceof Error ? err.message : String(err)}`);
  }

  console.log();
  console.log("[agent-c] Done");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
