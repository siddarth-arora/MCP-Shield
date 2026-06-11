import * as dotenv from "dotenv";
import * as path from "path";
import * as jwt from "jsonwebtoken";

dotenv.config({ path: path.resolve(__dirname, "../proxy/.env"), quiet: true });

const secret = process.env["JWT_SECRET"];
if (!secret) {
  process.stderr.write("Error: JWT_SECRET not found in ../proxy/.env\n");
  process.exit(1);
}

const TTL = "24h";

const agents = [
  { envVar: "AGENT_A_TOKEN", sub: "agent-a", role: "analyst",   session: "sess-a" },
  { envVar: "AGENT_B_TOKEN", sub: "agent-b", role: "untrusted", session: "sess-b" },
  { envVar: "AGENT_C_TOKEN", sub: "agent-c", role: "analyst",   session: "sess-c" },
] as const;

for (const { envVar, sub, role, session } of agents) {
  const token = jwt.sign({ sub, role, session }, secret, { expiresIn: TTL });
  process.stdout.write(`export ${envVar}="${token}"\n`);
}
