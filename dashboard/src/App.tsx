import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuditStream } from "./hooks/useAuditStream";
import { StatsBar } from "./components/StatsBar";
import { ActivityFeed } from "./components/ActivityFeed";
import { ViolationAlert } from "./components/ViolationAlert";
import { SessionTimeline } from "./components/SessionTimeline";
import { ThreatFeed } from "./components/ThreatFeed";
import { RiskPanel } from "./components/RiskPanel";
import { RoutingMap } from "./components/RoutingMap";
import { PolicyEditor } from "./components/PolicyEditor";

const PROXY_EVENTS_URL = "http://localhost:4000/events";

function ShieldLogo() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
      strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-indigo-400">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor"
      className={`w-4 h-4 text-zinc-600 transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
      <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 011.06 0L10 11.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 9.28a.75.75 0 010-1.06z" clipRule="evenodd" />
    </svg>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-600">
      {children}
    </h2>
  );
}

function Collapsible({ label, children, defaultOpen = false }: {
  label: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-white/6 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 bg-zinc-900
                   hover:bg-zinc-800/60 transition-colors text-left"
      >
        <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">{label}</span>
        <ChevronIcon open={open} />
      </button>
      {open && (
        <div className="p-5 border-t border-white/6 bg-zinc-950/40 animate-fade-in">
          {children}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const { rows, threats, riskScores, accessRequests, connected } = useAuditStream(PROXY_EVENTS_URL);
  const pendingCount = Object.values(accessRequests).filter((r) => r.status === "PENDING").length;

  const [threatPulse, setThreatPulse] = useState(false);
  const prevThreatCount = useRef(0);
  useEffect(() => {
    if (threats.length > prevThreatCount.current) {
      const latest = threats[0];
      if (latest && (latest.severity === "CRITICAL" || latest.severity === "HIGH")) {
        setThreatPulse(true);
        const t = setTimeout(() => setThreatPulse(false), 2000);
        return () => clearTimeout(t);
      }
    }
    prevThreatCount.current = threats.length;
  }, [threats]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">

      {/* ── Sticky header ───────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-white/6 bg-zinc-950/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center gap-4">

          {/* Logo + title */}
          <div className="flex items-center gap-2.5">
            <ShieldLogo />
            <span className="text-sm font-bold tracking-tight text-zinc-100">MCP-Shield</span>
            <span className="hidden sm:block text-zinc-700 text-xs">/ Compliance Dashboard</span>
          </div>

          <div className="flex-1" />

          {/* Badges */}
          <div className="flex items-center gap-2">
            {threats.length > 0 && (
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full
                             bg-rose-500/10 text-rose-400 ring-1 ring-rose-500/20
                             text-xs font-semibold transition-all
                             ${threatPulse ? "animate-pulse" : ""}`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                {threats.length} threat{threats.length !== 1 ? "s" : ""}
              </span>
            )}

            {pendingCount > 0 && (
              <Link
                to="/access"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full
                           bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20
                           text-xs font-semibold hover:bg-amber-500/15 transition-colors"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-blink" />
                {pendingCount} pending
              </Link>
            )}

            {/* Connection status */}
            <div className="flex items-center gap-1.5 pl-2 border-l border-white/6">
              <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-emerald-500 animate-pulse" : "bg-zinc-600"}`} />
              <span className={`text-xs font-medium ${connected ? "text-emerald-400" : "text-zinc-600"}`}>
                {connected ? "Live" : "Disconnected"}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* ── Page body ───────────────────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">

        {/* Stats */}
        <StatsBar rows={rows} />

        {/* Risk gauges */}
        <RiskPanel riskScores={riskScores} />

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Activity feed — 2 cols */}
          <div className="lg:col-span-2 space-y-3">
            <SectionLabel>Activity Feed</SectionLabel>
            <ActivityFeed rows={rows} />
          </div>

          {/* Right column */}
          <div className="space-y-6">
            <div className="space-y-3">
              <SectionLabel>Threats</SectionLabel>
              <ThreatFeed threats={threats} />
            </div>

            <div className="space-y-3">
              <SectionLabel>Recent Violations</SectionLabel>
              <ViolationAlert rows={rows} />
            </div>

            <div className="space-y-3">
              <SectionLabel>Session Timeline</SectionLabel>
              <SessionTimeline rows={rows} />
            </div>
          </div>
        </div>

        {/* Collapsible panels */}
        <Collapsible label="Routing Map">
          <RoutingMap rows={rows} />
        </Collapsible>

        <Collapsible label="Policy Editor">
          <PolicyEditor />
        </Collapsible>

      </main>
    </div>
  );
}
