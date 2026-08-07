"use client";
import { useState, useEffect, use } from "react";

interface Project { id: string; name: string; description: string | null; color: string; status: string; }
interface ProjectSettings { messagingChannelId: string | null; notifyOn: string[]; }
interface Member { id: string; projectId: string; userId: string; role: string; joinedAt: string; userName: string | null; userEmail: string | null; userAvatarUrl: string | null; }
interface OrgUser { id: string; name: string; email: string; status: string; }
interface Automation { id: string; name: string; triggerType: string; actionType: string; isEnabled: boolean; lastRunAt: string | null; runCount: number; }

const NOTIFY_OPTIONS = [
  { key: "task.created", label: "Task created" },
  { key: "task.completed", label: "Task completed" },
  { key: "task.overdue", label: "Task overdue" },
  { key: "task.assigned", label: "Task assigned" },
  { key: "milestone.reached", label: "Milestone reached" },
];

export default function ProjectSettingsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  const [tab, setTab] = useState("general");
  const [project, setProject] = useState<Project | null>(null);
  const [settings, setSettings] = useState<ProjectSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/pm/projects/${projectId}`).then(r => r.json()).then(d => setProject(d.project));
    fetch(`/api/pm/projects/${projectId}/settings`).then(r => r.json()).then(d => setSettings(d.settings));
  }, [projectId]);

  const saveProject = async (patch: Partial<Project>) => {
    setSaving(true);
    const res = await fetch(`/api/pm/projects/${projectId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    const d = await res.json();
    if (d.project) setProject(d.project);
    setSaving(false);
  };

  const saveSettings = async (patch: Partial<ProjectSettings>) => {
    const newSettings = { ...settings, ...patch };
    setSettings(newSettings as ProjectSettings);
    await fetch(`/api/pm/projects/${projectId}/settings`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
  };

  const TABS = ["general", "members", "messaging", "automations"];

  if (!project) return <div style={{ padding: "32px", color: "var(--text-muted)" }}>Loading...</div>;

  return (
    <div style={{ maxWidth: "700px", margin: "0 auto", padding: "32px 24px" }}>
      <h2 style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "24px" }}>Project Settings</h2>
      <div style={{ display: "flex", gap: "4px", marginBottom: "28px", borderBottom: "1px solid var(--border)", paddingBottom: "0" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "8px 16px", border: "none", background: "none", cursor: "pointer", fontSize: "14px",
            color: tab === t ? "var(--accent)" : "var(--text-secondary)",
            borderBottom: tab === t ? "2px solid var(--accent)" : "2px solid transparent",
            fontWeight: tab === t ? 600 : 400, textTransform: "capitalize",
          }}>
            {t}
          </button>
        ))}
      </div>

      {tab === "general" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <label>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)", marginBottom: "6px", textTransform: "uppercase" }}>Project name</div>
            <input value={project.name} onChange={e => setProject(p => p ? { ...p, name: e.target.value } : p)}
              onBlur={e => saveProject({ name: e.target.value })}
              style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "14px", background: "var(--bg)", color: "var(--text-primary)", outline: "none" }} />
          </label>
          <label>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)", marginBottom: "6px", textTransform: "uppercase" }}>Description</div>
            <textarea value={project.description ?? ""} onChange={e => setProject(p => p ? { ...p, description: e.target.value } : p)}
              onBlur={e => saveProject({ description: e.target.value })} rows={3}
              style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "14px", background: "var(--bg)", color: "var(--text-primary)", outline: "none", resize: "vertical", fontFamily: "inherit" }} />
          </label>
          <label>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)", marginBottom: "6px", textTransform: "uppercase" }}>Status</div>
            <select value={project.status} onChange={e => saveProject({ status: e.target.value })}
              style={{ padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "14px", background: "var(--bg)", color: "var(--text-primary)", cursor: "pointer" }}>
              <option value="active">Active</option>
              <option value="on_hold">On Hold</option>
              <option value="completed">Completed</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          {saving && <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Saving...</div>}
        </div>
      )}

      {tab === "messaging" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div>
            <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "8px" }}>Link messaging channel</div>
            <div style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "12px" }}>
              Paste the channel ID from the messaging module to link this project.
              Task events will be posted to that channel.
            </div>
            <input
              value={settings?.messagingChannelId ?? ""}
              onChange={e => setSettings(s => s ? { ...s, messagingChannelId: e.target.value } : s)}
              onBlur={e => saveSettings({ messagingChannelId: e.target.value || null })}
              placeholder="Channel ID"
              style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "14px", background: "var(--bg)", color: "var(--text-primary)", outline: "none" }}
            />
          </div>
          <div>
            <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "12px" }}>Notifications</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {NOTIFY_OPTIONS.map(opt => {
                const checked = settings?.notifyOn?.includes(opt.key) ?? true;
                return (
                  <label key={opt.key} style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                    <input type="checkbox" checked={checked}
                      onChange={e => {
                        const current = settings?.notifyOn ?? [];
                        const newOn = e.target.checked ? [...current, opt.key] : current.filter(k => k !== opt.key);
                        saveSettings({ notifyOn: newOn });
                      }}
                      style={{ width: "15px", height: "15px", accentColor: "var(--accent)", cursor: "pointer" }} />
                    <div>
                      <div style={{ fontSize: "14px", color: "var(--text-primary)" }}>{opt.label}</div>
                      {settings?.messagingChannelId && (
                        <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                          &rarr; {checked ? "Will post to" : "Won't post to"} #{settings.messagingChannelId}
                        </div>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {tab === "automations" && (
        <div>
          <AutomationsTab projectId={projectId} />
        </div>
      )}

      {tab === "members" && (
        <MembersTab projectId={projectId} />
      )}
    </div>
  );
}

// ── Members Tab ───────────────────────────────────────────────────────────────

function MembersTab({ projectId }: { projectId: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [allUsers, setAllUsers] = useState<OrgUser[]>([]);
  const [addUserId, setAddUserId] = useState("");
  const [addRole, setAddRole] = useState("editor");
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/pm/projects/${projectId}/members`).then(r => r.json()),
      fetch(`/api/pm/admin/users`).then(r => r.json()),
    ]).then(([membersData, usersData]) => {
      setMembers(membersData.members ?? []);
      setAllUsers(usersData.users ?? []);
      setLoading(false);
    });
  }, [projectId]);

  const memberIds = new Set(members.map(m => m.userId));
  const availableUsers = allUsers.filter(u => !memberIds.has(u.id) && u.status === "active");

  const addMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addUserId) return;
    setAdding(true);
    const res = await fetch(`/api/pm/projects/${projectId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: addUserId, role: addRole }),
    });
    const d = await res.json();
    if (d.member) {
      const addedUser = allUsers.find(u => u.id === addUserId);
      setMembers(prev => [...prev, {
        ...d.member,
        joinedAt: typeof d.member.joinedAt === "string" ? d.member.joinedAt : new Date(d.member.joinedAt).toISOString(),
        userName: addedUser?.name ?? null,
        userEmail: addedUser?.email ?? null,
        userAvatarUrl: null,
      }]);
      setAddUserId("");
      setAddRole("editor");
    }
    setAdding(false);
  };

  const removeMember = async (userId: string) => {
    await fetch(`/api/pm/projects/${projectId}/members/${userId}`, { method: "DELETE" });
    setMembers(prev => prev.filter(m => m.userId !== userId));
  };

  if (loading) return <div style={{ color: "var(--text-muted)", fontSize: "14px" }}>Loading members...</div>;

  return (
    <div>
      <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "16px" }}>
        Project members ({members.length})
      </div>

      {/* Member list */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "24px" }}>
        {members.length === 0 && (
          <div style={{ color: "var(--text-muted)", fontSize: "14px", textAlign: "center", padding: "24px 0" }}>No members yet</div>
        )}
        {members.map(m => (
          <div key={m.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "8px" }}>
            <div style={{ width: "34px", height: "34px", borderRadius: "50%", background: "var(--accent-subtle)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 600, color: "var(--accent)", flexShrink: 0 }}>
              {(m.userName ?? m.userEmail ?? "?").charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1, overflow: "hidden" }}>
              <div style={{ fontSize: "14px", fontWeight: 500, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {m.userName ?? m.userEmail ?? m.userId.slice(0, 8)}
              </div>
              {m.userEmail && (
                <div style={{ fontSize: "12px", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.userEmail}</div>
              )}
            </div>
            <span style={{ fontSize: "12px", color: "var(--text-muted)", padding: "2px 8px", border: "1px solid var(--border)", borderRadius: "4px", flexShrink: 0 }}>
              {m.role}
            </span>
            <button
              onClick={() => removeMember(m.userId)}
              title="Remove member"
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: "16px", padding: "2px 4px", flexShrink: 0 }}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* Add member form */}
      {availableUsers.length > 0 && (
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: "20px" }}>
          <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "12px" }}>Add member</div>
          <form onSubmit={addMember} style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: "12px", color: "var(--text-muted)", display: "block", marginBottom: "5px" }}>User</label>
              <select
                value={addUserId}
                onChange={e => setAddUserId(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "14px", background: "var(--bg)", color: "var(--text-primary)", cursor: "pointer" }}
              >
                <option value="">Select a user…</option>
                {availableUsers.map(u => (
                  <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: "12px", color: "var(--text-muted)", display: "block", marginBottom: "5px" }}>Role</label>
              <select
                value={addRole}
                onChange={e => setAddRole(e.target.value)}
                style={{ padding: "8px 10px", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "14px", background: "var(--bg)", color: "var(--text-primary)", cursor: "pointer" }}
              >
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
                <option value="admin">Admin</option>
                <option value="owner">Owner</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={!addUserId || adding}
              style={{ padding: "8px 16px", background: "var(--accent)", color: "white", border: "none", borderRadius: "6px", fontSize: "14px", cursor: "pointer", opacity: (!addUserId || adding) ? 0.6 : 1 }}
            >
              {adding ? "Adding…" : "Add"}
            </button>
          </form>
        </div>
      )}

      {availableUsers.length === 0 && members.length > 0 && (
        <div style={{ fontSize: "13px", color: "var(--text-muted)", borderTop: "1px solid var(--border)", paddingTop: "16px" }}>
          All available users are already members.
        </div>
      )}
    </div>
  );
}

