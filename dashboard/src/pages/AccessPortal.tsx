import { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import type { AccessRequest } from "../types";

const PROXY = "http://localhost:4000";

type Filter = "ALL" | "PENDING" | "APPROVED" | "DENIED";

interface CardAction {
  mode: "approve" | "deny";
  resolvedBy: string;
  note: string;
  submitting: boolean;
  error: string | null;
}

// ─── Icons ───────────────────────────────────────────────────────────────────

function ShieldIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function EmptyIcon() {
  return (
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
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtTime(ts: string) {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function fmtDate(ts: string) {
  return new Date(ts).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const statusStyles: Record<AccessRequest["status"], string> = {
  PENDING:  "bg-orange-900/60 text-orange-200 border border-orange-700/70 ring-1 ring-orange-600/30",
  APPROVED: "bg-green-900/60 text-green-200 border border-green-700/70",
  DENIED:   "bg-red-900/60 text-red-300 border border-red-700/70",
};

// ─── Toast ───────────────────────────────────────────────────────────────────

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 4500);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-lg
                 bg-green-900 border border-green-600 text-green-100 text-sm font-medium
                 shadow-xl shadow-black/40 animate-fade-in"
    >
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-green-400 shrink-0">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
          clipRule="evenodd"
        />
      </svg>
      {message}
      <button onClick={onDone} className="ml-1 text-green-400 hover:text-green-200">
        <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
          <path d="M4.293 4.293a1 1 0 011.414 0L8 6.586l2.293-2.293a1 1 0 111.414 1.414L9.414 8l2.293 2.293a1 1 0 01-1.414 1.414L8 9.414l-2.293 2.293a1 1 0 01-1.414-1.414L6.586 8 4.293 5.707a1 1 0 010-1.414z" />
        </svg>
      </button>
    </div>
  );
}

// ─── Inline action form ───────────────────────────────────────────────────────

interface ActionFormProps {
  action: CardAction;
  onChange: (patch: Partial<CardAction>) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

function ActionForm({ action, onChange, onConfirm, onCancel }: ActionFormProps) {
  const isApprove = action.mode === "approve";
  const label = isApprove ? "Approved by" : "Denied by";
  const confirmLabel = isApprove ? "Approve" : "Deny";
  const confirmClass = isApprove
    ? "bg-green-700 hover:bg-green-600 text-white"
    : "bg-red-800 hover:bg-red-700 text-white";

  return (
    <div className="mt-3 pt-3 border-t border-gray-700/60 space-y-2">
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-500 w-24 shrink-0">{label}</label>
        <input
          type="text"
          value={action.resolvedBy}
          onChange={(e) => onChange({ resolvedBy: e.target.value })}
          className="flex-1 bg-gray-800 border border-gray-700 rounded px-2.5 py-1 text-xs text-gray-200 font-mono
                     focus:outline-none focus:border-gray-500 min-w-0"
          placeholder="your-name"
          autoFocus
        />
      </div>
      {!isApprove && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500 w-24 shrink-0">Reason</label>
          <input
            type="text"
            value={action.note}
            onChange={(e) => onChange({ note: e.target.value })}
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-2.5 py-1 text-xs text-gray-200
                       focus:outline-none focus:border-gray-500 min-w-0"
            placeholder="Optional justification…"
          />
        </div>
      )}
      {action.error && (
        <p className="text-xs text-red-400 pl-26">{action.error}</p>
      )}
      <div className="flex gap-2 justify-end pt-0.5">
        <button
          onClick={onCancel}
          className="px-3 py-1 rounded text-xs font-semibold text-gray-400 hover:text-gray-200 transition-colors"
        >
          Cancel
        </button>
        <button
          disabled={action.submitting || !action.resolvedBy.trim()}
          onClick={onConfirm}
          className={`px-4 py-1 rounded text-xs font-semibold transition-colors
                      disabled:opacity-40 disabled:cursor-not-allowed ${confirmClass}`}
        >
          {action.submitting ? "…" : confirmLabel}
        </button>
      </div>
    </div>
  );
}

// ─── Request card ─────────────────────────────────────────────────────────────

interface CardProps {
  req: AccessRequest;
  onResolve: (id: string, status: "APPROVED" | "DENIED", resolvedBy: string, note?: string) => Promise<void>;
  onShowToast: (msg: string) => void;
}

function RequestCard({ req, onResolve, onShowToast }: CardProps) {
  const [action, setAction] = useState<CardAction | null>(null);

  function startAction(mode: "approve" | "deny") {
    setAction({ mode, resolvedBy: "admin", note: "", submitting: false, error: null });
  }

  function cancelAction() {
    setAction(null);
  }

  async function confirm() {
    if (!action) return;
    setAction((a) => a ? { ...a, submitting: true, error: null } : a);
    try {
      await onResolve(
        req.id,
        action.mode === "approve" ? "APPROVED" : "DENIED",
        action.resolvedBy.trim(),
        action.note.trim() || undefined,
      );
      if (action.mode === "approve") {
        onShowToast(`Policy updated — ${req.agentId} can now call ${req.toolName}`);
      }
      setAction(null);
    } catch (e) {
      setAction((a) =>
        a ? { ...a, submitting: false, error: e instanceof Error ? e.message : "Request failed" } : a
      );
    }
  }

  const isPending = req.status === "PENDING";

  return (
    <div
      className={`border rounded-lg bg-gray-900 px-5 py-4 space-y-3 transition-colors
        ${isPending ? "border-orange-800/50" : "border-gray-800"}`}
    >
      {/* Card header */}
      <div className="flex items-center gap-3">
        <span className="font-mono text-sm text-gray-300 font-semibold tracking-wide">{req.id}</span>
        <span className={`text-xs px-2 py-0.5 rounded font-bold uppercase tracking-wide ${statusStyles[req.status]}`}>
          {req.status}
        </span>
        <span className="flex-1" />
        <span className="text-xs text-gray-600 tabular-nums">{fmtDate(req.createdAt)}</span>
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
        <div className="flex items-baseline gap-1.5">
          <span className="text-gray-500 text-xs shrink-0">Agent</span>
          <span className="font-mono text-cyan-300">{req.agentId}</span>
          <span className="text-gray-600 text-xs">(role: {req.agentRole})</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-gray-500 text-xs shrink-0">Requested tool</span>
          <span className="font-mono text-gray-200">{req.toolName}</span>
        </div>
        {req.targetServer && (
          <div className="flex items-baseline gap-1.5">
            <span className="text-gray-500 text-xs shrink-0">Target server</span>
            <span className="font-mono text-gray-300">{req.targetServer}</span>
          </div>
        )}
        <div className="flex items-baseline gap-1.5">
          <span className="text-gray-500 text-xs shrink-0">Reason blocked</span>
          <span className="text-gray-400 text-xs">{req.reason}</span>
        </div>
        <div className="col-span-full flex items-baseline gap-1.5">
          <span className="text-gray-500 text-xs shrink-0">Policy rule</span>
          <span className="font-mono text-gray-500 text-xs">{req.policyRule}</span>
        </div>
      </div>

      {/* Footer: view link + action buttons */}
      <div className="flex items-center gap-3 pt-1">
        <Link
          to={`/access/${req.id}`}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          View details →
        </Link>
        <span className="flex-1" />
        {isPending && !action && (
          <>
            <button
              onClick={() => startAction("deny")}
              className="px-3 py-1 rounded text-xs font-semibold bg-gray-800 hover:bg-gray-700
                         text-gray-300 transition-colors border border-gray-700"
            >
              Deny
            </button>
            <button
              onClick={() => startAction("approve")}
              className="px-3 py-1 rounded text-xs font-semibold bg-green-800 hover:bg-green-700
                         text-green-100 transition-colors border border-green-700"
            >
              Approve
            </button>
          </>
        )}
        {req.status !== "PENDING" && req.resolvedBy && (
          <span className="text-xs text-gray-600">
            {req.status === "APPROVED" ? "Approved" : "Denied"} by{" "}
            <span className="font-mono text-gray-500">{req.resolvedBy}</span>
            {req.resolvedAt && ` · ${fmtTime(req.resolvedAt)}`}
          </span>
        )}
      </div>

      {/* Inline form */}
      {action && (
        <ActionForm
          action={action}
          onChange={(patch) => setAction((a) => a ? { ...a, ...patch } : a)}
          onConfirm={confirm}
          onCancel={cancelAction}
        />
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function AccessPortal() {
  const [requests, setRequests] = useState<Record<string, AccessRequest>>({});
  const [filter, setFilter] = useState<Filter>("PENDING");
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  // Merge helper — keeps newest copy by id
  const merge = useCallback((incoming: AccessRequest) => {
    setRequests((prev) => ({ ...prev, [incoming.id]: incoming }));
  }, []);

  // Initial fetch
  useEffect(() => {
    fetch(`${PROXY}/access-requests`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<AccessRequest[]>;
      })
      .then((list) => {
        const map: Record<string, AccessRequest> = {};
        for (const r of list) map[r.id] = r;
        setRequests(map);
        setLoading(false);
      })
      .catch((e: unknown) => {
        setFetchError(e instanceof Error ? e.message : "Failed to load");
        setLoading(false);
      });
  }, []);

  // SSE subscription for live updates
  useEffect(() => {
    const es = new EventSource(`${PROXY}/events`);
    esRef.current = es;
    es.addEventListener("message", (e: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(e.data) as { type: string; request?: AccessRequest };
        if (payload.type === "access_request" && payload.request) {
          merge(payload.request);
        }
      } catch {
        // ignore malformed frames
      }
    });
    return () => es.close();
  }, [merge]);

  // Resolve action — called by card, updates optimistically
  const handleResolve = useCallback(
    async (id: string, status: "APPROVED" | "DENIED", resolvedBy: string, note?: string) => {
      // Optimistic update
      setRequests((prev) => {
        const existing = prev[id];
        if (!existing) return prev;
        return {
          ...prev,
          [id]: {
            ...existing,
            status,
            resolvedBy,
            resolvedAt: new Date().toISOString(),
            resolutionNote: note,
          },
        };
      });
      const r = await fetch(`${PROXY}/access-requests/${id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, resolvedBy, note }),
      });
      if (!r.ok) {
        // Roll back optimistic update on failure
        const err = await r.json().catch(() => ({})) as { error?: string };
        // Revert by re-fetching this specific request
        fetch(`${PROXY}/access-requests/${id}`)
          .then((res) => res.json() as Promise<AccessRequest>)
          .then(merge)
          .catch(() => undefined);
        throw new Error(err.error ?? r.statusText);
      }
      const updated = await r.json() as AccessRequest;
      merge(updated);
    },
    [merge],
  );

  const allRequests = Object.values(requests).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const pendingCount = allRequests.filter((r) => r.status === "PENDING").length;

  const visible = filter === "ALL" ? allRequests : allRequests.filter((r) => r.status === filter);

  const filterLabels: [Filter, string][] = [
    ["ALL", "All"],
    ["PENDING", `Pending${pendingCount > 0 ? ` (${pendingCount})` : ""}`],
    ["APPROVED", "Approved"],
    ["DENIED", "Denied"],
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Page header */}
      <div className="border-b border-gray-800 bg-gray-900/60 px-6 py-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-4 mb-1">
            <Link
              to="/"
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1"
            >
              ← Dashboard
            </Link>
          </div>
          <div className="flex items-start gap-3 mb-4">
            <ShieldIcon className="w-6 h-6 text-orange-400 mt-0.5 shrink-0" />
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white leading-tight">
                MCP Access Portal
              </h1>
              <p className="text-gray-500 text-xs mt-0.5">
                Review and resolve agent tool access requests
              </p>
            </div>
          </div>

          {/* Filter tabs */}
          <div className="flex gap-0.5">
            {filterLabels.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                  filter === key
                    ? "bg-gray-700 text-gray-100"
                    : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/60"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-6 py-6">
        {fetchError && (
          <div className="mb-4 px-4 py-2 rounded bg-red-900/40 border border-red-700 text-red-300 text-sm">
            {fetchError}
          </div>
        )}

        {loading ? (
          <p className="text-gray-500 text-sm text-center py-16">Loading…</p>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <EmptyIcon />
            <p className="text-gray-500 text-sm max-w-xs">
              {filter === "ALL" || filter === "PENDING"
                ? "No access requests yet. Blocked agent calls will appear here."
                : `No ${filter.toLowerCase()} requests.`}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {visible.map((req) => (
              <RequestCard
                key={req.id}
                req={req}
                onResolve={handleResolve}
                onShowToast={setToast}
              />
            ))}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}
