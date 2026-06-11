import type { AuditEntry } from "../types";

interface Props {
  rows: AuditEntry[];
}

interface Badge {
  label: string;
  value: string | number;
  color: string;
}

export function StatsBar({ rows }: Props) {
  const total = rows.length;
  const allowed = rows.filter((r) => r.decision === "allow").length;
  const blocked = rows.filter((r) => r.decision === "block").length;
  const hijacks = rows.filter((r) => r.decision === "hijack").length;
  const allowRate = total > 0 ? ((allowed / total) * 100).toFixed(1) : "—";

  const badges: Badge[] = [
    { label: "Total calls",  value: total,             color: "bg-gray-800 text-gray-200" },
    { label: "Allowed",      value: allowed,           color: "bg-green-900/60 text-green-300" },
    { label: "Blocked",      value: blocked,           color: "bg-red-900/60 text-red-300" },
    { label: "Hijacks",      value: hijacks,           color: "bg-amber-900/60 text-amber-300" },
    { label: "Allow rate",   value: `${allowRate}%`,   color: "bg-blue-900/60 text-blue-300" },
  ];

  return (
    <div className="flex flex-wrap gap-3">
      {badges.map((b) => (
        <div key={b.label} className={`flex flex-col items-center rounded-lg px-5 py-3 ${b.color}`}>
          <span className="text-2xl font-bold tabular-nums">{b.value}</span>
          <span className="text-xs uppercase tracking-widest opacity-70 mt-0.5">{b.label}</span>
        </div>
      ))}
    </div>
  );
}