// ── Automations Tab ───────────────────────────────────────────────────────────

function AutomationsTab({ projectId }: { projectId: string }) {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    fetch(`/api/pm/projects/${projectId}/automations`).then(r => r.json()).then(d => setAutomations(d.automations ?? []));
  }, [projectId]);

  const toggle = async (id: string) => {
    const res = await fetch(`/api/pm/automations/${id}/toggle`, { method: "PATCH" });
    const d = await res.json();
    setAutomations(a => a.map(x => x.id === id ? d.automation : x));
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "16px" }}>
        <button onClick={() => setShowNew(true)} style={{ padding: "8px 14px", background: "var(--accent)", color: "white", border: "none", borderRadius: "6px", fontSize: "13px", cursor: "pointer" }}>+ Add Rule</button>
      </div>
      {automations.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)" }}>
          <div style={{ fontSize: "32px", marginBottom: "8px" }}>&#9889;</div>
          <div>No automations yet. Create rules to automate your workflow.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {automations.map(auto => (
            <div key={auto.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 16px", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "8px" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "14px", fontWeight: 500, color: "var(--text-primary)" }}>{auto.name}</div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                  WHEN {auto.triggerType} &rarr; THEN {auto.actionType}
                  {auto.lastRunAt && <span> &middot; Last run {new Date(auto.lastRunAt).toLocaleDateString()}</span>}
                  {auto.runCount > 0 && <span> &middot; {auto.runCount} runs</span>}
                </div>
              </div>
              <div
                style={{ display: "flex", alignItems: "center", gap: "2px", background: auto.isEnabled ? "var(--positive)" : "var(--border)", borderRadius: "20px", padding: "2px", width: "36px", cursor: "pointer", transition: "background 0.2s" }}
                onClick={() => toggle(auto.id)}
              >
                <div style={{ width: "16px", height: "16px", background: "white", borderRadius: "50%", marginLeft: auto.isEnabled ? "16px" : "0", transition: "margin 0.2s" }} />
              </div>
            </div>
          ))}
        </div>
      )}
      {showNew && (
        <NewAutomationModal
          projectId={projectId}
          onClose={() => setShowNew(false)}
          onCreated={(a) => { setAutomations(prev => [...prev, a]); setShowNew(false); }}
        />
      )}
    </div>
  );
}

