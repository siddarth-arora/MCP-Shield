import { useEffect, useState, useRef } from "react";

const PROXY = "http://localhost:4000";

interface RolePolicy { allowed_tools: string[]; denied_tools?: string[] }
interface Policy { roles: Record<string, RolePolicy> }
interface SimulateResult { allowed: boolean; reason: string; rule: string }

function ToolTag({ name, color, onRemove }: { name: string; color: "green" | "red"; onRemove: () => void }) {
  const style = color === "green"
    ? "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20"
    : "bg-rose-500/10 text-rose-400 ring-1 ring-rose-500/20";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-xs ${style}`}>
      {name}
      <button onClick={onRemove} className="ml-0.5 opacity-50 hover:opacity-100 leading-none" aria-label={`Remove ${name}`}>×</button>
    </span>
  );
}

function AddToolInput({ color, onAdd }: { color: "green" | "red"; onAdd: (t: string) => void }) {
  const [val, setVal] = useState("");
  const btnStyle = color === "green"
    ? "bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400"
    : "bg-rose-500/15 hover:bg-rose-500/25 text-rose-400";

  function submit() {
    const t = val.trim();
    if (t) { onAdd(t); setVal(""); }
  }

  return (
    <div className="flex items-center gap-1.5 mt-1.5">
      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="tool_name"
        className="w-32 bg-zinc-800 border border-white/8 rounded px-2 py-1 text-xs font-mono
                   text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-white/15
                   transition-colors"
      />
      <button
        onClick={submit}
        className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${btnStyle}`}
      >
        Add
      </button>
    </div>
  );
}

