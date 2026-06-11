import { useEffect, useRef, useState } from "react";
import type { AgentRiskState } from "../types";

interface Props {
  agentId: string;
  state: AgentRiskState;
}

// Arc geometry: semicircle, center (60, 70), radius 50
// Left end: (10, 70), sweeps clockwise over the top to right end: (110, 70)
const CX = 60;
const CY = 70;
const R = 50;

const levelColor: Record<AgentRiskState["level"], string> = {
  SAFE:     "#22c55e",  // green-500
  LOW:      "#3b82f6",  // blue-500
  MEDIUM:   "#f59e0b",  // amber-500
  HIGH:     "#f97316",  // orange-500
  CRITICAL: "#ef4444",  // red-500
};

const levelBadge: Record<AgentRiskState["level"], string> = {
  SAFE:     "bg-green-900/60 text-green-300 border-green-700",
  LOW:      "bg-blue-900/60 text-blue-300 border-blue-700",
  MEDIUM:   "bg-amber-900/60 text-amber-300 border-amber-700",
  HIGH:     "bg-orange-900/60 text-orange-300 border-orange-700",
  CRITICAL: "bg-red-900/60 text-red-300 border-red-700",
};

// Compute foreground arc endpoint for a given score (0–100).
// Angles in standard math convention (CCW from +x axis):
//   score=0  → 180° (left end)
//   score=50 → 90°  (top)
//   score=100 → 0°  (right end)
function arcEndpoint(score: number): { x: number; y: number; largeArc: 0 | 1 } {
  const angleDeg = (1 - score / 100) * 180;
  const angleRad = (angleDeg * Math.PI) / 180;
  return {
    x: CX + R * Math.cos(angleRad),
    y: CY - R * Math.sin(angleRad),
    // For this semicircle sweep (≤180°) large-arc is always 0
    largeArc: 0,
  };
}

export function RiskGauge({ agentId, state }: Props) {
  const color = levelColor[state.level];
  const prevLevelRef = useRef(state.level);
  const [pulsing, setPulsing] = useState(false);

  useEffect(() => {
    const prev = prevLevelRef.current;
    const isHighSeverity = state.level === "HIGH" || state.level === "CRITICAL";
    const wasLower =
      prev === "SAFE" || prev === "LOW" || prev === "MEDIUM" ||
      (prev === "HIGH" && state.level === "CRITICAL");

    if (isHighSeverity && wasLower) {
      setPulsing(true);
      const t = setTimeout(() => setPulsing(false), 2500);
      prevLevelRef.current = state.level;
      return () => clearTimeout(t);
    }
    prevLevelRef.current = state.level;
  }, [state.level]);

  const startX = CX - R; // 10
  const startY = CY;     // 70

  // Background arc path (full 180°, clockwise, sweep-flag=1)
  const bgPath = `M ${startX} ${startY} A ${R} ${R} 0 0 1 ${CX + R} ${startY}`;

  // Foreground arc path (proportional to score)
  let fgPath: string | null = null;
  if (state.score > 0) {
    const { x, y, largeArc } = arcEndpoint(state.score);
    fgPath = `M ${startX} ${startY} A ${R} ${R} 0 ${largeArc} 1 ${x.toFixed(2)} ${y.toFixed(2)}`;
  }

  return (
    <div className="flex flex-col items-center bg-gray-900 border border-gray-800 rounded-lg p-3 gap-1">
      <svg width="120" height="82" viewBox="0 0 120 82" aria-label={`Risk gauge for ${agentId}`}>
        {/* Background arc */}
        <path
          d={bgPath}
          fill="none"
          stroke="#374151"
          strokeWidth="8"
          strokeLinecap="round"
        />

        {/* Foreground arc */}
        {fgPath && (
          <path
            d={fgPath}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            className={pulsing ? "animate-gauge-pulse" : undefined}
          />
        )}

        {/* Score number */}
        <text
          x={CX}
          y={CY - 4}
          textAnchor="middle"
          dominantBaseline="auto"
          fontFamily="ui-monospace, monospace"
          fontSize="22"
          fontWeight="700"
          fill="white"
        >
          {state.score}
        </text>
      </svg>

      {/* Agent ID */}
      <span className="font-mono text-xs text-cyan-400 truncate max-w-[108px]">{agentId}</span>

      {/* Level badge */}
      <span
        className={`inline-block rounded border px-2 py-0.5 text-xs font-bold tracking-wider ${levelBadge[state.level]}`}
      >
        {state.level}
      </span>
    </div>
  );
}
