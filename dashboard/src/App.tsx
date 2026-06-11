import { useState, useRef, useEffect } from "react";
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

export default function App() {
  const { rows, threats, riskScores, connected } = useAuditStream(PROXY_EVENTS_URL);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [routingOpen, setRoutingOpen] = useState(false);

  // Pulse the threat badge when a new CRITICAL/HIGH threat arrives
  const [pulse, setPulse] = useState(false);
  const prevThreatCount = useRef(0);
  useEffect(() => {
    const newCount = threats.length - prevThreatCount.current;
    if (newCount > 0) {
      const latest = threats[0];
      if (latest && (latest.severity === "CRITICAL" || latest.severity === "HIGH")) {
        setPulse(true);
        const t = setTimeout(() => setPulse(false), 2000);
        return () => clearTimeout(t);
      }
    }
    prevThreatCount.current = threats.length;
  }, [threats]);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      {/* Header */}
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">
              MCP-Shield — Compliance Dashboard
            </h1>
            <p className="text-gray-500 text-xs mt-0.5">Real-time agent policy enforcement</p>
          </div>
          {threats.length > 0 && (
            <span
              className={`inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-600 text-white text-xs font-bold ${
                pulse ? "animate-pulse" : ""
              }`}
            >
              {threats.length > 99 ? "99+" : threats.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              connected ? "bg-green-400 animate-pulse" : "bg-red-500"
            }`}
          />
          <span className={connected ? "text-green-400" : "text-red-400"}>
            {connected ? "Live" : "Disconnected"}
          </span>
        </div>
      </header>

      {/* Stats */}
      <section className="mb-4">
        <StatsBar rows={rows} />
      </section>

      {/* Risk panel — full width, below stats */}
      <section className="mb-6">
        <RiskPanel riskScores={riskScores} />
      </section>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Activity feed — widest column */}
        <div className="lg:col-span-2 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500">
            Activity Feed
          </h2>
          <ActivityFeed rows={rows} />
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <div className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500">
              Threat Feed
            </h2>
            <ThreatFeed threats={threats} />
          </div>

          <div className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500">
              Violations
            </h2>
            <ViolationAlert rows={rows} />
          </div>

          <div className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500">
              Session Timeline
            </h2>
            <SessionTimeline rows={rows} />
          </div>
        </div>
      </div>

      {/* Routing map — collapsible */}
      <section className="mt-6 border border-gray-800 rounded-lg overflow-hidden">
        <button
          onClick={() => setRoutingOpen((o) => !o)}
          className="w-full flex items-center justify-between px-4 py-3 bg-gray-900 hover:bg-gray-800 transition-colors text-left"
        >
          <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">
            Routing Map
          </span>
          <span className="text-gray-600 text-sm">{routingOpen ? "▲" : "▼"}</span>
        </button>
        {routingOpen && (
          <div className="p-4 border-t border-gray-800">
            <RoutingMap rows={rows} />
          </div>
        )}
      </section>

      {/* Policy editor — collapsible */}
      <section className="mt-8 border border-gray-800 rounded-lg overflow-hidden">
        <button
          onClick={() => setPolicyOpen((o) => !o)}
          className="w-full flex items-center justify-between px-4 py-3 bg-gray-900 hover:bg-gray-800 transition-colors text-left"
        >
          <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">
            Policy Editor
          </span>
          <span className="text-gray-600 text-sm">{policyOpen ? "▲" : "▼"}</span>
        </button>
        {policyOpen && (
          <div className="p-4 border-t border-gray-800">
            <PolicyEditor />
          </div>
        )}
      </section>
    </div>
  );
}
