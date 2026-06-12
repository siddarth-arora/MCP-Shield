import { useRef } from "react";
import { Link } from "react-router-dom";
import type { AuditEntry } from "../types";

interface Props { rows: AuditEntry[] }

const leftBorder: Record<AuditEntry["decision"], string> = {
  allow:  "border-l-emerald-500",
  block:  "border-l-rose-500",
  hijack: "border-l-amber-400",
  error:  "border-l-indigo-400",
};

const badge: Record<AuditEntry["decision"], string> = {
  allow:  "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20",
  block:  "bg-rose-500/10    text-rose-400    ring-1 ring-rose-500/20",
  hijack: "bg-amber-500/10   text-amber-400   ring-1 ring-amber-500/20",
  error:  "bg-indigo-500/10  text-indigo-400  ring-1 ring-indigo-500/20",
};

function fmt(ts: string) {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

export function ActivityFeed({ rows }: Props) {
  const visible = rows.slice(0, 25);
  const prevFirst = useRef<string | number | undefined>(undefined);
  const isNew = visible[0] && visible[0].id !== prevFirst.current;
  if (visible[0]) prevFirst.current = visible[0].id;

  if (visible.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-white/6 bg-zinc-900 py-14 text-center">
        <svg className="w-8 h-8 text-zinc-700" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
        </svg>
        <span className="text-sm text-zinc-600">Waiting for events…</span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/6 bg-zinc-900 overflow-hidden">
      {/* Column header */}
      <div className="grid grid-cols-[72px_80px_1fr_72px_64px] gap-3 px-4 py-2 border-b border-white/6 text-xs font-medium text-zinc-600 uppercase tracking-wider">
        <span>Time</span>
        <span>Agent</span>
        <span>Tool</span>
        <span>Decision</span>
        <span className="text-right">Latency</span>
      </div>

      <div className="divide-y divide-white/4">
        {visible.map((row, i) => (
          <div
            key={`${row.id}-${row.ts}`}
            className={`
              grid grid-cols-[72px_80px_1fr_72px_64px] gap-3 items-center
              border-l-2 ${leftBorder[row.decision]}
              px-4 py-2.5
              hover:bg-white/2 transition-colors duration-100
              ${i === 0 && isNew ? "animate-slide-in" : ""}
            `}
          >
            <span className="text-xs text-zinc-600 tabular-nums">{fmt(row.ts)}</span>

            <span className="font-mono text-xs text-cyan-400 truncate">{row.agent_id}</span>

            <span className="font-mono text-xs text-zinc-300 truncate">{row.tool_name}</span>

            <div className="flex items-center gap-1.5">
              <span className={`text-xs px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide ${badge[row.decision]}`}>
                {row.decision}
              </span>
              {row.decision === "block" && row.access_request_id && (
                <Link
                  to={`/access/${row.access_request_id}`}
                  className="text-zinc-600 hover:text-zinc-300 transition-colors"
                  title={row.access_request_id}
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                </Link>
              )}
            </div>

            <span className="text-right text-xs text-zinc-700 tabular-nums">
              {row.latency_ms != null ? `${row.latency_ms}ms` : "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
