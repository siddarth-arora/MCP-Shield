import type { AuditEntry } from "../types";

interface Props { rows: AuditEntry[] }

const config: Record<"block" | "hijack", {
  border: string; iconBg: string; iconColor: string; label: string; labelColor: string;
}> = {
  block:  { border: "border-rose-500/20",  iconBg: "bg-rose-500/10",  iconColor: "text-rose-400",  label: "BLOCKED",  labelColor: "text-rose-400"  },
  hijack: { border: "border-amber-500/20", iconBg: "bg-amber-500/10", iconColor: "text-amber-400", label: "HIJACK",   labelColor: "text-amber-400" },
};

function BlockIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
    </svg>
  );
}

function HijackIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  );
}

function fmt(ts: string) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function ViolationAlert({ rows }: Props) {
  const violations = rows
    .filter((r): r is AuditEntry & { decision: "block" | "hijack" } =>
      r.decision === "block" || r.decision === "hijack"
    )
    .slice(0, 6);

  if (violations.length === 0) {
    return (
      <div className="rounded-xl border border-white/6 bg-zinc-900 px-4 py-4 text-center">
        <p className="text-xs text-zinc-600">No violations detected</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {violations.map((row) => {
        const c = config[row.decision];
        return (
          <div
            key={`${row.id}-${row.ts}`}
            className={`flex items-center gap-3 rounded-lg border ${c.border} bg-zinc-900 px-3 py-2.5`}
          >
            <span className={`shrink-0 rounded-md p-1.5 ${c.iconBg} ${c.iconColor}`}>
              {row.decision === "block" ? <BlockIcon /> : <HijackIcon />}
            </span>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold tracking-wider ${c.labelColor}`}>{c.label}</span>
                <span className="font-mono text-xs text-zinc-500 truncate">{row.tool_name}</span>
              </div>
              <span className="font-mono text-xs text-cyan-500">{row.agent_id}</span>
            </div>

            <span className="shrink-0 text-xs text-zinc-700 tabular-nums">{fmt(row.ts)}</span>
          </div>
        );
      })}
    </div>
  );
}
