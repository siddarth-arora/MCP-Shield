import { PassThrough } from "stream";
import type { FastifyInstance } from "fastify";
import { addSseClient, removeSseClient, getRecent, getThreats, getRiskScores } from "../audit";

export function registerEventsRoute(app: FastifyInstance): void {
  app.get("/events", (request, reply) => {
    const corsOrigin = process.env["CORS_ORIGIN"] ?? "http://localhost:5173";
    // EventSource bypasses Fastify's normal response pipeline so CORS headers
    // must be set directly on the raw response before reply.send(stream).
    reply.raw.setHeader("Access-Control-Allow-Origin", corsOrigin);
    reply.raw.setHeader("Access-Control-Allow-Credentials", "true");

    const stream = new PassThrough();

    void reply
      .header("Content-Type", "text/event-stream")
      .header("Cache-Control", "no-cache")
      .header("Connection", "keep-alive")
      .header("X-Accel-Buffering", "no")
      .send(stream);

    // Flush recent audit rows and threat history immediately on connect
    for (const row of getRecent(50)) {
      stream.write(`data: ${JSON.stringify({ type: "audit", row })}\n\n`);
    }
    for (const threat of getThreats(20)) {
      stream.write(`data: ${JSON.stringify({ type: "threat", threat })}\n\n`);
    }
    const riskScores = getRiskScores();
    for (const [agentId, state] of Object.entries(riskScores)) {
      stream.write(`data: ${JSON.stringify({ type: "risk", agentId, state })}\n\n`);
    }

    addSseClient(stream);

    const heartbeat = setInterval(() => {
      if (!stream.destroyed) {
        stream.write(": heartbeat\n\n");
      }
    }, 15_000);

    stream.on("close", () => {
      clearInterval(heartbeat);
      removeSseClient(stream);
    });
  });
}
