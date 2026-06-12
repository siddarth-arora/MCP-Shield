import type { AuditEntry } from "../types";

interface Props { rows: AuditEntry[] }

const dotStyle: Record<AuditEntry["decision"], { bg: string; ring: string }> = {
  allow:  { bg: "bg-emerald-500", ring: "ring-emerald-500/30" },
  block:  { bg: "bg-rose-500",    ring: "ring-rose-500/30"    },
  hijack: { bg: "bg-amber-400",   ring: "ring-amber-400/30"   },
  error:  { bg: "bg-indigo-400",  ring: "ring-indigo-400/30"  },
};

const decisionLabel: Record<AuditEntry["decision"], string> = {
  allow:  "Allowed",
  block:  "Blocked",
  hijack: "Hijack",
  error:  "Error",
};

function fmt(ts: string) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function SessionTimeline({ rows }: Props) {
  const byAgent = new Map<string, AuditEntry[]>();
  for (const row of [...rows].reverse()) {
    const bucket = byAgent.get(row.agent_id) ?? [];
    bucket.push(row);
    byAgent.set(row.agent_id, bucket);
  }

  if (byAgent.size === 0) {
    return (
      <div className="rounded-xl border border-white/6 bg-zinc-900 px-4 py-4 text-center">
        <p className="text-xs text-zinc-600">No sessions yet</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {[...byAgent.entries()].map(([agentId, agentRows]) => {
        const blockCount  = agentRows.filter((r) => r.decision === "block").length;
        const hijackCount = agentRows.filter((r) => r.decision === "hijack").length;
        const hasIssues   = blockCount > 0 || hijackCount > 0;

        return (
          <div
            key={agentId}
            className={`rounded-lg border bg-zinc-900 px-3 py-2.5
              ${hasIssues ? "border-rose-500/15" : "border-white/6"}`}
          >
            <div className="flex items-center gap-3 mb-2">
              <span className="font-mono text-xs font-semibold text-cyan-400 w-20 truncate shrink-0">
                {agentId}
              </span>
              <div className="flex flex-wrap gap-1 flex-1">
                {agentRows.map((row, i) => {
                  const d = dotStyle[row.decision];
                  return (
                    <span
                      key={i}
                      title={`${decisionLabel[row.decision]} · ${row.tool_name} · ${fmt(row.ts)}`}
                      className={`inline-block w-2 h-2 rounded-full ${d.bg} ring-1 ${d.ring}
                                  cursor-default hover:scale-125 transition-transform duration-100`}
                    />
                  );
                })}
              </div>
              <span className="shrink-0 text-xs text-zinc-600 tabular-nums">
                {agentRows.length}
              </span>
            </div>

            {hasIssues && (
              <div className="flex gap-3 text-xs">
                {blockCount > 0 && (
                  <span className="text-rose-400">
                    {blockCount} block{blockCount !== 1 ? "s" : ""}
                  </span>
                )}
                {hijackCount > 0 && (
                  <span className="text-amber-400">
                    {hijackCount} hijack{hijackCount !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
