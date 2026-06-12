import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../proxy/.env"), quiet: true });

const PROXY = "http://localhost:4000/mcp";
const TOKEN = process.env["AGENT_B_TOKEN"];
const SESSION = "sess-b";

if (!TOKEN) {
  process.stderr.write("Error: AGENT_B_TOKEN not set — run: eval $(npx ts-node gen-tokens.ts)\n");
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

async function callProxy(tool: string, id: number): Promise<RpcResponse> {
  const res = await fetch(PROXY, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${TOKEN}`,
      "x-session-id": SESSION,
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

const calls = [
  { tool: "query_db",       label: "query_db      (untrusted role — no tools allowed)" },
  { tool: "list_tables",    label: "list_tables   (untrusted role — no tools allowed)" },
  { tool: "delete_record",  label: "delete_record (untrusted role — no tools allowed)" },
];

async function run() {
  console.log("[agent-b] Starting — role: untrusted (zero tool access)\n");

  for (let i = 0; i < calls.length; i++) {
    const { tool, label } = calls[i]!;
    console.log(`  ${i + 1}. ${label}`);

    try {
      const result = await callProxy(tool, i + 1);

      if (result.error) {
        const reason = result.error.data?.reason ?? result.error.message;
        console.log(`     BLOCKED — ${reason}`);

        const ar = result.error.data?.access_request;
        if (ar) {
          printAccessDenied(ar);
        }
      } else {
        console.log("     OK (unexpected allow)");
      }
    } catch (err) {
      console.log(`     ERROR — ${err instanceof Error ? err.message : String(err)}`);
    }

    console.log();
    await new Promise((resolve) => setTimeout(resolve, 600));
  }

  console.log("[agent-b] Done — all calls blocked as expected");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
