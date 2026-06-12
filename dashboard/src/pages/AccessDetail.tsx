import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import type { AccessRequest } from "../types";

const PROXY = "http://localhost:4000";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtFull(ts: string) {
  return new Date(ts).toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function fmtTime(ts: string) {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const statusStyles: Record<AccessRequest["status"], string> = {
  PENDING:  "bg-orange-900/60 text-orange-200 border border-orange-700/80 ring-1 ring-orange-600/30",
  APPROVED: "bg-green-900/60 text-green-200 border border-green-700/80",
  DENIED:   "bg-red-900/60 text-red-300 border border-red-700/80",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function GridField({
  label,
  value,
  mono = false,
  truncate = false,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
  truncate?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-xs text-gray-500 uppercase tracking-wider">{label}</span>
      <span
        className={`text-sm text-gray-200 ${mono ? "font-mono" : ""} ${truncate ? "truncate" : "break-all"}`}
        title={truncate ? value : undefined}
      >
        {value}
      </span>
    </div>
  );
}

interface TimelineEntry {
  ts: string;
  label: string;
  sub?: string;
  variant?: "default" | "green" | "red";
}

function Timeline({ entries }: { entries: TimelineEntry[] }) {
  const dotColor: Record<NonNullable<TimelineEntry["variant"]>, string> = {
    default: "bg-gray-600",
    green:   "bg-green-500",
    red:     "bg-red-500",
  };
  const textColor: Record<NonNullable<TimelineEntry["variant"]>, string> = {
    default: "text-gray-300",
    green:   "text-green-300",
    red:     "text-red-300",
  };

  return (
    <div className="flex flex-col gap-3">
      {entries.map((e, i) => (
        <div key={i} className="flex gap-3 items-start">
          <div className="flex flex-col items-center pt-1 shrink-0">
            <span
              className={`w-2 h-2 rounded-full ${dotColor[e.variant ?? "default"]}`}
            />
            {i < entries.length - 1 && (
              <span className="w-px flex-1 bg-gray-800 mt-1.5" style={{ minHeight: 16 }} />
            )}
          </div>
          <div className="flex-1 min-w-0 pb-1">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-xs text-gray-600 tabular-nums shrink-0">{fmtTime(e.ts)}</span>
              <span className={`text-sm ${textColor[e.variant ?? "default"]}`}>{e.label}</span>
            </div>
            {e.sub && (
              <p className="mt-0.5 text-xs text-gray-500 italic">"{e.sub}"</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Resolve form ─────────────────────────────────────────────────────────────

interface ResolveFormProps {
  mode: "approve" | "deny";
  req: AccessRequest;
  onConfirm: (resolvedBy: string, note: string) => Promise<void>;
  onCancel: () => void;
}

function ResolveForm({ mode, req, onConfirm, onCancel }: ResolveFormProps) {
  const [resolvedBy, setResolvedBy] = useState("admin");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(resolvedBy.trim(), note.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
      setSubmitting(false);
    }
  }

  const isApprove = mode === "approve";

  return (
    <div
      className={`rounded-lg border p-4 space-y-3 ${
        isApprove
          ? "border-green-800/60 bg-green-950/30"
          : "border-red-800/60 bg-red-950/20"
      }`}
    >
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500 uppercase tracking-wider">
          {isApprove ? "Approved by" : "Denied by"}
        </label>
        <input
          ref={inputRef}
          type="text"
          value={resolvedBy}
          onChange={(e) => setResolvedBy(e.target.value)}
          placeholder="your-name"
          className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200
                     font-mono focus:outline-none focus:border-gray-500 w-full"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500 uppercase tracking-wider">
          {isApprove ? "Note" : "Reason"}{" "}
          <span className="normal-case text-gray-600">(optional)</span>
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder={
            isApprove
              ? "e.g. Quarterly access granted for data review…"
              : "e.g. Insufficient justification provided…"
          }
          className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200
                     focus:outline-none focus:border-gray-500 w-full resize-none"
        />
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {isApprove && (
        <p className="text-xs text-gray-600 leading-relaxed">
          This will add{" "}
          <span className="font-mono text-gray-500">{req.toolName}</span> to{" "}
          <span className="font-mono text-gray-500">{req.agentRole}</span>&apos;s{" "}
          <span className="font-mono text-gray-500">allowed_tools</span> in{" "}
          <span className="font-mono text-gray-500">policy.yaml</span> immediately.
        </p>
      )}

      <div className="flex gap-2">
        <button
          disabled={submitting || !resolvedBy.trim()}
          onClick={submit}
          className={`px-4 py-1.5 rounded text-sm font-semibold transition-colors
                      disabled:opacity-40 disabled:cursor-not-allowed ${
                        isApprove
                          ? "bg-green-700 hover:bg-green-600 text-white"
                          : "bg-red-800 hover:bg-red-700 text-white"
                      }`}
        >
          {submitting ? "…" : isApprove ? "Confirm approval" : "Confirm denial"}
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 rounded text-sm font-semibold text-gray-500
                     hover:text-gray-300 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Not found ────────────────────────────────────────────────────────────────

function NotFound({ id }: { id: string }) {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col items-center justify-center gap-4">
      <svg
        viewBox="0 0 48 48"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        className="w-12 h-12 text-gray-700"
      >
        <path
          d="M24 44s16-8 16-20V10L24 4 8 10v14c0 12 16 20 16 20z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M24 18v6M24 30h.01" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
      </svg>
      <div className="text-center">
        <p className="text-gray-400 mb-1">
          Access request not found
        </p>
        <p className="font-mono text-gray-600 text-sm mb-4">{id}</p>
        <Link to="/access" className="text-cyan-400 hover:text-cyan-300 text-sm transition-colors">
          ← Back to portal
        </Link>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function AccessDetail() {
  const { id } = useParams<{ id: string }>();
  const [req, setReq] = useState<AccessRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeForm, setActiveForm] = useState<"approve" | "deny" | null>(null);

  // Fetch on mount
  useEffect(() => {
    if (!id) return;
    fetch(`${PROXY}/access-requests/${id}`)
      .then((r) => {
        if (r.status === 404) { setNotFound(true); setLoading(false); return null; }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<AccessRequest>;
      })
      .then((data) => { if (data) { setReq(data); setLoading(false); } })
      .catch(() => { setNotFound(true); setLoading(false); });
  }, [id]);

  // SSE — live update when this request is resolved from another window
  useEffect(() => {
    if (!id) return;
    const es = new EventSource(`${PROXY}/events`);
    es.addEventListener("message", (e: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(e.data) as { type: string; request?: AccessRequest };
        if (payload.type === "access_request" && payload.request?.id === id) {
          setReq(payload.request);
          setActiveForm(null);
        }
      } catch {
        // ignore
      }
    });
    return () => es.close();
  }, [id]);

  async function handleResolve(
    mode: "approve" | "deny",
    resolvedBy: string,
    note: string,
  ) {
    if (!req) return;
    const status = mode === "approve" ? "APPROVED" : "DENIED";
    const r = await fetch(`${PROXY}/access-requests/${req.id}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, resolvedBy, note: note || undefined }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({})) as { error?: string };
      throw new Error(err.error ?? r.statusText);
    }
    const updated = await r.json() as AccessRequest;
    setReq(updated);
    setActiveForm(null);
  }

  // ── Render states ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center">
        <p className="text-gray-500 text-sm">Loading…</p>
      </div>
    );
  }

  if (notFound || !req) {
    return <NotFound id={id ?? ""} />;
  }

  // Build timeline
  const timeline: TimelineEntry[] = [
    {
      ts: req.createdAt,
      label: `Request created — ${req.agentId} blocked calling ${req.toolName}`,
      variant: "default",
    },
  ];
  if (req.resolvedAt && req.resolvedBy) {
    timeline.push({
      ts: req.resolvedAt,
      label:
        req.status === "APPROVED"
          ? `APPROVED by ${req.resolvedBy}`
          : `DENIED by ${req.resolvedBy}`,
      sub: req.resolutionNote || undefined,
      variant: req.status === "APPROVED" ? "green" : "red",
    });
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Top nav */}
      <div className="border-b border-gray-800 bg-gray-900/60 px-6 py-3">
        <div className="max-w-3xl mx-auto flex items-center gap-2 text-sm">
          <Link to="/access" className="text-gray-500 hover:text-gray-300 transition-colors">
            ← Access Portal
          </Link>
          <span className="text-gray-700">/</span>
          <span className="font-mono text-gray-400">{req.id}</span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">

        {/* ── Identity block ────────────────────────────────────────────────── */}
        <div className="flex items-start gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <p className="font-mono text-2xl font-bold text-white tracking-wide">{req.id}</p>
            <p className="text-gray-600 text-xs mt-1">{fmtFull(req.createdAt)}</p>
          </div>
          <span
            className={`text-sm px-3 py-1 rounded-lg font-bold uppercase tracking-wider shrink-0 ${statusStyles[req.status]}`}
          >
            {req.status}
          </span>
        </div>

        {/* ── Result banner ─────────────────────────────────────────────────── */}
        {req.status === "APPROVED" && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-green-900/30 border border-green-700/60">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-green-400 mt-0.5 shrink-0">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                clipRule="evenodd"
              />
            </svg>
            <p className="text-sm text-green-200">
              Access granted —{" "}
              <span className="font-mono">{req.toolName}</span> added to{" "}
              <span className="font-mono">{req.agentRole}</span> allowed tools
              {req.resolutionNote && (
                <span className="text-green-400"> · "{req.resolutionNote}"</span>
              )}
            </p>
          </div>
        )}
        {req.status === "DENIED" && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-red-900/30 border border-red-700/60">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-red-400 mt-0.5 shrink-0">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                clipRule="evenodd"
              />
            </svg>
            <p className="text-sm text-red-300">
              Access denied
              {req.resolutionNote && (
                <span className="text-red-400"> — {req.resolutionNote}</span>
              )}
            </p>
          </div>
        )}

        {/* ── Info grid ─────────────────────────────────────────────────────── */}
        <section className="border border-gray-800 rounded-lg bg-gray-900 p-5">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-4">
            Request Details
          </h2>
          <div className="grid grid-cols-2 gap-x-8 gap-y-4">
            <GridField label="Agent ID" value={req.agentId} mono />
            <GridField label="Agent role" value={req.agentRole} />
            <GridField label="Requested tool" value={req.toolName} mono />
            <GridField label="Target server" value={req.targetServer} mono />
            <GridField label="Policy rule" value={req.policyRule} mono truncate />
            <GridField label="Block reason" value={req.reason} />
            <GridField label="Session ID" value={req.sessionId} mono truncate />
            <GridField
              label="Request hash"
              value={req.requestHash ? req.requestHash.slice(0, 12) + "…" : null}
              mono
            />
          </div>
        </section>

        {/* ── Timeline ──────────────────────────────────────────────────────── */}
        <section className="border border-gray-800 rounded-lg bg-gray-900 p-5">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-4">
            Timeline
          </h2>
          <Timeline entries={timeline} />
        </section>

        {/* ── Resolution section (PENDING only) ────────────────────────────── */}
        {req.status === "PENDING" && (
          <section className="border border-gray-800 rounded-lg bg-gray-900 p-5 space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-600">
              Resolve Request
            </h2>

            {!activeForm && (
              <div className="flex gap-3">
                <button
                  onClick={() => setActiveForm("approve")}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-green-800/60 hover:bg-green-700/60
                             border border-green-700/60 text-green-200 text-sm font-semibold
                             transition-colors text-left flex items-center gap-2"
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0">
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Approve access
                </button>
                <button
                  onClick={() => setActiveForm("deny")}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-red-900/40 hover:bg-red-800/40
                             border border-red-800/60 text-red-300 text-sm font-semibold
                             transition-colors text-left flex items-center gap-2"
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0">
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Deny request
                </button>
              </div>
            )}

            {activeForm && (
              <ResolveForm
                mode={activeForm}
                req={req}
                onConfirm={(resolvedBy, note) => handleResolve(activeForm, resolvedBy, note)}
                onCancel={() => setActiveForm(null)}
              />
            )}
          </section>
        )}

        {/* ── Footer nav ────────────────────────────────────────────────────── */}
        <div className="pb-4">
          <Link
            to="/access"
            className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
          >
            ← Back to Access Portal
          </Link>
        </div>
      </div>
    </div>
  );
}
