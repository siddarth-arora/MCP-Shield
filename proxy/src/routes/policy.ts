import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import type { FastifyInstance } from "fastify";
import { policyEngine } from "../policy";

interface RolePolicy {
  allowed_tools: string[];
  denied_tools?: string[];
}

interface PolicyBody {
  roles: Record<string, RolePolicy>;
}

function policyFilePath(): string {
  return path.resolve(process.cwd(), process.env["POLICY_FILE"] ?? "../policy.yaml");
}

export function registerPolicyRoutes(app: FastifyInstance): void {
  app.get("/policy", async (_request, reply) => {
    const raw = fs.readFileSync(policyFilePath(), "utf-8");
    const parsed = yaml.load(raw) as PolicyBody;
    return reply.send(parsed);
  });

  app.post<{ Body: PolicyBody }>("/policy", async (request, reply) => {
    const body = request.body;

    if (!body || typeof body.roles !== "object" || Array.isArray(body.roles)) {
      return reply.code(400).send({ error: "Body must have a 'roles' object" });
    }

    for (const [role, rp] of Object.entries(body.roles)) {
      if (!Array.isArray(rp?.allowed_tools)) {
        return reply.code(400).send({ error: `Role '${role}' must have an allowed_tools array` });
      }
    }

    const yamlStr = yaml.dump(body, { lineWidth: 120 });
    fs.writeFileSync(policyFilePath(), yamlStr, "utf-8");

    return reply.send({ success: true, reloadedAt: new Date().toISOString() });
  });

  app.get<{ Querystring: { role?: string; tool?: string } }>("/policy/simulate", async (request, reply) => {
    const { role, tool } = request.query;
    if (!role || !tool) {
      return reply.code(400).send({ error: "Query params 'role' and 'tool' are required" });
    }
    return reply.send(policyEngine.check(role, tool));
  });
}
