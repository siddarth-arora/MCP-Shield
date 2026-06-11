import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../proxy/.env"), quiet: true });

const PROXY = "http://localhost:4000/mcp";
const TOKEN = process.env["AGENT_A_TOKEN"];
const SESSION = "sess-a";

if (!TOKEN) {
  process.stderr.write("Error: AGENT_A_TOKEN not set — run: eval $(npx ts-node gen-tokens.ts)\n");
  process.exit(1);
}

interface RpcCall {
  tool: string;
  label: string;
}

const calls: RpcCall[] = [
  { tool: "query_db",        label: "query_db       → db-server     (ALLOW)" },
  { tool: "send_email",      label: "send_email     → api-server    (ALLOW)" },
  { tool: "delete_record",   label: "delete_record  → blocked       (BLOCK)" },
  { tool: "generate_report", label: "generate_report → report-server (ALLOW)" },
];

async function callProxy(tool: string, id: number): Promise<unknown> {
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
  return res.json();
}

async function run() {
  console.log("[agent-a] Starting demo sequence\n");

  for (let i = 0; i < calls.length; i++) {
    const { tool, label } = calls[i]!;
    process.stdout.write(`  ${i + 1}. ${label} ... `);
    try {
      const result = await callProxy(tool, i + 1);
      const r = result as { result?: unknown; error?: { message: string } };
      if (r.error) {
        console.log(`BLOCKED — ${r.error.message}`);
      } else {
        console.log("OK");
      }
    } catch (err) {
      console.log(`ERROR — ${err instanceof Error ? err.message : String(err)}`);
    }
    // Small delay so SSE events are visible one at a time in the dashboard
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  console.log("\n[agent-a] Done");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
