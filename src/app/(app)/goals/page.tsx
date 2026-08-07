"use client";
import { useState, useEffect } from "react";
import { format, parseISO } from "date-fns";

interface Goal {
  id: string; title: string; description: string | null; status: string;
  progressValue: string; targetValue: string; progressType: string;
  dueDate: string | null; ownerId: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  on_track: { label: "On Track", color: "var(--positive)" },
  at_risk: { label: "At Risk", color: "var(--warning)" },
  off_track: { label: "Off Track", color: "var(--negative)" },
  completed: { label: "Completed", color: "var(--positive)" },
};

const PROGRESS_TYPE_LABELS: Record<string, string> = {
  percent: "Percentage (%)",
  numeric: "Numeric",
  currency: "Currency ($)",
};

function formatProgress(value: string, target: string, type: string) {
  const v = Number(value);
  const t = Number(target);
  switch (type) {
    case "currency": return `$${v.toLocaleString()} / $${t.toLocaleString()}`;
    case "percent": return `${v}% / ${t}%`;
    default: return `${v} / ${t}`;
  }
}

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/pm/goals").then(r => r.json()).then(d => {
      setGoals(d.goals ?? []);
      setLoading(false);
    });
  }, []);

  const updateGoal = async (goalId: string, patch: Partial<Goal>) => {
    const res = await fetch(`/api/pm/goals/${goalId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const d = await res.json();
    if (d.goal) {
      setGoals(prev => prev.map(g => g.id === goalId ? d.goal : g));
      setEditingId(null);
    }
  };

  if (loading) return <div style={{ padding: "32px", color: "var(--text-muted)" }}>Loading...</div>;

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: "32px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "28px" }}>
        <h2 style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-primary)" }}>Goals</h2>
        <button onClick={() => setShowNew(true)} style={{
          padding: "8px 16px", background: "var(--accent)", color: "white",
          border: "none", borderRadius: "6px", fontSize: "14px", fontWeight: 500, cursor: "pointer",
        }}>
          + New Goal
        </button>
      </div>
      <div style={{ display: "grid", gap: "12px" }}>
        {goals.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)" }}>
            <div style={{ fontSize: "40px", marginBottom: "12px" }}>🎯</div>
            <div style={{ fontSize: "15px" }}>No goals yet</div>
            <div style={{ fontSize: "13px", marginTop: "4px" }}>Create a goal to track your team&apos;s progress.</div>
          </div>
        )}
        {goals.map(goal => {
          const pct = Number(goal.targetValue) > 0
            ? Math.min(100, Math.round((Number(goal.progressValue) / Number(goal.targetValue)) * 100))
            : 0;
          const statusCfg = STATUS_CONFIG[goal.status] ?? STATUS_CONFIG.on_track;
          const isEditing = editingId === goal.id;

          return (
            <div key={goal.id} style={{
              background: "var(--bg-elevated)", border: "1px solid var(--border)",
              borderRadius: "10px", padding: "20px",
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "12px" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-primary)" }}>{goal.title}</div>
                  {goal.description && <div style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "2px" }}>{goal.description}</div>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0, marginLeft: "12px" }}>
                  <span style={{
                    fontSize: "11px", fontWeight: 500, color: statusCfg.color,
                    padding: "3px 8px", borderRadius: "4px", background: statusCfg.color + "15",
                  }}>
                    {statusCfg.label}
                  </span>
                  <button
                    onClick={() => setEditingId(isEditing ? null : goal.id)}
                    style={{ padding: "3px 10px", border: "1px solid var(--border)", borderRadius: "4px", background: "transparent", color: "var(--text-secondary)", fontSize: "12px", cursor: "pointer" }}
                  >
                    {isEditing ? "Cancel" : "Update"}
                  </button>
                </div>
              </div>

              {/* Progress bar */}
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ flex: 1, height: "6px", background: "var(--border)", borderRadius: "3px", overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: "var(--accent)", borderRadius: "3px", transition: "width 0.3s" }} />
                </div>
                <span style={{ fontSize: "12px", color: "var(--text-muted)", flexShrink: 0 }}>
                  {formatProgress(goal.progressValue, goal.targetValue, goal.progressType)}
                </span>
              </div>

              {goal.dueDate && (
                <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "8px" }}>
                  Due {format(parseISO(goal.dueDate), "MMM d, yyyy")}
                </div>
              )}

              {/* Inline progress edit form */}
              {isEditing && (
                <ProgressEditForm goal={goal} onSave={(patch) => updateGoal(goal.id, patch)} onCancel={() => setEditingId(null)} />
              )}
            </div>
          );
        })}
      </div>
      {showNew && (
        <NewGoalModal
          onClose={() => setShowNew(false)}
          onCreated={(g) => { setGoals(prev => [...prev, g]); setShowNew(false); }}
        />
      )}
    </div>
  );
}

// ── Inline progress edit form ─────────────────────────────────────────────────

function ProgressEditForm({ goal, onSave, onCancel }: { goal: Goal; onSave: (patch: Partial<Goal>) => void; onCancel: () => void }) {
  const [progressValue, setProgressValue] = useState(goal.progressValue);
  const [targetValue, setTargetValue] = useState(goal.targetValue);
  const [progressType, setProgressType] = useState(goal.progressType);
  const [status, setStatus] = useState(goal.status);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    onSave({ progressValue, targetValue, progressType, status });
  };

  const inputStyle = { padding: "7px 10px", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "14px", background: "var(--bg)", color: "var(--text-primary)", outline: "none", width: "100%" };

  return (
    <form onSubmit={submit} style={{ marginTop: "16px", padding: "16px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "8px" }}>
      <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)", marginBottom: "12px", textTransform: "uppercase" }}>Update Progress</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginBottom: "12px" }}>
        <div>
          <label style={{ fontSize: "11px", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>Current value</label>
          <input type="number" value={progressValue} onChange={e => setProgressValue(e.target.value)} step="any" style={inputStyle} />
        </div>
        <div>
          <label style={{ fontSize: "11px", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>Target value</label>
          <input type="number" value={targetValue} onChange={e => setTargetValue(e.target.value)} step="any" style={inputStyle} />
        </div>
        <div>
          <label style={{ fontSize: "11px", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>Type</label>
          <select value={progressType} onChange={e => setProgressType(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
            <option value="percent">Percentage (%)</option>
            <option value="numeric">Numeric</option>
            <option value="currency">Currency ($)</option>
          </select>
        </div>
      </div>
      <div style={{ marginBottom: "14px" }}>
        <label style={{ fontSize: "11px", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>Status</label>
        <select value={status} onChange={e => setStatus(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
          <option value="on_track">On Track</option>
          <option value="at_risk">At Risk</option>
          <option value="off_track">Off Track</option>
          <option value="completed">Completed</option>
        </select>
      </div>
      <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
        <button type="button" onClick={onCancel} style={{ padding: "7px 14px", border: "1px solid var(--border)", borderRadius: "6px", background: "transparent", color: "var(--text-secondary)", fontSize: "13px", cursor: "pointer" }}>Cancel</button>
        <button type="submit" disabled={saving} style={{ padding: "7px 14px", background: "var(--accent)", color: "white", border: "none", borderRadius: "6px", fontSize: "13px", cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

// ── New Goal Modal ─────────────────────────────────────────────────────────────

function NewGoalModal({ onClose, onCreated }: { onClose: () => void; onCreated: (g: Goal) => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetValue, setTargetValue] = useState("100");
  const [progressType, setProgressType] = useState("percent");
  const [dueDate, setDueDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true); setError("");
    const res = await fetch("/api/pm/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        description: description.trim() || undefined,
        targetValue,
        progressType,
        dueDate: dueDate || undefined,
      }),
    });
    const d = await res.json();
    if (d.goal) {
      onCreated(d.goal);
    } else {
      setError(d.error ?? "Failed to create goal");
      setLoading(false);
    }
  };

  const inputStyle = { width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "14px", background: "var(--bg)", color: "var(--text-primary)", outline: "none" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={onClose}>
      <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "12px", padding: "24px", width: "420px", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "20px", color: "var(--text-primary)" }}>New Goal</h3>
        <form onSubmit={submit}>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div>
              <label style={{ fontSize: "12px", color: "var(--text-muted)", display: "block", marginBottom: "5px" }}>Goal title *</label>
              <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Reach 1M ARR" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: "12px", color: "var(--text-muted)", display: "block", marginBottom: "5px" }}>Description</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description" rows={2}
                style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div>
                <label style={{ fontSize: "12px", color: "var(--text-muted)", display: "block", marginBottom: "5px" }}>Target value</label>
                <input type="number" value={targetValue} onChange={e => setTargetValue(e.target.value)} step="any" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: "12px", color: "var(--text-muted)", display: "block", marginBottom: "5px" }}>Type</label>
                <select value={progressType} onChange={e => setProgressType(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                  {Object.entries(PROGRESS_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label style={{ fontSize: "12px", color: "var(--text-muted)", display: "block", marginBottom: "5px" }}>Due date</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={inputStyle} />
            </div>
            {error && <div style={{ color: "#ef4444", fontSize: "13px" }}>{error}</div>}
          </div>
          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "20px" }}>
            <button type="button" onClick={onClose} style={{ padding: "8px 16px", border: "1px solid var(--border)", borderRadius: "6px", background: "transparent", color: "var(--text-secondary)", fontSize: "14px", cursor: "pointer" }}>Cancel</button>
            <button type="submit" disabled={loading || !title.trim()} style={{ padding: "8px 16px", background: "var(--accent)", color: "white", border: "none", borderRadius: "6px", fontSize: "14px", cursor: "pointer", opacity: (loading || !title.trim()) ? 0.6 : 1 }}>
              {loading ? "Creating…" : "Create Goal"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
