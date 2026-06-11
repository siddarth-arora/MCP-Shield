import type { AuditEntry } from "./types";

interface AgentThreatState {
  recentBlocks: number[];
  recentCalls: number[];
  hijackCount: number;
  lastThreatAt: number;
  blockedToolCounts: Map<string, number>;
}

export interface ThreatEvent {
  id: string;
  ts: string;
  agentId: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  threatType: "PROBING_ATTACK" | "SESSION_HIJACKING" | "RATE_ABUSE" | "REPEATED_VIOLATION";
  description: string;
  relatedTools: string[];
}

const agentState = new Map<string, AgentThreatState>();

const THREAT_COOLDOWN_MS = 10_000;
const PROBE_WINDOW_MS = 30_000;
const RATE_WINDOW_MS = 60_000;
const PROBE_BLOCK_THRESHOLD = 5;
const REPEATED_BLOCK_THRESHOLD = 3;
const RATE_CALL_THRESHOLD = 20;

function getState(agentId: string): AgentThreatState {
  let state = agentState.get(agentId);
  if (!state) {
    state = {
      recentBlocks: [],
      recentCalls: [],
      hijackCount: 0,
      lastThreatAt: 0,
      blockedToolCounts: new Map(),
    };
    agentState.set(agentId, state);
  }
  return state;
}

function pruneOlderThan(timestamps: number[], cutoffMs: number): number[] {
  const cutoff = Date.now() - cutoffMs;
  return timestamps.filter((t) => t >= cutoff);
}

function makeThreat(
  agentId: string,
  severity: ThreatEvent["severity"],
  threatType: ThreatEvent["threatType"],
  description: string,
  relatedTools: string[]
): ThreatEvent {
  return {
    id: Date.now().toString(),
    ts: new Date().toISOString(),
    agentId,
    severity,
    threatType,
    description,
    relatedTools,
  };
}

function stamp(event: ThreatEvent, state: AgentThreatState): ThreatEvent {
  state.lastThreatAt = Date.now();
  return event;
}

export function analyze(entry: AuditEntry): ThreatEvent | null {
  const now = Date.now();
  const state = getState(entry.agent_id);

  // Update state
  state.recentCalls.push(now);
  if (entry.decision === "block" || entry.decision === "hijack") {
    state.recentBlocks.push(now);
    const count = (state.blockedToolCounts.get(entry.tool_name) ?? 0) + 1;
    state.blockedToolCounts.set(entry.tool_name, count);
  }
  if (entry.decision === "hijack") {
    state.hijackCount += 1;
  }

  // Prune stale timestamps
  state.recentBlocks = pruneOlderThan(state.recentBlocks, RATE_WINDOW_MS);
  state.recentCalls = pruneOlderThan(state.recentCalls, RATE_WINDOW_MS);

  // Cooldown: suppress duplicate threat events within 10s per agent
  if (now - state.lastThreatAt < THREAT_COOLDOWN_MS) {
    return null;
  }

  // 1. SESSION_HIJACKING
  if (entry.decision === "hijack") {
    return stamp(
      makeThreat(
        entry.agent_id,
        "CRITICAL",
        "SESSION_HIJACKING",
        `Token swap detected on session ${entry.session_id}`,
        [entry.tool_name]
      ),
      state
    );
  }

  // 2. PROBING_ATTACK: 5+ blocks in last 30s
  const recentBlocksInWindow = pruneOlderThan(state.recentBlocks, PROBE_WINDOW_MS);
  if (recentBlocksInWindow.length >= PROBE_BLOCK_THRESHOLD) {
    const windowSec = Math.round(
      (now - (recentBlocksInWindow[0] ?? now)) / 1000
    );
    return stamp(
      makeThreat(
        entry.agent_id,
        "HIGH",
        "PROBING_ATTACK",
        `${recentBlocksInWindow.length} blocked calls in ${windowSec}s — possible tool enumeration`,
        [entry.tool_name]
      ),
      state
    );
  }

  // 3. REPEATED_VIOLATION: same tool blocked 3+ times
  const toolBlockCount = state.blockedToolCounts.get(entry.tool_name) ?? 0;
  if (
    (entry.decision === "block") &&
    toolBlockCount >= REPEATED_BLOCK_THRESHOLD
  ) {
    return stamp(
      makeThreat(
        entry.agent_id,
        "MEDIUM",
        "REPEATED_VIOLATION",
        `Repeated access attempt on ${entry.tool_name}`,
        [entry.tool_name]
      ),
      state
    );
  }

  // 4. RATE_ABUSE: 20+ total calls in 60s
  if (state.recentCalls.length >= RATE_CALL_THRESHOLD) {
    const windowSec = Math.round(
      (now - (state.recentCalls[0] ?? now)) / 1000
    );
    return stamp(
      makeThreat(
        entry.agent_id,
        "LOW",
        "RATE_ABUSE",
        `${state.recentCalls.length} calls in ${windowSec}s — unusual call volume`,
        [entry.tool_name]
      ),
      state
    );
  }

  return null;
}
