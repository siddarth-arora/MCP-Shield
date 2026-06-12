import { useEffect, useRef, useState } from "react";
import type { AuditEntry, AgentRiskState, ThreatEvent, AccessRequest } from "../types";

const MAX_ROWS = 200;
const MAX_THREATS = 50;

export interface AuditStream {
  rows: AuditEntry[];
  threats: ThreatEvent[];
  riskScores: Record<string, AgentRiskState>;
  accessRequests: Record<string, AccessRequest>;
  connected: boolean;
}

export function useAuditStream(url: string): AuditStream {
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [threats, setThreats] = useState<ThreatEvent[]>([]);
  const [riskScores, setRiskScores] = useState<Record<string, AgentRiskState>>({});
  const [accessRequests, setAccessRequests] = useState<Record<string, AccessRequest>>({});
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource(url);
    esRef.current = es;

    es.addEventListener("open", () => setConnected(true));
    es.addEventListener("error", () => setConnected(false));

    es.addEventListener("message", (e: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(e.data) as
          | { type: "audit"; row: AuditEntry }
          | { type: "threat"; threat: ThreatEvent }
          | { type: "risk"; agentId: string; state: AgentRiskState }
          | { type: "access_request"; request: AccessRequest };

        if (payload.type === "audit") {
          setRows((prev) => {
            const next = [payload.row, ...prev];
            return next.length > MAX_ROWS ? next.slice(0, MAX_ROWS) : next;
          });
        } else if (payload.type === "threat") {
          setThreats((prev) => {
            const next = [payload.threat, ...prev];
            return next.length > MAX_THREATS ? next.slice(0, MAX_THREATS) : next;
          });
        } else if (payload.type === "risk") {
          setRiskScores((prev) => ({
            ...prev,
            [payload.agentId]: payload.state,
          }));
        } else if (payload.type === "access_request") {
          setAccessRequests((prev) => ({
            ...prev,
            [payload.request.id]: payload.request,
          }));
        }
      } catch {
        // malformed frame — ignore
      }
    });

    return () => {
      es.close();
      setConnected(false);
    };
  }, [url]);

  return { rows, threats, riskScores, accessRequests, connected };
}
