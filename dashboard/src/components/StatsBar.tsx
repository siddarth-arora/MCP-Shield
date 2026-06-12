import { useEffect, useRef, useState } from "react";
import type { AuditEntry } from "../types";

interface Props { rows: AuditEntry[] }

interface Metric {
  label: string;
  value: string | number;
  accent: string;      /* Tailwind bg class for top bar */
  textColor: string;
}

function AnimatedNumber({ value }: { value: number }) {
  const prev = useRef(value);
  const [key, setKey] = useState(0);

  useEffect(() => {
    if (value !== prev.current) {
      prev.current = value;
      setKey((k) => k + 1);
    }
  }, [value]);

  return (
    <span key={key} className="tabular-nums animate-number-pop">
      {value}
    </span>
  );
}

export function StatsBar({ rows }: Props) {
  const total   = rows.length;
  const allowed = rows.filter((r) => r.decision === "allow").length;
  const blocked = rows.filter((r) => r.decision === "block").length;
  const hijacks = rows.filter((r) => r.decision === "hijack").length;
  const rate    = total > 0 ? ((allowed / total) * 100).toFixed(1) : "—";

  const metrics: Metric[] = [
    { label: "Total calls",  value: total,       accent: "bg-zinc-600",    textColor: "text-zinc-100" },
    { label: "Allowed",      value: allowed,      accent: "bg-emerald-500", textColor: "text-emerald-300" },
    { label: "Blocked",      value: blocked,      accent: "bg-rose-500",    textColor: "text-rose-300" },
    { label: "Hijacks",      value: hijacks,      accent: "bg-amber-500",   textColor: "text-amber-300" },
    { label: "Allow rate",   value: `${rate}%`,   accent: "bg-cyan-500",    textColor: "text-cyan-300" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {metrics.map((m) => (
        <div
          key={m.label}
          className="relative overflow-hidden rounded-xl border border-white/6 bg-zinc-900
                     flex flex-col gap-1 px-4 pt-4 pb-3
                     hover:border-white/10 transition-colors duration-200"
        >
          {/* colored top accent bar */}
          <span className={`absolute inset-x-0 top-0 h-0.5 ${m.accent}`} />

          <span className={`text-2xl font-bold leading-none ${m.textColor}`}>
            {typeof m.value === "number"
              ? <AnimatedNumber value={m.value} />
              : m.value}
          </span>
          <span className="text-xs font-medium text-zinc-500 uppercase tracking-widest">
            {m.label}
          </span>
        </div>
      ))}
    </div>
  );
}