// ── New Automation Modal ──────────────────────────────────────────────────────

const TRIGGER_OPTIONS = [
  { value: "task.created", label: "Task created" },
  { value: "task.completed", label: "Task completed" },
  { value: "task.overdue", label: "Task overdue" },
  { value: "task.assigned", label: "Task assigned" },
  { value: "status.changed", label: "Status changed" },
];

const ACTION_OPTIONS = [
  { value: "notify_channel", label: "Notify channel" },
  { value: "assign_user", label: "Assign user" },
  { value: "change_status", label: "Change status" },
  { value: "add_label", label: "Add label" },
];

const STATUS_OPTIONS = ["not_started", "in_progress", "in_review", "completed", "cancelled"];

function NewAutomationModal({ projectId, onClose, onCreated }: { projectId: string; onClose: () => void; onCreated: (a: Automation) => void }) {
  const [name, setName] = useState("");
  const [triggerType, setTriggerType] = useState("task.created");
  const [actionType, setActionType] = useState("notify_channel");
  const [channelId, setChannelId] = useState("");
  const [assignUserId, setAssignUserId] = useState("");
  const [changeStatus, setChangeStatus] = useState("in_progress");
  const [label, setLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const buildActionParams = () => {
    switch (actionType) {
      case "notify_channel": return { channelId };
      case "assign_user": return { userId: assignUserId };
      case "change_status": return { status: changeStatus };
      case "add_label": return { label };
      default: return {};
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true); setError("");
    const res = await fetch(`/api/pm/projects/${projectId}/automations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        triggerType,
        actionType,
        triggerConditions: {},
        actionParams: buildActionParams(),
      }),
    });
    const d = await res.json();
    if (d.automation) {
      onCreated(d.automation);
    } else {
      setError(d.error ?? "Failed to create automation");
      setLoading(false);
    }
  };

  const inputStyle = { width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "14px", background: "var(--bg)", color: "var(--text-primary)", outline: "none" };
  const labelStyle = { fontSize: "12px", color: "var(--text-muted)", display: "block" as const, marginBottom: "5px" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={onClose}>
      <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "12px", padding: "24px", width: "440px", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "20px", color: "var(--text-primary)" }}>New Automation Rule</h3>
        <form onSubmit={submit}>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div>
              <label style={labelStyle}>Rule name</label>
              <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Notify on task complete" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>When (trigger)</label>
              <select value={triggerType} onChange={e => setTriggerType(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                {TRIGGER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Then (action)</label>
              <select value={actionType} onChange={e => setActionType(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                {ACTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {/* Action config */}
            {actionType === "notify_channel" && (
              <div>
                <label style={labelStyle}>Channel ID</label>
                <input value={channelId} onChange={e => setChannelId(e.target.value)} placeholder="e.g. general" style={inputStyle} />
              </div>
            )}
            {actionType === "assign_user" && (
              <div>
                <label style={labelStyle}>User ID to assign</label>
                <input value={assignUserId} onChange={e => setAssignUserId(e.target.value)} placeholder="User UUID" style={inputStyle} />
              </div>
            )}
            {actionType === "change_status" && (
              <div>
                <label style={labelStyle}>Change to status</label>
                <select value={changeStatus} onChange={e => setChangeStatus(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                </select>
              </div>
            )}
            {actionType === "add_label" && (
              <div>
                <label style={labelStyle}>Label to add</label>
                <input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. needs-review" style={inputStyle} />
              </div>
            )}

            {error && <div style={{ color: "#ef4444", fontSize: "13px" }}>{error}</div>}
          </div>

          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "20px" }}>
            <button type="button" onClick={onClose} style={{ padding: "8px 16px", border: "1px solid var(--border)", borderRadius: "6px", background: "transparent", color: "var(--text-secondary)", fontSize: "14px", cursor: "pointer" }}>Cancel</button>
            <button type="submit" disabled={loading || !name.trim()} style={{ padding: "8px 16px", background: "var(--accent)", color: "white", border: "none", borderRadius: "6px", fontSize: "14px", cursor: "pointer", opacity: (loading || !name.trim()) ? 0.6 : 1 }}>
              {loading ? "Creating…" : "Create Rule"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
