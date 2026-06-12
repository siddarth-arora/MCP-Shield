import type { AgentRiskState } from "../types";
import { RiskGauge } from "./RiskGauge";

interface Props { riskScores: Record<string, AgentRiskState> }

export function RiskPanel({ riskScores }: Props) {
  const entries = Object.entries(riskScores).sort(([, a], [, b]) => b.score - a.score);

  return (
    <div className="rounded-xl border border-white/6 bg-zinc-900/50 p-4">
      <div className="flex items-center gap-2 mb-4">
        <svg className="w-3.5 h-3.5 text-zinc-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
        </svg>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
          Agent risk scores
        </h2>
        {entries.length > 0 && (
          <span className="ml-auto text-xs text-zinc-700">
            {entries.length} agent{entries.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-zinc-700 text-center py-6">No agents seen yet</p>
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
