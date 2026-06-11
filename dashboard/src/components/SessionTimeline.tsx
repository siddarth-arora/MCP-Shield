import type { AuditEntry } from "../types";

interface Props {
  rows: AuditEntry[];
}

const dotColor: Record<AuditEntry["decision"], string> = {
  allow:  "bg-green-500",
  block:  "bg-red-500",
  hijack: "bg-amber-400",
};

const dotTitle: Record<AuditEntry["decision"], string> = {
  allow:  "Allowed",
  block:  "Blocked",
  hijack: "Hijack",
};

export function SessionTimeline({ rows }: Props) {
  // Group by agent_id, preserving insertion order (rows are newest-first)
  const byAgent = new Map<string, AuditEntry[]>();
  for (const row of [...rows].reverse()) {
    const bucket = byAgent.get(row.agent_id) ?? [];
    bucket.push(row);
    byAgent.set(row.agent_id, bucket);
  }

  if (byAgent.size === 0) {
    return (
      <div className="rounded-lg border border-gray-800 bg-gray-900 px-4 py-3 text-gray-500 text-sm text-center">
        No sessions yet
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {[...byAgent.entries()].map(([agentId, agentRows]) => (
        <div key={agentId} className="flex items-center gap-3 bg-gray-900 rounded-lg px-3 py-2">
          <span className="font-mono text-xs text-cyan-300 w-20 shrink-0 truncate">{agentId}</span>
          <div className="flex flex-wrap gap-1">
            {agentRows.map((row, i) => (
              <span
                key={i}
                title={`${dotTitle[row.decision]} — ${row.tool_name} @ ${new Date(row.ts).toLocaleTimeString()}`}
                className={`inline-block w-2.5 h-2.5 rounded-full ${dotColor[row.decision]}`}
              />
            ))}
          </div>
          <span className="ml-auto text-gray-600 text-xs tabular-nums">{agentRows.length} calls</span>
        </div>
      ))}
    </div>
  );
}
