import type { AgentRiskState } from "../types";
import { RiskGauge } from "./RiskGauge";

interface Props {
  riskScores: Record<string, AgentRiskState>;
}

function RefreshIcon() {
  return (
    <svg
      className="w-3.5 h-3.5 text-gray-500"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  );
}

export function RiskPanel({ riskScores }: Props) {
  const entries = Object.entries(riskScores).sort(([, a], [, b]) => b.score - a.score);

  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500">
          Agent risk scores
        </h2>
        <RefreshIcon />
        {entries.length > 0 && (
          <span className="ml-auto text-xs text-gray-600">
            {entries.length} agent{entries.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-gray-600 text-center py-4">No agents seen yet</p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {entries.map(([agentId, state]) => (
            <RiskGauge key={agentId} agentId={agentId} state={state} />
          ))}
        </div>
      )}
    </div>
  );
}
