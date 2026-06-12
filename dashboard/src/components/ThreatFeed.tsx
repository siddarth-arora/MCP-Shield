import type { ThreatEvent } from "../types";

interface Props { threats: ThreatEvent[] }

const severityConfig: Record<ThreatEvent["severity"], {
  border: string; bg: string; badge: string; glow: boolean; dot: string;
}> = {
  CRITICAL: { border: "border-rose-500/40",   bg: "bg-rose-500/5",   badge: "bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30",   glow: true,  dot: "bg-rose-500"   },
  HIGH:     { border: "border-orange-500/30", bg: "bg-orange-500/5", badge: "bg-orange-500/15 text-orange-300 ring-1 ring-orange-500/30", glow: false, dot: "bg-orange-400" },
  MEDIUM:   { border: "border-amber-500/25",  bg: "bg-amber-500/5",  badge: "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30",   glow: false, dot: "bg-amber-400"  },
  LOW:      { border: "border-blue-500/20",   bg: "bg-blue-500/5",   badge: "bg-blue-500/15 text-blue-300 ring-1 ring-blue-500/25",      glow: false, dot: "bg-blue-400"   },
};

const threatIcon: Record<ThreatEvent["threatType"], string> = {
  PROBING_ATTACK:     "M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z",
  SESSION_HIJACKING:  "M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z",
  RATE_ABUSE:         "M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z",
  REPEATED_VIOLATION: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z",
};

function fmt(ts: string) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function ThreatFeed({ threats }: Props) {
  const visible = threats.slice(0, 8);

  if (visible.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-white/6 bg-zinc-900 py-10 text-center">
        <div className="rounded-full bg-emerald-500/10 p-3">
          <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-medium text-zinc-400">System secure</p>
          <p className="text-xs text-zinc-600 mt-0.5">No threats detected</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {visible.map((t) => {
        const cfg = severityConfig[t.severity];
        return (
          <div
            key={t.id}
            className={`rounded-xl border ${cfg.border} ${cfg.bg} px-3.5 py-3 space-y-2 animate-fade-in
                        ${cfg.glow ? "animate-glow-pulse" : ""}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className={`shrink-0 w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                <span className="font-mono text-xs font-semibold text-zinc-200 truncate">
                  {t.threatType.replace(/_/g, " ")}
                </span>
              </div>
              <span className={`shrink-0 text-xs px-2 py-0.5 rounded font-bold tracking-wider ${cfg.badge}`}>
                {t.severity}
              </span>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">{t.description}</p>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <svg className="w-3 h-3 text-zinc-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d={threatIcon[t.threatType]} />
                </svg>
                <span className="font-mono text-xs text-cyan-500">{t.agentId}</span>
              </div>
              <span className="text-xs text-zinc-600 tabular-nums">{fmt(t.ts)}</span>
            </div>

            {t.relatedTools.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-0.5">
                {t.relatedTools.slice(0, 4).map((tool) => (
                  <span key={tool} className="font-mono text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">
                    {tool}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
