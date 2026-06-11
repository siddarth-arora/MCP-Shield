import type { AgentClaims } from "./types";

interface SessionEntry {
  agentId: string;
  token: string;
  claims: AgentClaims;
}

interface VerifyResult {
  valid: boolean;
  hijack?: true;
  reason?: string;
}

export class SessionStore {
  private readonly sessions = new Map<string, SessionEntry>();

  bind(sessionId: string, claims: AgentClaims, token: string): void {
    this.sessions.set(sessionId, { agentId: claims.sub, token, claims });
  }

  verify(sessionId: string, incomingToken: string, incomingAgentId: string): VerifyResult {
    const entry = this.sessions.get(sessionId);

    if (!entry) {
      // New session — will be bound after this check passes
      return { valid: true };
    }

    if (entry.token !== incomingToken || entry.agentId !== incomingAgentId) {
      const reason =
        entry.agentId !== incomingAgentId
          ? `Agent mismatch: session owned by '${entry.agentId}', got '${incomingAgentId}'`
          : `Token mismatch for session '${sessionId}' — possible token swap`;
      return { valid: false, hijack: true, reason };
    }

    return { valid: true };
  }
}

export const sessionStore = new SessionStore();
