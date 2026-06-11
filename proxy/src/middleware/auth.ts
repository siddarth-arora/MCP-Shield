import type { FastifyRequest, FastifyReply } from "fastify";
import * as jwt from "jsonwebtoken";
import type { AgentClaims, JsonRpcRequest } from "../types";
import { sessionStore } from "../session";

declare module "fastify" {
  interface FastifyRequest {
    // Set by authMiddleware on every authenticated request
    agentClaims: AgentClaims;
    sessionId: string;
    rawToken: string;
    // Set by /mcp handler (or authMiddleware for hijack) before onResponse fires
    decision: "allow" | "block" | "hijack" | "error";
    startTime: number;
    rawBody: string;
    toolName: string;
    policyRule: string | null;
    targetServer: string | null;
  }
}

function rpcError(
  id: number | string | null,
  code: number,
  message: string,
  data: Record<string, unknown>
) {
  return { jsonrpc: "2.0", id, error: { code, message, data } };
}

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const secret = process.env["JWT_SECRET"];
  if (!secret) {
    await reply.code(500).send(rpcError(null, -32603, "Server misconfiguration", { detail: "JWT_SECRET not set" }));
    return;
  }

  // 1. Extract token — Authorization: Bearer <token>  or  x-mcp-token header
  const authHeader = request.headers["authorization"];
  const rawToken =
    (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined) ??
    (request.headers["x-mcp-token"] as string | undefined);

  const body = request.body as Partial<JsonRpcRequest>;
  const rpcId = body?.id ?? null;

  if (!rawToken) {
    await reply.code(401).send(rpcError(rpcId, -32001, "Access denied", { reason: "Missing authentication token" }));
    return;
  }

  // 2. Verify JWT
  let claims: AgentClaims;
  try {
    const decoded = jwt.verify(rawToken, secret);
    if (typeof decoded === "string" || !decoded["sub"] || !decoded["role"] || !decoded["session"]) {
      throw new Error("Invalid claims shape");
    }
    claims = decoded as unknown as AgentClaims;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid token";
    await reply.code(401).send(rpcError(rpcId, -32001, "Access denied", { reason: message }));
    return;
  }

  // 3. Require x-session-id header
  const sessionId = request.headers["x-session-id"] as string | undefined;
  if (!sessionId) {
    await reply.code(400).send(rpcError(rpcId, -32001, "Access denied", { reason: "Missing x-session-id header" }));
    return;
  }

  // 4. Session binding / hijack detection
  const result = sessionStore.verify(sessionId, rawToken, claims.sub);
  if (!result.valid) {
    // Populate request fields so onResponse hook can write a hijack audit entry
    request.agentClaims = claims;
    request.sessionId = sessionId;
    request.rawToken = rawToken;
    request.decision = "hijack";
    request.startTime = Date.now();
    request.rawBody = JSON.stringify(body);
    request.toolName = (body?.params?.["name"] as string | undefined) ?? "unknown";
    request.policyRule = null;
    await reply.code(403).send(
      rpcError(rpcId, -32002, "Session hijack detected", {
        agent: claims.sub,
        session_id: sessionId,
        reason: result.reason ?? "Session verification failed",
      })
    );
    return;
  }

  // 5. Bind (no-op for existing valid sessions, creates entry for new ones)
  sessionStore.bind(sessionId, claims, rawToken);

  // 6. Attach to request for downstream handlers
  request.agentClaims = claims;
  request.sessionId = sessionId;
  request.rawToken = rawToken;
}
