import { useEffect, useRef, useState } from "react";
import type { AuditEntry } from "../types";

const PROXY = "http://localhost:4000";

interface ServerInfo { url: string; description: string }

const SERVER_COLORS: Record<string, { dot: string; badge: string; ring: string }> = {
  "db-server":     { dot: "bg-blue-400",   badge: "bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20",     ring: "ring-blue-500/20"   },
  "api-server":    { dot: "bg-teal-400",   badge: "bg-teal-500/10 text-teal-400 ring-1 ring-teal-500/20",     ring: "ring-teal-500/20"   },
  "report-server": { dot: "bg-violet-400", badge: "bg-violet-500/10 text-violet-400 ring-1 ring-violet-500/20", ring: "ring-violet-500/20" },
};
const DEFAULT_COLOR = { dot: "bg-zinc-500", badge: "bg-zinc-800 text-zinc-400 ring-1 ring-zinc-700", ring: "ring-zinc-700" };

function serverColor(name: string) { return SERVER_COLORS[name] ?? DEFAULT_COLOR; }

interface Props { rows: AuditEntry[] }

export function RoutingMap({ rows }: Props) {
  const [routes, setRoutes]   = useState<Record<string, string>>({});
  const [servers, setServers] = useState<Record<string, ServerInfo>>({});
  const [flash, setFlash]     = useState<string | null>(null);
  const flashTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevFirstId  = useRef<number | string | undefined>(undefined);

  useEffect(() => {
    Promise.all([
      fetch(`${PROXY}/routes`).then((r) => r.json() as Promise<Record<string, string>>),
      fetch(`${PROXY}/servers`).then((r) => r.json() as Promise<Record<string, ServerInfo>>),
    ]).then(([r, s]) => { setRoutes(r); setServers(s); }).catch(console.error);
  }, []);

  useEffect(() => {
    const latest = rows[0];
    if (!latest || latest.id === prevFirstId.current) return;
    prevFirstId.current = latest.id;
    if (latest.decision === "allow" && latest.tool_name) {
      setFlash(latest.tool_name);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlash(null), 1000);
    }
  }, [rows]);

  const callsPerServer: Record<string, number> = {};
  for (const row of rows) {
    if (row.target_server)
      callsPerServer[row.target_server] = (callsPerServer[row.target_server] ?? 0) + 1;
  }

  const serverEntries = Object.entries(servers);
  const routeEntries  = Object.entries(routes);

  if (serverEntries.length === 0 && routeEntries.length === 0) {
    return <p className="text-sm text-zinc-600 text-center py-6">Loading routing config…</p>;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Server cards */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-600">Servers</p>
        <div className="flex flex-col gap-2">
          {serverEntries.map(([name, info]) => {
            const { dot } = serverColor(name);
            const calls = callsPerServer[name] ?? 0;
            return (
              <div key={name} className="rounded-lg border border-white/6 bg-zinc-900 px-4 py-3 hover:border-white/10 transition-colors">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${dot} animate-blink`} />
                    <span className="font-mono text-sm font-semibold text-zinc-100">{name}</span>
                  </div>
                  {calls > 0 && (
                    <span className="text-xs text-zinc-500 tabular-nums">{calls} calls</span>
                  )}
                </div>
                <p className="font-mono text-xs text-zinc-600">{info.url}</p>
                {info.description && (
                  <p className="text-xs text-zinc-700 mt-0.5">{info.description}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Routing table */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-600">Tool routing</p>
        {routeEntries.length === 0 ? (
          <p className="text-sm text-zinc-600">No routes defined</p>
        ) : (
          <div className="rounded-lg border border-white/6 bg-zinc-900 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/6">
                  <th className="px-4 py-2 text-left text-zinc-600 font-medium">Tool</th>
                  <th className="px-4 py-2 text-left text-zinc-600 font-medium">Server</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/4">
                {routeEntries.map(([tool, server]) => {
                  const { badge } = serverColor(server);
                  const isFlash = flash === tool;
                  return (
                    <tr
                      key={tool}
                      className={`transition-colors duration-200 ${isFlash ? "bg-white/5" : "hover:bg-white/2"}`}
                    >
                      <td className={`px-4 py-2 font-mono transition-colors duration-200 ${isFlash ? "text-zinc-100" : "text-zinc-400"}`}>
                        {tool}
                      </td>
                      <td className="px-4 py-2">
                        <span className={`inline-block rounded px-2 py-0.5 font-mono text-xs font-medium ${badge}`}>
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
