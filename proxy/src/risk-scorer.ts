import type { AuditEntry } from "./types";

export interface AgentRiskState {
  score: number;
  level: "SAFE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  lastUpdated: string;
  totalCalls: number;
  blockedCalls: number;
  hijackAttempts: number;
}

const SENSITIVE_TOOLS = new Set([
  "delete_record",
  "drop_table",
  "export_all",
  "bulk_delete",
]);

const scores = new Map<string, AgentRiskState>();

function toLevel(score: number): AgentRiskState["level"] {
  if (score <= 20) return "SAFE";
  if (score <= 40) return "LOW";
  if (score <= 65) return "MEDIUM";
  if (score <= 85) return "HIGH";
  return "CRITICAL";
}

function getOrCreate(agentId: string): AgentRiskState {
  let state = scores.get(agentId);
  if (!state) {
    state = {
      score: 0,
      level: "SAFE",
      lastUpdated: new Date().toISOString(),
      totalCalls: 0,
      blockedCalls: 0,
      hijackAttempts: 0,
    };
    scores.set(agentId, state);
  }
  return state;
}

export function update(entry: AuditEntry): AgentRiskState {
  const state = getOrCreate(entry.agent_id);

  state.totalCalls += 1;

  let delta = 0;
  if (entry.decision === "hijack") {
    delta = 40;
    state.hijackAttempts += 1;
    state.blockedCalls += 1;
  } else if (entry.decision === "block") {
    delta = SENSITIVE_TOOLS.has(entry.tool_name) ? 15 : 8;
    state.blockedCalls += 1;
  } else if (entry.decision === "allow") {
    delta = -1;
  }

  state.score = Math.min(100, Math.max(0, state.score + delta));
  state.level = toLevel(state.score);
  state.lastUpdated = new Date().toISOString();

  return state;
}

export function getAll(): Record<string, AgentRiskState> {
  return Object.fromEntries(scores.entries());
}
