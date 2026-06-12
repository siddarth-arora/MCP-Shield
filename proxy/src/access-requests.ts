import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import Database from "better-sqlite3";
import { broadcastSse } from "./audit";
import { policyEngine, type PolicyFile } from "./policy";

export interface AccessRequest {
  id: string;
  createdAt: string;
  agentId: string;
  agentRole: string;
  toolName: string;
  targetServer?: string;
  policyRule: string;
  reason: string;
  sessionId: string;
  requestHash: string;
  status: "PENDING" | "APPROVED" | "DENIED";
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNote?: string;
}

// Raw DB row shape (snake_case columns)
interface DbRow {
  id: string;
  created_at: string;
  agent_id: string;
  agent_role: string;
  tool_name: string;
  target_server: string | null;
  policy_rule: string;
  reason: string;
  session_id: string;
  request_hash: string;
  status: "PENDING" | "APPROVED" | "DENIED";
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
}

const dbPath = path.resolve(process.cwd(), process.env["DB_FILE"] ?? "./audit.db");
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS access_requests (
    id              TEXT PRIMARY KEY,
    created_at      TEXT NOT NULL,
    agent_id        TEXT NOT NULL,
    agent_role      TEXT NOT NULL,
    tool_name       TEXT NOT NULL,
    target_server   TEXT,
    policy_rule     TEXT NOT NULL,
    reason          TEXT NOT NULL,
    session_id      TEXT NOT NULL,
    request_hash    TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'PENDING'
                    CHECK(status IN ('PENDING','APPROVED','DENIED')),
    resolved_at     TEXT,
    resolved_by     TEXT,
    resolution_note TEXT
  )
`);

const insertStmt = db.prepare(`
  INSERT INTO access_requests
    (id, created_at, agent_id, agent_role, tool_name, target_server,
     policy_rule, reason, session_id, request_hash, status)
  VALUES
    (@id, @created_at, @agent_id, @agent_role, @tool_name, @target_server,
     @policy_rule, @reason, @session_id, @request_hash, 'PENDING')
`);

const selectByIdStmt = db.prepare("SELECT * FROM access_requests WHERE id = ?");

const updateStmt = db.prepare(`
  UPDATE access_requests
  SET status = @status, resolved_at = @resolved_at,
      resolved_by = @resolved_by, resolution_note = @resolution_note
  WHERE id = @id
`);

// --- ID generation ---

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function randomSegment(length: number): string {
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes)
    .map((b) => CHARS[b % CHARS.length])
    .join("");
}

function generateId(): string {
  return `MCPA-${randomSegment(3)}-${randomSegment(5)}`;
}

// --- Row mapping ---

function fromRow(row: DbRow): AccessRequest {
  const req: AccessRequest = {
    id: row.id,
    createdAt: row.created_at,
    agentId: row.agent_id,
    agentRole: row.agent_role,
    toolName: row.tool_name,
    policyRule: row.policy_rule,
    reason: row.reason,
    sessionId: row.session_id,
    requestHash: row.request_hash,
    status: row.status,
  };
  if (row.target_server != null) req.targetServer = row.target_server;
  if (row.resolved_at != null) req.resolvedAt = row.resolved_at;
  if (row.resolved_by != null) req.resolvedBy = row.resolved_by;
  if (row.resolution_note != null) req.resolutionNote = row.resolution_note;
  return req;
}

// --- Policy approval helper ---

function addToolToRole(role: string, toolName: string): void {
  const policyPath = path.resolve(
    process.cwd(),
    process.env["POLICY_FILE"] ?? "../policy.yaml"
  );
  const policy = policyEngine.getPolicy() as PolicyFile;

  const rolePolicy = policy.roles[role];
  if (!rolePolicy) return;

  // Already allowed — nothing to do
  if (rolePolicy.allowed_tools.includes("*") || rolePolicy.allowed_tools.includes(toolName)) return;

  // Remove from denied_tools if present (approval overrides explicit deny)
  if (rolePolicy.denied_tools) {
    rolePolicy.denied_tools = rolePolicy.denied_tools.filter((t) => t !== toolName);
    if (rolePolicy.denied_tools.length === 0) delete rolePolicy.denied_tools;
  }

  rolePolicy.allowed_tools = [...rolePolicy.allowed_tools, toolName];

  const yamlStr = yaml.dump(policy, { lineWidth: 120 });
  fs.writeFileSync(policyPath, yamlStr, "utf-8");
  console.log(`[access-requests] Approved: added '${toolName}' to role '${role}' in policy`);
}

// --- Public API ---

export function create(
  entry: Omit<AccessRequest, "id" | "createdAt" | "status">
): AccessRequest {
  const id = generateId();
  const createdAt = new Date().toISOString();

  insertStmt.run({
    id,
    created_at: createdAt,
    agent_id: entry.agentId,
    agent_role: entry.agentRole,
    tool_name: entry.toolName,
    target_server: entry.targetServer ?? null,
    policy_rule: entry.policyRule,
    reason: entry.reason,
    session_id: entry.sessionId,
    request_hash: entry.requestHash,
  });

  const request: AccessRequest = { ...entry, id, createdAt, status: "PENDING" };
  broadcastSse({ type: "access_request", request });
  return request;
}

export function getById(id: string): AccessRequest | null {
  const row = selectByIdStmt.get(id) as DbRow | undefined;
  return row ? fromRow(row) : null;
}

export function getAll(filter?: { status?: string; agentId?: string }): AccessRequest[] {
  let sql = "SELECT * FROM access_requests";
  const conditions: string[] = [];
  const params: Record<string, string> = {};

  if (filter?.status) {
    conditions.push("status = @status");
    params["status"] = filter.status;
  }
  if (filter?.agentId) {
    conditions.push("agent_id = @agentId");
    params["agentId"] = filter.agentId;
  }
  if (conditions.length > 0) sql += " WHERE " + conditions.join(" AND ");
  sql += " ORDER BY created_at DESC";

  const rows = db.prepare(sql).all(params) as DbRow[];
  return rows.map(fromRow);
}

export function resolve(
  id: string,
  status: "APPROVED" | "DENIED",
  resolvedBy: string,
  note?: string
): AccessRequest | null {
  const existing = getById(id);
  if (!existing || existing.status !== "PENDING") return null;

  const resolvedAt = new Date().toISOString();

  updateStmt.run({
    id,
    status,
    resolved_at: resolvedAt,
    resolved_by: resolvedBy,
    resolution_note: note ?? null,
  });

  if (status === "APPROVED") {
    addToolToRole(existing.agentRole, existing.toolName);
  }

  const updated: AccessRequest = {
    ...existing,
    status,
    resolvedAt,
    resolvedBy,
    ...(note != null ? { resolutionNote: note } : {}),
  };

  broadcastSse({ type: "access_request", request: updated });
  return updated;
}