function RoleCard({ role, rp, onChange }: { role: string; rp: RolePolicy; onChange: (u: RolePolicy) => void }) {
  const roleColor: Record<string, string> = {
    admin:     "text-violet-400",
    analyst:   "text-cyan-400",
    untrusted: "text-rose-400",
  };
  const color = roleColor[role] ?? "text-zinc-300";

  return (
    <div className="rounded-xl border border-white/6 bg-zinc-900 p-4 space-y-4 hover:border-white/10 transition-colors">
      <div className="flex items-center gap-2">
        <span className={`font-mono text-sm font-bold ${color}`}>{role}</span>
        {rp.allowed_tools.includes("*") && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 ring-1 ring-violet-500/20 font-medium">
            wildcard
          </span>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-xs text-zinc-600 uppercase tracking-wider font-medium">Allowed</p>
        <div className="flex flex-wrap gap-1.5">
          {rp.allowed_tools.map((t) => (
            <ToolTag key={t} name={t} color="green"
              onRemove={() => onChange({ ...rp, allowed_tools: rp.allowed_tools.filter((x) => x !== t) })} />
          ))}
        </div>
        <AddToolInput color="green"
          onAdd={(t) => { if (!rp.allowed_tools.includes(t)) onChange({ ...rp, allowed_tools: [...rp.allowed_tools, t] }); }} />
      </div>

      <div className="space-y-2">
        <p className="text-xs text-zinc-600 uppercase tracking-wider font-medium">Denied</p>
        <div className="flex flex-wrap gap-1.5">
          {(rp.denied_tools ?? []).map((t) => (
            <ToolTag key={t} name={t} color="red"
              onRemove={() => onChange({ ...rp, denied_tools: (rp.denied_tools ?? []).filter((x) => x !== t) })} />
          ))}
        </div>
        <AddToolInput color="red"
          onAdd={(t) => { const e = rp.denied_tools ?? []; if (!e.includes(t)) onChange({ ...rp, denied_tools: [...e, t] }); }} />
      </div>
    </div>
  );
}

export function PolicyEditor() {
  const [policy,     setPolicy]     = useState<Policy | null>(null);
  const [saving,     setSaving]     = useState(false);
  const [savedAt,    setSavedAt]    = useState<string | null>(null);
  const [flash,      setFlash]      = useState(false);
  const [simRole,    setSimRole]    = useState("");
  const [simTool,    setSimTool]    = useState("");
  const [simResult,  setSimResult]  = useState<SimulateResult | null>(null);
  const [simLoading, setSimLoading] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch(`${PROXY}/policy`)
      .then((r) => r.json() as Promise<Policy>)
      .then((p) => { setPolicy(p); setSimRole(Object.keys(p.roles)[0] ?? ""); })
      .catch(console.error);
  }, []);

  function updateRole(role: string, updated: RolePolicy) {
    if (!policy) return;
    setPolicy({ roles: { ...policy.roles, [role]: updated } });
  }

  async function save() {
    if (!policy) return;
    setSaving(true);
    try {
      await fetch(`${PROXY}/policy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(policy),
      });
      setSavedAt(new Date().toLocaleTimeString());
      setFlash(true);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlash(false), 2500);
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  }

  async function simulate() {
    if (!simRole || !simTool.trim()) return;
    setSimLoading(true);
    setSimResult(null);
    try {
      const res = await fetch(`${PROXY}/policy/simulate?role=${encodeURIComponent(simRole)}&tool=${encodeURIComponent(simTool.trim())}`);
      setSimResult(await res.json() as SimulateResult);
    } catch (e) { console.error(e); }
    finally { setSimLoading(false); }
  }

  if (!policy) return <p className="text-zinc-600 text-sm py-6 text-center">Loading policy…</p>;

  const roles = Object.keys(policy.roles);

  return (
    <div className="space-y-6">
      {/* Role cards */}
      <div className={`rounded-xl border p-4 space-y-4 transition-colors duration-700 ${flash ? "border-emerald-500/40" : "border-white/6"}`}>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {roles.map((role) => (
            <RoleCard key={role} role={role} rp={policy.roles[role]!}
              onChange={(updated) => updateRole(role, updated)} />
          ))}
        </div>

        <div className="flex items-center gap-4 pt-1 border-t border-white/6">
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-1.5 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50
                       rounded-lg text-sm font-semibold text-white transition-colors"
          >
            {saving ? "Saving…" : "Save policy"}
          </button>
          {savedAt && (
            <span className="text-xs text-emerald-400 animate-fade-in">
              Saved · {savedAt}
            </span>
          )}
        </div>
      </div>

      {/* Simulator */}
      <div className="rounded-xl border border-white/6 bg-zinc-900 p-4 space-y-4">
        <div className="flex items-center gap-2">
          <svg className="w-3.5 h-3.5 text-zinc-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1 1 .03 2.613-1.342 2.31l-7.251-1.59a.75.75 0 00-.316 0l-7.251 1.59c-1.372.302-2.342-1.31-1.342-2.31L5 14.5" />
          </svg>
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-600">What-if simulator</p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs text-zinc-600">Role</label>
            <select
              value={simRole}
              onChange={(e) => { setSimRole(e.target.value); setSimResult(null); }}
              className="bg-zinc-800 border border-white/8 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200
                         focus:outline-none focus:border-white/15 transition-colors"
            >
              {roles.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-zinc-600">Tool</label>
            <input
              value={simTool}
              onChange={(e) => { setSimTool(e.target.value); setSimResult(null); }}
              onKeyDown={(e) => e.key === "Enter" && simulate()}
              placeholder="tool_name"
              className="w-36 bg-zinc-800 border border-white/8 rounded-lg px-2.5 py-1.5 text-xs
                         font-mono text-zinc-200 placeholder-zinc-600 focus:outline-none
                         focus:border-white/15 transition-colors"
            />
          </div>

          <button
            onClick={simulate}
            disabled={simLoading || !simTool.trim()}
            className="px-4 py-1.5 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40
                       rounded-lg text-xs font-semibold text-zinc-100 transition-colors"
          >
            {simLoading ? "…" : "Test"}
          </button>
        </div>

        {simResult && (
          <div className="flex items-start gap-3 rounded-lg border border-white/6 bg-zinc-950 px-4 py-3 animate-fade-in">
            <span className={`text-xs px-2 py-0.5 rounded font-bold tracking-wider shrink-0 ${
              simResult.allowed
                ? "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20"
                : "bg-rose-500/10 text-rose-400 ring-1 ring-rose-500/20"
            }`}>
              {simResult.allowed ? "ALLOW" : "BLOCK"}
            </span>
            <div className="min-w-0">
              <p className="text-xs text-zinc-400">{simResult.reason}</p>
              <p className="font-mono text-xs text-zinc-600 mt-0.5">{simResult.rule}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
