export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: JsonRpcError;
}

export interface AgentClaims {
  sub: string;
  role: string;
  session: string;
  iat: number;
  exp: number;
}

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
