import type { ThreatEvent } from "../types";

interface Props {
  threats: ThreatEvent[];
}

const borderColor: Record<ThreatEvent["severity"], string> = {
  CRITICAL: "border-l-red-500",
  HIGH:     "border-l-orange-400",
  MEDIUM:   "border-l-yellow-400",
  LOW:      "border-l-blue-400",
};

const badgeBg: Record<ThreatEvent["severity"], string> = {
  CRITICAL: "bg-red-900/70 text-red-300 border-red-600",
  HIGH:     "bg-orange-900/70 text-orange-300 border-orange-600",
  MEDIUM:   "bg-yellow-900/70 text-yellow-300 border-yellow-600",
  LOW:      "bg-blue-900/70 text-blue-300 border-blue-600",
};

function ShieldIcon() {
  return (
    <svg
      className="w-8 h-8 text-green-600"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
      />
    </svg>
  );
}

export function ThreatFeed({ threats }: Props) {
  const visible = threats.slice(0, 10);

  if (visible.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-gray-800 bg-gray-900 py-6 text-center">
        <ShieldIcon />
        <span className="text-sm text-gray-500">No threats detected</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {visible.map((t) => (
        <div
          key={t.id}
          className={`rounded-lg border-l-4 border border-gray-800 bg-gray-900 px-4 py-3 space-y-1.5 animate-fade-in ${borderColor[t.severity]}`}
        >
          <div className="flex items-start justify-between gap-2">
            <span className="font-mono text-xs font-semibold text-gray-200 tracking-wide">
              {t.threatType}
            </span>
            <span
              className={`shrink-0 inline-block rounded border px-2 py-0.5 text-xs font-bold tracking-wider ${badgeBg[t.severity]}`}
            >
              {t.severity}
            </span>
          </div>
          <p className="text-xs text-gray-400 leading-snug">{t.description}</p>
          <div className="flex items-center justify-between text-xs text-gray-600">
            <span className="font-mono text-cyan-700">{t.agentId}</span>
            <span className="tabular-nums">
              {new Date(t.ts).toLocaleTimeString()}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
