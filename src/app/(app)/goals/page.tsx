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

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    fetch("/api/pm/goals").then(r => r.json()).then(d => {
      setGoals(d.goals ?? []);
      setLoading(false);
    });
  }, []);

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
          </div>
        )}
        {goals.map(goal => {
          const pct = Math.min(100, Math.round((Number(goal.progressValue) / Number(goal.targetValue)) * 100)) || 0;
          const statusCfg = STATUS_CONFIG[goal.status] ?? STATUS_CONFIG.on_track;
          return (
            <div key={goal.id} style={{
              background: "var(--bg-elevated)", border: "1px solid var(--border)",
              borderRadius: "10px", padding: "20px",
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "12px" }}>
                <div>
                  <div style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-primary)" }}>{goal.title}</div>
                  {goal.description && <div style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "2px" }}>{goal.description}</div>}
                </div>
                <span style={{
                  fontSize: "11px", fontWeight: 500, color: statusCfg.color,
                  padding: "3px 8px", borderRadius: "4px", background: statusCfg.color + "15",
                  flexShrink: 0, marginLeft: "12px",
                }}>
                  {statusCfg.label}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ flex: 1, height: "6px", background: "var(--border)", borderRadius: "3px", overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: "var(--accent)", borderRadius: "3px", transition: "width 0.3s" }} />
                </div>
                <span style={{ fontSize: "12px", color: "var(--text-muted)", flexShrink: 0 }}>{pct}%</span>
              </div>
              {goal.dueDate && (
                <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "8px" }}>
                  Due {format(parseISO(goal.dueDate), "MMM d, yyyy")}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {showNew && <NewGoalModal onClose={() => setShowNew(false)} onCreated={(g) => { setGoals(prev => [...prev, g]); setShowNew(false); }} />}
    </div>
  );
}

function NewGoalModal({ onClose, onCreated }: { onClose: () => void; onCreated: (g: Goal) => void }) {
  const [title, setTitle] = useState(""); const [loading, setLoading] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!title.trim()) return; setLoading(true);
    const res = await fetch("/api/pm/goals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: title.trim() }) });
    const d = await res.json();
    if (d.goal) onCreated(d.goal); setLoading(false);
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={onClose}>
      <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "12px", padding: "24px", width: "360px" }} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "16px", color: "var(--text-primary)" }}>New Goal</h3>
        <form onSubmit={submit}>
          <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="Goal title" style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "14px", background: "var(--bg)", color: "var(--text-primary)", outline: "none", marginBottom: "16px" }} />
          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} style={{ padding: "8px 16px", border: "1px solid var(--border)", borderRadius: "6px", background: "transparent", color: "var(--text-secondary)", fontSize: "14px", cursor: "pointer" }}>Cancel</button>
            <button type="submit" disabled={loading} style={{ padding: "8px 16px", background: "var(--accent)", color: "white", border: "none", borderRadius: "6px", fontSize: "14px", cursor: "pointer" }}>{loading ? "..." : "Create"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
