import Fastify from "fastify";

const app = Fastify({ logger: true });

app.post("/mcp", async (request, reply) => {
  const body = request.body as { jsonrpc: string; id: unknown; method: string; params?: unknown };
  console.log(`[server-a] method=${body.method} params=${JSON.stringify(body.params)}`);
  return reply.send({
    jsonrpc: "2.0",
    id: body.id,
    result: { ok: true, echo: body.params },
  });
});

app.listen({ port: 3001, host: "0.0.0.0" }, (err) => {
  if (err) { console.error(err); process.exit(1); }
  console.log("server-a listening on http://0.0.0.0:3001");
});
