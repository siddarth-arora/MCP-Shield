import * as dotenv from "dotenv";
dotenv.config();

import Fastify from "fastify";
import cors from "@fastify/cors";
import type { JsonRpcRequest } from "./types";
import { forward } from "./forwarder";
import { authMiddleware } from "./middleware/auth";
import { policyEngine } from "./policy";
import { write, getRecent, getStats, getThreats, getRiskScores } from "./audit";
import { registerEventsRoute } from "./routes/events";
import { registerPolicyRoutes } from "./routes/policy";

const PORT = parseInt(process.env["PROXY_PORT"] ?? "4000", 10);
const TARGET = process.env["TARGET_MCP_URL"] ?? "http://localhost:3001";
const CORS_ORIGIN = process.env["CORS_ORIGIN"] ?? "http://localhost:5173";

async function start() {
  const app = Fastify({ logger: true });

  // Fastify parses application/json bodies natively — no addContentTypeParser needed.
  await app.register(cors, {
    origin: CORS_ORIGIN,
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-session-id", "x-mcp-token", "Cache-Control"],
    exposedHeaders: ["Content-Type", "Cache-Control"],
  });

  app.addHook("onResponse", (request, _reply, done) => {
    if (request.agentClaims) {
      write(
        {
          ts: new Date(request.startTime).toISOString(),
          agent_id: request.agentClaims.sub,
          session_id: request.sessionId,
          tool_name: request.toolName,
          decision: request.decision,
          policy_rule: request.policyRule,
          latency_ms: Date.now() - request.startTime,
        },
        request.rawBody
      );
    }
    done();
  });

  app.get("/health", async () => ({ status: "ok" }));
  registerEventsRoute(app);
  registerPolicyRoutes(app);

  app.get("/audit/recent", async (_request, reply) => {
    return reply.send(getRecent(100));
  });

  app.get("/audit/stats", async (_request, reply) => {
    return reply.send(getStats());
  });

  app.get("/threats/recent", async (_request, reply) => {
    return reply.send(getThreats(20));
  });

  app.get("/risk-scores", async (_request, reply) => {
    return reply.send(getRiskScores());
  });

  app.post<{ Body: JsonRpcRequest }>("/mcp", { preHandler: authMiddleware }, async (request, reply) => {
    request.startTime = Date.now();
    request.rawBody = JSON.stringify(request.body);

    const toolName = request.body?.params?.["name"] as string | undefined ?? "unknown";
    const { allowed, reason, rule } = policyEngine.check(request.agentClaims.role, toolName);

    request.toolName = toolName;
    request.policyRule = rule;

    if (!allowed) {
      request.decision = "block";
      return reply.code(403).send({
        jsonrpc: "2.0",
        id: request.body.id,
        error: {
          code: -32001,
          message: "Access denied",
          data: {
            agent: request.agentClaims.sub,
            role: request.agentClaims.role,
            tool: toolName,
            reason,
            policy_rule: rule,
          },
        },
      });
    }

    request.decision = "allow";
    const result = await forward(request.body, `${TARGET}/mcp`);
    return reply.send(result);
  });

  await app.listen({ port: PORT, host: "0.0.0.0" });
  console.log(`proxy listening on http://0.0.0.0:${PORT}`);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
