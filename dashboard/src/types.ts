export interface AuditEntry {
  id?: number;
  ts: string;
  agent_id: string;
  session_id: string;
  tool_name: string;
  decision: "allow" | "block" | "hijack" | "error";
  policy_rule?: string | null;
  request_hash: string;
  latency_ms?: number | null;
  target_server?: string | null;
}

export interface AgentRiskState {
  score: number;
  level: "SAFE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  lastUpdated: string;
  totalCalls: number;
  blockedCalls: number;
  hijackAttempts: number;
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
