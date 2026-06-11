#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEMO="$ROOT/demo"
MOCK="$ROOT/mock-servers"
PROXY="$ROOT/proxy"

# Cleanup on exit
cleanup() {
  echo ""
  echo "[demo] Shutting down..."
  kill $(jobs -p) 2>/dev/null || true
}
trap cleanup EXIT

echo "[demo] Starting mock servers..."
(cd "$MOCK" && npx ts-node server-a.ts) &
(cd "$MOCK" && npx ts-node server-b.ts) &
(cd "$MOCK" && npx ts-node server-c.ts) &

echo "[demo] Starting proxy..."
(cd "$PROXY" && npx ts-node src/index.ts) &

echo "[demo] Waiting for services to be ready..."
sleep 5

echo "[demo] Generating tokens..."
eval "$(cd "$DEMO" && npx ts-node gen-tokens.ts 2>/dev/null)"

echo "[demo] Running agent-a sequence..."
echo ""
AGENT_A_TOKEN="$AGENT_A_TOKEN" (cd "$DEMO" && npx ts-node agent-a.ts)

echo ""
echo "[demo] Complete. Press Ctrl+C to stop all services."
wait
