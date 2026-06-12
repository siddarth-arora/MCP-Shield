import * as crypto from "crypto";
import * as path from "path";
import type { Writable } from "stream";
import Database from "better-sqlite3";
import type { AuditEntry } from "./types";
import { analyze, type ThreatEvent } from "./threat-detector";
import { update as riskUpdate, getAll as riskGetAll, type AgentRiskState } from "./risk-scorer";

const dbPath = path.resolve(process.cwd(), process.env["DB_FILE"] ?? "./audit.db");
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS audit_log (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    ts            TEXT    NOT NULL,
    agent_id      TEXT    NOT NULL,
    session_id    TEXT    NOT NULL,
    tool_name     TEXT    NOT NULL,
    decision      TEXT    NOT NULL CHECK(decision IN ('allow','block','hijack','error')),
    policy_rule   TEXT,
    request_hash  TEXT    NOT NULL,
    latency_ms         INTEGER,
    target_server      TEXT,
    access_request_id  TEXT
  )
`);

// Migrations: add columns to databases created before they existed
try { db.exec("ALTER TABLE audit_log ADD COLUMN target_server TEXT"); } catch { /* exists */ }
try { db.exec("ALTER TABLE audit_log ADD COLUMN access_request_id TEXT"); } catch { /* exists */ }

const insertStmt = db.prepare(`
  INSERT INTO audit_log (ts, agent_id, session_id, tool_name, decision, policy_rule, request_hash, latency_ms, target_server, access_request_id)
  VALUES (@ts, @agent_id, @session_id, @tool_name, @decision, @policy_rule, @request_hash, @latency_ms, @target_server, @access_request_id)
`);

const recentStmt = db.prepare(
  "SELECT * FROM audit_log ORDER BY id DESC LIMIT ?"
);

const statsStmt = db.prepare(`
  SELECT
    COUNT(*)                                                      AS totalCalls,
    SUM(CASE WHEN decision != 'allow' THEN 1 ELSE 0 END)         AS blocked,
    SUM(CASE WHEN decision = 'hijack' THEN 1 ELSE 0 END)         AS hijacks
  FROM audit_log
`);

export interface AuditStats {
  totalCalls: number;
  blocked: number;
  hijacks: number;
  allowRate: number;
}

export function getStats(): AuditStats {
  const row = statsStmt.get() as { totalCalls: number; blocked: number; hijacks: number };
  const { totalCalls, blocked, hijacks } = row;
  const allowRate = totalCalls > 0 ? (totalCalls - blocked) / totalCalls : 1;
  return { totalCalls, blocked, hijacks, allowRate };
}

const sseClients = new Set<Writable>();
const threatHistory: ThreatEvent[] = [];

export function getRiskScores(): Record<string, AgentRiskState> {
  return riskGetAll();
}

export function getThreats(limit = 20): ThreatEvent[] {
  return threatHistory.slice(0, limit);
}

export function addSseClient(stream: Writable): void {
  sseClients.add(stream);
}

export function removeSseClient(stream: Writable): void {
  sseClients.delete(stream);
}

export function broadcastSse(data: unknown): void {
  const event = `data: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach((client) => {
    if (!client.writableEnded) client.write(event);
  });
}

export function getRecent(limit = 50): AuditEntry[] {
  return (recentStmt.all(limit) as AuditEntry[]).reverse();
}

export function write(
  entry: Omit<AuditEntry, "id" | "request_hash">,
  rawBody: string
): void {
  const request_hash = crypto.createHash("sha256").update(rawBody).digest("hex");
  const row: Omit<AuditEntry, "id"> = { ...entry, request_hash };

  let rowId: number | undefined;
  try {
    const { lastInsertRowid } = insertStmt.run(row);
    rowId = Number(lastInsertRowid);
  } catch (err) {
    // Old DB with stricter CHECK constraint (e.g. missing 'error') — log but continue
    console.error("[audit] DB write failed:", err);
  }
  const fullRow: AuditEntry = { ...row, ...(rowId !== undefined ? { id: rowId } : {}) };

  const auditEvent = `data: ${JSON.stringify({ type: "audit", row: fullRow })}\n\n`;
  for (const client of sseClients) {
    if (!client.writableEnded) client.write(auditEvent);
  }

  const threat = analyze(fullRow);
  if (threat) {
    threatHistory.unshift(threat);
    if (threatHistory.length > 50) threatHistory.pop();
    const threatEvent = `data: ${JSON.stringify({ type: "threat", threat })}\n\n`;
    sseClients.forEach((client) => {
      if (!client.writableEnded) client.write(threatEvent);
    });
  }

  const riskState = riskUpdate(fullRow);
  sseClients.forEach((client) => {
    if (!client.writableEnded)
      client.write(`data: ${JSON.stringify({ type: "risk", agentId: entry.agent_id, state: riskState })}\n\n`);
  });
}
