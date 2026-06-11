import type { AuditEntry } from "../types";

interface Props {
  rows: AuditEntry[];
}

const cardStyle: Record<"block" | "hijack", string> = {
  block:  "border-red-700 bg-red-950/40",
  hijack: "border-amber-600 bg-amber-950/40",
};

const labelStyle: Record<"block" | "hijack", string> = {
  block:  "text-red-400",
  hijack: "text-amber-400",
};

const icon: Record<"block" | "hijack", string> = {
  block:  "✕",
  hijack: "⚠",
};

function fmt(ts: string) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function ViolationAlert({ rows }: Props) {
  const violations = rows
    .filter((r): r is AuditEntry & { decision: "block" | "hijack" } =>
      r.decision === "block" || r.decision === "hijack"
    )
    .slice(0, 5);

  if (violations.length === 0) {
    return (
      <div className="rounded-lg border border-gray-800 bg-gray-900 px-4 py-3 text-gray-500 text-sm text-center">
        No violations detected
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {violations.map((row) => (
        <div
          key={`${row.id}-${row.ts}`}
          className={`rounded-lg border px-4 py-3 ${cardStyle[row.decision]}`}
        >
          <div className="flex items-center gap-2">
            <span className={`text-lg font-bold ${labelStyle[row.decision]}`}>{icon[row.decision]}</span>
            <span className={`text-sm font-semibold uppercase tracking-wide ${labelStyle[row.decision]}`}>
              {row.decision}
            </span>
            <span className="text-gray-400 text-xs ml-auto tabular-nums">{fmt(row.ts)}</span>
          </div>
          <div className="mt-1.5 flex gap-4 text-xs">
            <span>
              <span className="text-gray-500">agent </span>
              <span className="font-mono text-cyan-300">{row.agent_id}</span>
            </span>
            <span>
              <span className="text-gray-500">tool </span>
              <span className="font-mono text-gray-200">{row.tool_name}</span>
            </span>
            {row.policy_rule && (
              <span className="text-gray-500 truncate">{row.policy_rule}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
