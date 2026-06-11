export async function forward(body: unknown, targetUrl: string): Promise<unknown> {
  // node-fetch v3 is ESM-only; dynamic import is required in a CommonJS build
  const { default: fetch } = await import("node-fetch");
  const res = await fetch(targetUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<unknown>;
}
