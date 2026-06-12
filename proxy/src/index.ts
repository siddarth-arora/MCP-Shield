import * as dotenv from "dotenv";
import * as crypto from "crypto";
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
import { router } from "./router";
import * as accessRequests from "./access-requests";

const PORT = parseInt(process.env["PROXY_PORT"] ?? "4000", 10);
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
          target_server: request.targetServer ?? null,
          access_request_id: request.accessRequestId ?? null,
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

  app.get("/routes", async (_request, reply) => {
    return reply.send(router.getRoutes());
  });

  app.get("/servers", async (_request, reply) => {
    return reply.send(router.getServers());
  });

  // Access requests
  app.get<{ Querystring: { status?: string; agentId?: string } }>(
    "/access-requests",
    async (request, reply) => {
      return reply.send(accessRequests.getAll(request.query));
    }
  );

  app.get<{ Params: { id: string } }>(
    "/access-requests/:id",
    async (request, reply) => {
      const rec = accessRequests.getById(request.params.id);
      if (!rec) return reply.code(404).send({ error: "Not found" });
      return reply.send(rec);
    }
  );

  app.post<{ Body: Omit<import("./access-requests").AccessRequest, "id" | "createdAt" | "status"> }>(
    "/access-requests",
    async (request, reply) => {
      const rec = accessRequests.create(request.body);
      return reply.code(201).send(rec);
    }
  );

  app.post<{ Params: { id: string }; Body: { status: "APPROVED" | "DENIED"; resolvedBy: string; note?: string } }>(
    "/access-requests/:id/resolve",
    async (request, reply) => {
      const { status, resolvedBy, note } = request.body;
      if (status !== "APPROVED" && status !== "DENIED") {
        return reply.code(400).send({ error: "status must be APPROVED or DENIED" });
      }
      const rec = accessRequests.resolve(request.params.id, status, resolvedBy, note);
      if (!rec) return reply.code(404).send({ error: "Not found or already resolved" });
      return reply.send(rec);
    }
  );

  app.post<{ Body: JsonRpcRequest }>("/mcp", { preHandler: authMiddleware }, async (request, reply) => {
    request.startTime = Date.now();
    request.rawBody = JSON.stringify(request.body);

    const toolName = request.body?.params?.["name"] as string | undefined ?? "unknown";
    const { allowed, reason, rule } = policyEngine.check(request.agentClaims.role, toolName);

    request.toolName = toolName;
    request.policyRule = rule;

    if (!allowed) {
      request.decision = "block";
      const requestHash = crypto.createHash("sha256").update(request.rawBody).digest("hex");
      const arec = accessRequests.create({
        agentId: request.agentClaims.sub,
        agentRole: request.agentClaims.role,
        toolName,
        targetServer: router.resolve(toolName).serverName,
        policyRule: rule,
        reason,
        sessionId: request.sessionId,
        requestHash,
      });
      request.accessRequestId = arec.id;
      const dashboardUrl = process.env["DASHBOARD_URL"] ?? "http://localhost:5173";
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
            access_request: {
              id: arec.id,
              portal_url: `${dashboardUrl}/access/${arec.id}`,
              message: `To request access, visit go/mcpaccess with ID ${arec.id}`,
            },
          },
        },
      });
    }

    request.decision = "allow";
    const { serverName, url } = router.resolve(toolName);
    request.targetServer = serverName;

    let result: unknown;
    try {
      result = await forward(request.body, `${url}/mcp`);
    } catch {
      request.decision = "error";
      return reply.code(502).send({
        jsonrpc: "2.0",
        id: request.body.id,
        error: {
          code: -32603,
          message: "Target server unavailable",
          data: { server: serverName, url },
        },
      });
    }
    return reply.send(result);
  });

  await app.listen({ port: PORT, host: "0.0.0.0" });
  console.log(`proxy listening on http://0.0.0.0:${PORT}`);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
