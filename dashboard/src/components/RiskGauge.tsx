import { useEffect, useRef, useState } from "react";
import type { AgentRiskState } from "../types";

interface Props { agentId: string; state: AgentRiskState }

const CX = 60, CY = 68, R = 48;

const levelConfig: Record<AgentRiskState["level"], { stroke: string; badge: string; text: string }> = {
  SAFE:     { stroke: "#10b981", badge: "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20", text: "text-emerald-400" },
  LOW:      { stroke: "#3b82f6", badge: "bg-blue-500/10    text-blue-400    ring-1 ring-blue-500/20",    text: "text-blue-400"    },
  MEDIUM:   { stroke: "#f59e0b", badge: "bg-amber-500/10   text-amber-400   ring-1 ring-amber-500/20",   text: "text-amber-400"   },
  HIGH:     { stroke: "#f97316", badge: "bg-orange-500/10  text-orange-400  ring-1 ring-orange-500/20",  text: "text-orange-400"  },
  CRITICAL: { stroke: "#f43f5e", badge: "bg-rose-500/10    text-rose-400    ring-1 ring-rose-500/25",    text: "text-rose-400"    },
};

function arcPoint(score: number) {
  const angle = (1 - score / 100) * Math.PI;   // 180° → 0° left to right
  return {
    x: CX + R * Math.cos(angle),
    y: CY - R * Math.sin(angle),
    largeArc: score > 50 ? 1 : 0,
  };
}

export function RiskGauge({ agentId, state }: Props) {
  const cfg = levelConfig[state.level];
  const prevLevel = useRef(state.level);
  const [pulsing, setPulsing] = useState(false);

  useEffect(() => {
    const wasLower = ["SAFE", "LOW", "MEDIUM"].includes(prevLevel.current) ||
      (prevLevel.current === "HIGH" && state.level === "CRITICAL");
    if ((state.level === "HIGH" || state.level === "CRITICAL") && wasLower) {
      setPulsing(true);
      setTimeout(() => setPulsing(false), 2600);
    }
    prevLevel.current = state.level;
  }, [state.level]);

  const bgPath = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`;

  let fgPath: string | null = null;
  if (state.score > 0 && state.score < 100) {
    const { x, y, largeArc } = arcPoint(state.score);
    fgPath = `M ${CX - R} ${CY} A ${R} ${R} 0 ${largeArc} 1 ${x.toFixed(2)} ${y.toFixed(2)}`;
  } else if (state.score >= 100) {
    fgPath = bgPath;
  }

  // Dot at arc end
  let dot: { x: number; y: number } | null = null;
  if (state.score > 0 && state.score <= 100) {
    const p = arcPoint(Math.min(state.score, 99.9));
    dot = { x: p.x, y: p.y };
  }

  return (
    <div
      className={`flex flex-col items-center rounded-xl border bg-zinc-900 px-4 py-3 gap-1.5
                  transition-colors duration-300
                  ${pulsing ? "border-rose-500/40" : "border-white/6"}
                  hover:border-white/10`}
    >
      <svg width="120" height="78" viewBox="0 0 120 78" aria-label={`Risk: ${state.score}`}>
        {/* Track */}
        <path d={bgPath} fill="none" stroke="#27272a" strokeWidth="7" strokeLinecap="round" />

        {/* Fill */}
        {fgPath && (
          <path
            d={fgPath}
            fill="none"
            stroke={cfg.stroke}
            strokeWidth="7"
            strokeLinecap="round"
            className={pulsing ? "animate-gauge-pulse" : undefined}
          />
        )}

        {/* Endpoint dot */}
        {dot && (
          <circle cx={dot.x} cy={dot.y} r="4" fill={cfg.stroke} />
        )}

        {/* Score */}
        <text
          x={CX} y={CY - 6}
          textAnchor="middle"
          dominantBaseline="auto"
          fontFamily="ui-monospace, monospace"
          fontSize="20"
          fontWeight="700"
          fill="white"
        >
          {state.score}
        </text>
      </svg>

      <span className="font-mono text-xs text-cyan-400 truncate max-w-27">{agentId}</span>

      <span className={`text-xs px-2 py-0.5 rounded font-bold tracking-wider ${cfg.badge}`}>
        {state.level}
      </span>

      <div className="flex gap-3 text-xs text-zinc-600 mt-0.5">
        <span title="Total calls">{state.totalCalls} calls</span>
        <span title="Blocked" className={state.blockedCalls > 0 ? "text-rose-500" : ""}>
          {state.blockedCalls} blocked
        </span>
      </div>
    </div>
  );
}
