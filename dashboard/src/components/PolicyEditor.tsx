import { useEffect, useState, useRef } from "react";

const PROXY = "http://localhost:4000";

interface RolePolicy {
  allowed_tools: string[];
  denied_tools?: string[];
}

interface Policy {
  roles: Record<string, RolePolicy>;
}

interface SimulateResult {
  allowed: boolean;
  reason: string;
  rule: string;
}

function ToolTag({
  name,
  color,
  onRemove,
}: {
  name: string;
  color: "green" | "red";
  onRemove: () => void;
}) {
  const base =
    color === "green"
      ? "bg-green-900/50 text-green-300 border-green-700"
      : "bg-red-900/50 text-red-300 border-red-700";
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border font-mono text-xs ${base}`}
    >
      {name}
      <button
        onClick={onRemove}
        className="ml-0.5 opacity-60 hover:opacity-100 leading-none"
        aria-label={`Remove ${name}`}
      >
        ×
      </button>
    </span>
  );
}

function AddToolInput({
  color,
  onAdd,
}: {
  color: "green" | "red";
  onAdd: (tool: string) => void;
}) {
  const [val, setVal] = useState("");
  const btnColor =
    color === "green"
      ? "bg-green-800 hover:bg-green-700 text-green-200"
      : "bg-red-800 hover:bg-red-700 text-red-200";

  function submit() {
    const t = val.trim();
    if (t) {
      onAdd(t);
      setVal("");
    }
  }

  return (
    <div className="flex items-center gap-1 mt-1">
      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="tool_name"
        className="w-28 bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-xs font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:border-gray-500"
      />
      <button
        onClick={submit}
        className={`px-2 py-0.5 rounded text-xs font-medium ${btnColor}`}
      >
        Add
      </button>
    </div>
  );
}

function RoleCard({
  role,
  rp,
  onChange,
}: {
  role: string;
  rp: RolePolicy;
  onChange: (updated: RolePolicy) => void;
}) {
  function removeAllowed(tool: string) {
    onChange({ ...rp, allowed_tools: rp.allowed_tools.filter((t) => t !== tool) });
  }
  function addAllowed(tool: string) {
    if (!rp.allowed_tools.includes(tool))
      onChange({ ...rp, allowed_tools: [...rp.allowed_tools, tool] });
  }
  function removeDenied(tool: string) {
    onChange({ ...rp, denied_tools: (rp.denied_tools ?? []).filter((t) => t !== tool) });
  }
  function addDenied(tool: string) {
    const existing = rp.denied_tools ?? [];
    if (!existing.includes(tool))
      onChange({ ...rp, denied_tools: [...existing, tool] });
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
      <div className="font-mono text-sm font-semibold text-cyan-300">{role}</div>

      <div className="space-y-1.5">
        <div className="text-xs text-gray-500 uppercase tracking-wide">Allowed</div>
        <div className="flex flex-wrap gap-1">
          {rp.allowed_tools.map((t) => (
            <ToolTag key={t} name={t} color="green" onRemove={() => removeAllowed(t)} />
          ))}
        </div>
        <AddToolInput color="green" onAdd={addAllowed} />
      </div>

      <div className="space-y-1.5">
        <div className="text-xs text-gray-500 uppercase tracking-wide">Denied</div>
        <div className="flex flex-wrap gap-1">
          {(rp.denied_tools ?? []).map((t) => (
            <ToolTag key={t} name={t} color="red" onRemove={() => removeDenied(t)} />
          ))}
        </div>
        <AddToolInput color="red" onAdd={addDenied} />
      </div>
    </div>
  );
}

export function PolicyEditor() {
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [flashGreen, setFlashGreen] = useState(false);

  const [simRole, setSimRole] = useState("");
  const [simTool, setSimTool] = useState("");
  const [simResult, setSimResult] = useState<SimulateResult | null>(null);
  const [simLoading, setSimLoading] = useState(false);

  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch(`${PROXY}/policy`)
      .then((r) => r.json() as Promise<Policy>)
      .then((p) => {
        setPolicy(p);
        const firstRole = Object.keys(p.roles)[0];
        if (firstRole) setSimRole(firstRole);
      })
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
      const now = new Date().toLocaleTimeString();
      setSavedAt(now);
      setFlashGreen(true);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlashGreen(false), 2000);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  async function simulate() {
    if (!simRole || !simTool.trim()) return;
    setSimLoading(true);
    setSimResult(null);
    try {
      const res = await fetch(
        `${PROXY}/policy/simulate?role=${encodeURIComponent(simRole)}&tool=${encodeURIComponent(simTool.trim())}`
      );
      setSimResult(await res.json() as SimulateResult);
    } catch (e) {
      console.error(e);
    } finally {
      setSimLoading(false);
    }
  }

  if (!policy) {
    return (
      <div className="text-gray-500 text-sm py-4 text-center">Loading policy…</div>
    );
  }

  const roles = Object.keys(policy.roles);

  return (
    <div className="space-y-6">
      {/* Role cards */}
      <div
        className={`border rounded-lg p-4 space-y-4 transition-colors duration-700 ${
          flashGreen ? "border-green-600" : "border-gray-800"
        }`}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {roles.map((role) => (
            <RoleCard
              key={role}
              role={role}
              rp={policy.roles[role]}
              onChange={(updated) => updateRole(role, updated)}
            />
          ))}
        </div>

        <div className="flex items-center gap-4 pt-2">
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded text-sm font-medium text-white transition-colors"
          >
            {saving ? "Saving…" : "Save policy"}
          </button>
          {savedAt && (
            <span className="text-xs text-green-400">Saved at {savedAt}</span>
          )}
        </div>
      </div>

      {/* Simulator */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
        <div className="text-xs font-semibold uppercase tracking-widest text-gray-500">
          What-if simulator
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs text-gray-500">Role</label>
            <select
              value={simRole}
              onChange={(e) => { setSimRole(e.target.value); setSimResult(null); }}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-gray-500"
            >
              {roles.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-500">Tool</label>
            <input
              value={simTool}
              onChange={(e) => { setSimTool(e.target.value); setSimResult(null); }}
              onKeyDown={(e) => e.key === "Enter" && simulate()}
              placeholder="tool_name"
              className="w-36 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:border-gray-500"
            />
          </div>
          <button
            onClick={simulate}
            disabled={simLoading || !simTool.trim()}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded text-xs font-medium text-white"
          >
            {simLoading ? "…" : "Test"}
          </button>
        </div>

        {simResult && (
          <div className="space-y-1 pt-1">
            <span
              className={`inline-block px-2.5 py-0.5 rounded text-xs font-bold tracking-wide ${
                simResult.allowed
                  ? "bg-green-900/60 text-green-300 border border-green-700"
                  : "bg-red-900/60 text-red-300 border border-red-700"
              }`}
            >
              {simResult.allowed ? "ALLOW" : "BLOCK"}
            </span>
            <div className="text-xs text-gray-400">{simResult.reason}</div>
            <div className="font-mono text-xs text-gray-600">{simResult.rule}</div>
          </div>
        )}
      </div>
    </div>
  );
}
