import type { AuditEntry } from "../types";

interface Props {
  rows: AuditEntry[];
}

const borderColor: Record<AuditEntry["decision"], string> = {
  allow:  "border-l-green-500",
  block:  "border-l-red-500",
  hijack: "border-l-amber-400",
};

const decisionBadge: Record<AuditEntry["decision"], string> = {
  allow:  "bg-green-900/50 text-green-300",
  block:  "bg-red-900/50 text-red-300",
  hijack: "bg-amber-900/50 text-amber-300",
};

function fmt(ts: string) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function ActivityFeed({ rows }: Props) {
  const visible = rows.slice(0, 20);

  return (
    <div className="flex flex-col gap-1">
      {visible.length === 0 && (
        <p className="text-gray-500 text-sm py-4 text-center">Waiting for events…</p>
      )}
      {visible.map((row, i) => (
        <div
          key={`${row.id}-${row.ts}`}
          className={`
            border-l-4 ${borderColor[row.decision]}
            bg-gray-900 rounded-r px-3 py-2 flex items-center gap-3
            ${i === 0 ? "animate-pulse-once" : ""}
          `}
        >
          <span className="text-gray-500 text-xs tabular-nums w-20 shrink-0">{fmt(row.ts)}</span>
          <span className="font-mono text-xs text-cyan-300 w-20 truncate shrink-0">{row.agent_id}</span>
          <span className="font-mono text-xs text-gray-300 flex-1 truncate">{row.tool_name}</span>
          <span className={`text-xs px-2 py-0.5 rounded font-semibold uppercase ${decisionBadge[row.decision]}`}>
            {row.decision}
          </span>
          {row.latency_ms != null && (
            <span className="text-gray-600 text-xs tabular-nums w-14 text-right shrink-0">
              {row.latency_ms}ms
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
