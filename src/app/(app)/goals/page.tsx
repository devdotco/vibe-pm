"use client";
import { useState, useEffect } from "react";
import { format, parseISO } from "date-fns";

interface Goal {
  id: string; title: string; description: string | null; status: string;
  progressValue: string; targetValue: string; progressType: string;
  dueDate: string | null; ownerId: string; teamId: string | null;
}

interface Team { id: string; name: string; icon: string | null; }
interface Project { id: string; name: string; color: string; }
interface GoalProjectLink { id: string; goalId: string; projectId: string; orgId: string; }

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
  const [teams, setTeams] = useState<Team[]>([]);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedLinks, setExpandedLinks] = useState<Set<string>>(new Set());
  const [goalLinks, setGoalLinks] = useState<Record<string, GoalProjectLink[]>>({});

  useEffect(() => {
    Promise.all([
      fetch("/api/pm/goals").then(r => r.json()),
      fetch("/api/pm/teams").then(r => r.json()),
      fetch("/api/pm/projects").then(r => r.json()),
    ]).then(([gd, td, pd]) => {
      setGoals(gd.goals ?? []);
      setTeams(td.teams ?? []);
      setAllProjects(pd.projects ?? []);
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

  const toggleLinks = async (goalId: string) => {
    const next = new Set(expandedLinks);
    if (next.has(goalId)) {
      next.delete(goalId);
    } else {
      next.add(goalId);
      if (!goalLinks[goalId]) {
        const res = await fetch(`/api/pm/goals/${goalId}/project-links`);
        const d = await res.json();
        setGoalLinks(prev => ({ ...prev, [goalId]: d.links ?? [] }));
      }
    }
    setExpandedLinks(next);
  };

  const linkProject = async (goalId: string, projectId: string) => {
    const res = await fetch(`/api/pm/goals/${goalId}/project-links`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    });
    const d = await res.json();
    if (d.link) {
      setGoalLinks(prev => ({ ...prev, [goalId]: [...(prev[goalId] ?? []), d.link] }));
    }
  };

  const unlinkProject = async (goalId: string, linkId: string) => {
    await fetch(`/api/pm/goals/${goalId}/project-links/${linkId}`, { method: "DELETE" });
    setGoalLinks(prev => ({ ...prev, [goalId]: (prev[goalId] ?? []).filter(l => l.id !== linkId) }));
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
          const statusCfg = STATUS_CONFIG[goal.status] ?? STATUS_CONFIG.on_track!;
          const isEditing = editingId === goal.id;
          const linksExpanded = expandedLinks.has(goal.id);
          const links = goalLinks[goal.id] ?? [];
          const team = teams.find(t => t.id === goal.teamId);

          return (
            <div key={goal.id} style={{
              background: "var(--bg-elevated)", border: "1px solid var(--border)",
              borderRadius: "10px", padding: "20px",
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "12px" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-primary)" }}>{goal.title}</div>
                  {goal.description && <div style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "2px" }}>{goal.description}</div>}
                  {team && (
                    <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
                      {team.icon ?? "🏢"} {team.name}
                    </div>
                  )}
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

              {/* Linked Projects */}
              <div style={{ marginTop: "12px", borderTop: "1px solid var(--border)", paddingTop: "10px" }}>
                <button
                  onClick={() => toggleLinks(goal.id)}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: "12px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "4px", padding: 0 }}
                >
                  {linksExpanded ? "▾" : "▶"} Linked Projects {links.length > 0 ? `(${links.length})` : ""}
                </button>
                {linksExpanded && (
                  <LinkedProjectsPanel
                    goalId={goal.id}
                    links={links}
                    allProjects={allProjects}
                    onLink={linkProject}
                    onUnlink={unlinkProject}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
      {showNew && (
        <NewGoalModal
          teams={teams}
          onClose={() => setShowNew(false)}
          onCreated={(g) => { setGoals(prev => [...prev, g]); setShowNew(false); }}
        />
      )}
    </div>
  );
}

// ── Linked Projects Panel ─────────────────────────────────────────────────────

function LinkedProjectsPanel({
  goalId, links, allProjects, onLink, onUnlink,
}: {
  goalId: string;
  links: { id: string; goalId: string; projectId: string; orgId: string }[];
  allProjects: Project[];
  onLink: (goalId: string, projectId: string) => void;
  onUnlink: (goalId: string, linkId: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState("");

  const linkedProjectIds = new Set(links.map(l => l.projectId));
  const available = allProjects.filter(p => !linkedProjectIds.has(p.id));

  return (
    <div style={{ marginTop: "8px" }}>
      {links.length === 0 && !adding && (
        <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "6px" }}>No projects linked yet.</div>
      )}
      {links.map(link => {
        const project = allProjects.find(p => p.id === link.projectId);
        if (!project) return null;
        return (
          <div key={link.id} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: project.color, flexShrink: 0 }} />
            <a href={`/projects/${project.id}`} style={{ fontSize: "13px", color: "var(--text-primary)", textDecoration: "none", flex: 1 }}>{project.name}</a>
            <button onClick={() => onUnlink(goalId, link.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: "14px", padding: "0 2px" }}>×</button>
          </div>
        );
      })}
      {adding ? (
        <div style={{ display: "flex", gap: "6px", alignItems: "center", marginTop: "6px" }}>
          <select
            value={selectedProjectId}
            onChange={e => setSelectedProjectId(e.target.value)}
            style={{ flex: 1, padding: "6px 8px", border: "1px solid var(--border)", borderRadius: "5px", fontSize: "13px", background: "var(--bg)", color: "var(--text-primary)", cursor: "pointer" }}
          >
            <option value="">Select a project…</option>
            {available.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button
            onClick={() => { if (selectedProjectId) { onLink(goalId, selectedProjectId); setSelectedProjectId(""); setAdding(false); } }}
            disabled={!selectedProjectId}
            style={{ padding: "6px 12px", background: "var(--accent)", color: "white", border: "none", borderRadius: "5px", fontSize: "12px", cursor: "pointer", opacity: !selectedProjectId ? 0.6 : 1 }}
          >
            Link
          </button>
          <button onClick={() => { setAdding(false); setSelectedProjectId(""); }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: "16px" }}>×</button>
        </div>
      ) : available.length > 0 ? (
        <button onClick={() => setAdding(true)} style={{ fontSize: "12px", color: "var(--accent)", background: "none", border: "none", cursor: "pointer", padding: 0, marginTop: "4px" }}>
          + Link project
        </button>
      ) : null}
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

function NewGoalModal({
  teams,
  onClose,
  onCreated,
}: {
  teams: Team[];
  onClose: () => void;
  onCreated: (g: Goal) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetValue, setTargetValue] = useState("100");
  const [progressType, setProgressType] = useState("percent");
  const [dueDate, setDueDate] = useState("");
  const [teamId, setTeamId] = useState("");
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
        teamId: teamId || undefined,
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

  const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "14px", background: "var(--bg)", color: "var(--text-primary)", outline: "none" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={onClose}>
      <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "12px", padding: "24px", width: "440px", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }} onClick={e => e.stopPropagation()}>
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
            {teams.length > 0 && (
              <div>
                <label style={{ fontSize: "12px", color: "var(--text-muted)", display: "block", marginBottom: "5px" }}>Workspace (optional)</label>
                <select value={teamId} onChange={e => setTeamId(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                  <option value="">No workspace</option>
                  {teams.map(t => <option key={t.id} value={t.id}>{t.icon ?? "🏢"} {t.name}</option>)}
                </select>
              </div>
            )}
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
