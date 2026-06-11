import { useEffect, useRef, useState } from "react";
import type { AuditEntry } from "../types";

const PROXY = "http://localhost:4000";

interface ServerInfo {
  url: string;
  description: string;
}

// Deterministic color per server name
const SERVER_COLORS: Record<string, { badge: string; dot: string; border: string }> = {
  "db-server":     { badge: "bg-blue-900/60 text-blue-300 border-blue-700",   dot: "bg-blue-400",   border: "border-blue-800" },
  "api-server":    { badge: "bg-teal-900/60 text-teal-300 border-teal-700",   dot: "bg-teal-400",   border: "border-teal-800" },
  "report-server": { badge: "bg-purple-900/60 text-purple-300 border-purple-700", dot: "bg-purple-400", border: "border-purple-800" },
};

const DEFAULT_COLOR = { badge: "bg-gray-800 text-gray-400 border-gray-700", dot: "bg-gray-500", border: "border-gray-800" };

function serverColor(name: string) {
  return SERVER_COLORS[name] ?? DEFAULT_COLOR;
}

interface Props {
  rows: AuditEntry[];
}

export function RoutingMap({ rows }: Props) {
  const [routes, setRoutes] = useState<Record<string, string>>({});
  const [servers, setServers] = useState<Record<string, ServerInfo>>({});
  const [flashTool, setFlashTool] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevFirstRowId = useRef<number | string | undefined>(undefined);

  // Fetch routing config on mount
  useEffect(() => {
    Promise.all([
      fetch(`${PROXY}/routes`).then((r) => r.json() as Promise<Record<string, string>>),
      fetch(`${PROXY}/servers`).then((r) => r.json() as Promise<Record<string, ServerInfo>>),
    ])
      .then(([r, s]) => { setRoutes(r); setServers(s); })
      .catch(console.error);
  }, []);

  // Flash the row for the most recently routed tool
  useEffect(() => {
    const latest = rows[0];
    if (!latest || latest.id === prevFirstRowId.current) return;
    prevFirstRowId.current = latest.id;
    if (latest.decision === "allow" && latest.tool_name) {
      setFlashTool(latest.tool_name);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlashTool(null), 900);
    }
  }, [rows]);

  // Count calls per server from audit rows
  const callsPerServer: Record<string, number> = {};
  for (const row of rows) {
    if (row.target_server) {
      callsPerServer[row.target_server] = (callsPerServer[row.target_server] ?? 0) + 1;
    }
  }

  const serverEntries = Object.entries(servers);
  const routeEntries = Object.entries(routes);

  if (serverEntries.length === 0 && routeEntries.length === 0) {
    return <p className="text-sm text-gray-600 text-center py-4">Loading routing config…</p>;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left — server cards */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500">Servers</h3>
        <div className="flex flex-col gap-3">
          {serverEntries.map(([name, info]) => {
            const { dot, border } = serverColor(name);
            const calls = callsPerServer[name] ?? 0;
            return (
              <div
                key={name}
                className={`bg-gray-900 border ${border} rounded-lg px-4 py-3 space-y-1`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-semibold text-white">{name}</span>
                  <div className="flex items-center gap-1.5">
                    <span className={`inline-block w-2 h-2 rounded-full ${dot}`} title="URL reachable" />
                    {calls > 0 && (
                      <span className="text-xs text-gray-500 tabular-nums">{calls} calls</span>
                    )}
                  </div>
                </div>
                <p className="font-mono text-xs text-gray-400">{info.url}</p>
                {info.description && (
                  <p className="text-xs text-gray-600">{info.description}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Right — routing table */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500">
          Tool routing
        </h3>
        {routeEntries.length === 0 ? (
          <p className="text-sm text-gray-600">No routes defined</p>
        ) : (
          <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="px-4 py-2 text-left text-gray-500 font-medium">Tool</th>
                  <th className="px-4 py-2 text-left text-gray-500 font-medium">Server</th>
                </tr>
              </thead>
              <tbody>
                {routeEntries.map(([tool, server]) => {
                  const { badge } = serverColor(server);
                  const isFlashing = flashTool === tool;
                  return (
                    <tr
                      key={tool}
                      className={`border-b border-gray-800/50 last:border-0 transition-colors duration-150 ${
                        isFlashing ? "bg-white/5" : "hover:bg-gray-800/30"
                      }`}
                    >
                      <td className={`px-4 py-2 font-mono ${isFlashing ? "text-white" : "text-gray-300"}`}>
                        {tool}
                      </td>
                      <td className="px-4 py-2">
                        <span className={`inline-block rounded border px-2 py-0.5 font-mono text-xs ${badge}`}>
                          {server}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
