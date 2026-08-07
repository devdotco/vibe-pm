"use client";
import { useState, useEffect, use } from "react";

interface Team { id: string; name: string; icon: string | null; description: string | null; }
interface Project { id: string; name: string; color: string; status: string; teamId: string | null; }
interface Member { id: string; teamId: string; userId: string; role: string; joinedAt: string; }
interface OrgUser { id: string; name: string; email: string; }

const EMOJIS = ["🏢", "🚀", "💡", "🎯", "⚡", "🌱", "🔥", "💼"];

export default function WorkspaceDetailPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = use(params);
  const [team, setTeam] = useState<Team | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [allUsers, setAllUsers] = useState<OrgUser[]>([]);
  const [tab, setTab] = useState<"projects" | "members" | "settings">("projects");
  const [loading, setLoading] = useState(true);

  // settings edit state
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editIcon, setEditIcon] = useState("🏢");
  const [saving, setSaving] = useState(false);

  // add member state
  const [addUserId, setAddUserId] = useState("");
  const [addRole, setAddRole] = useState("member");
  const [addingMember, setAddingMember] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/pm/teams/${teamId}`).then(r => r.json()),
      fetch("/api/pm/projects").then(r => r.json()),
      fetch(`/api/pm/teams/${teamId}/members`).then(r => r.json()),
      fetch("/api/pm/admin/users").then(r => r.json()),
    ]).then(([td, pd, md, ud]) => {
      setTeam(td.team);
      setEditName(td.team?.name ?? "");
      setEditDesc(td.team?.description ?? "");
      setEditIcon(td.team?.icon ?? "🏢");
      setProjects((pd.projects ?? []).filter((p: Project) => p.teamId === teamId));
      setMembers(md.members ?? []);
      setAllUsers(ud.users ?? []);
      setLoading(false);
    });
  }, [teamId]);

  const saveSettings = async () => {
    setSaving(true);
    const res = await fetch(`/api/pm/teams/${teamId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName.trim(), description: editDesc.trim() || null, icon: editIcon }),
    });
    const d = await res.json();
    if (d.team) setTeam(d.team);
    setSaving(false);
  };

  const addMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addUserId) return;
    setAddingMember(true);
    const res = await fetch(`/api/pm/teams/${teamId}/members`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: addUserId, role: addRole }),
    });
    const d = await res.json();
    if (d.member) { setMembers(prev => [...prev, d.member]); setAddUserId(""); }
    setAddingMember(false);
  };

  if (loading || !team) return <div style={{ padding: "32px", color: "var(--text-muted)" }}>Loading…</div>;

  const memberUserIds = new Set(members.map(m => m.userId));
  const availableUsers = allUsers.filter(u => !memberUserIds.has(u.id));

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 12px", border: "1px solid var(--border)",
    borderRadius: "6px", fontSize: "14px", background: "var(--bg)", color: "var(--text-primary)", outline: "none",
  };

  return (
    <div style={{ maxWidth: "760px", margin: "0 auto", padding: "32px 24px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "28px" }}>
        <span style={{ fontSize: "32px" }}>{team.icon ?? "🏢"}</span>
        <div>
          <h1 style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-primary)" }}>{team.name}</h1>
          {team.description && <div style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "2px" }}>{team.description}</div>}
        </div>
        <a href="/workspaces" style={{ marginLeft: "auto", fontSize: "13px", color: "var(--text-muted)", textDecoration: "none" }}>← All Workspaces</a>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "24px", borderBottom: "1px solid var(--border)" }}>
        {(["projects", "members", "settings"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "8px 16px", border: "none", background: "none", cursor: "pointer", fontSize: "14px",
            color: tab === t ? "var(--accent)" : "var(--text-secondary)",
            borderBottom: tab === t ? "2px solid var(--accent)" : "2px solid transparent",
            fontWeight: tab === t ? 600 : 400, textTransform: "capitalize",
          }}>
            {t}{t === "projects" ? ` (${projects.length})` : t === "members" ? ` (${members.length})` : ""}
          </button>
        ))}
      </div>

      {/* Projects tab */}
      {tab === "projects" && (
        <div>
          {projects.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 0", color: "var(--text-muted)" }}>
              <div style={{ fontSize: "32px", marginBottom: "8px" }}>📂</div>
              <div style={{ fontSize: "14px" }}>No projects in this workspace yet.</div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "12px" }}>
              {projects.map(p => (
                <a key={p.id} href={`/projects/${p.id}`} style={{ textDecoration: "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 16px", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                    <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: p.color, flexShrink: 0 }} />
                    <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--text-primary)" }}>{p.name}</span>
                    <span style={{ marginLeft: "auto", fontSize: "11px", color: "var(--text-muted)", padding: "2px 6px", border: "1px solid var(--border)", borderRadius: "4px" }}>{p.status}</span>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Members tab */}
      {tab === "members" && (
        <div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "24px" }}>
            {members.map(m => {
              const u = allUsers.find(u => u.id === m.userId);
              const display = u?.name ?? u?.email ?? m.userId.slice(0, 8);
              return (
                <div key={m.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                  <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "var(--accent-subtle)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 600, color: "var(--accent)", flexShrink: 0 }}>
                    {display.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "14px", fontWeight: 500, color: "var(--text-primary)" }}>{display}</div>
                    {u?.email && <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>{u.email}</div>}
                  </div>
                  <span style={{ fontSize: "12px", color: "var(--text-muted)", padding: "2px 8px", border: "1px solid var(--border)", borderRadius: "4px" }}>{m.role}</span>
                </div>
              );
            })}
          </div>

          {availableUsers.length > 0 && (
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: "20px" }}>
              <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "12px" }}>Add member</div>
              <form onSubmit={addMember} style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
                <div style={{ flex: 1 }}>
                  <select value={addUserId} onChange={e => setAddUserId(e.target.value)} style={{ ...inputStyle }}>
                    <option value="">Select a user…</option>
                    {availableUsers.map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
                  </select>
                </div>
                <div>
                  <select value={addRole} onChange={e => setAddRole(e.target.value)} style={{ padding: "8px 10px", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "14px", background: "var(--bg)", color: "var(--text-primary)", cursor: "pointer" }}>
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                    <option value="owner">Owner</option>
                  </select>
                </div>
                <button type="submit" disabled={!addUserId || addingMember} style={{ padding: "8px 16px", background: "var(--accent)", color: "white", border: "none", borderRadius: "6px", fontSize: "14px", cursor: "pointer", opacity: (!addUserId || addingMember) ? 0.6 : 1 }}>
                  {addingMember ? "Adding…" : "Add"}
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      {/* Settings tab */}
      {tab === "settings" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", maxWidth: "480px" }}>
          <label>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)", marginBottom: "6px", textTransform: "uppercase" }}>Icon</div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {EMOJIS.map(e => (
                <button key={e} onClick={() => setEditIcon(e)} style={{
                  width: "36px", height: "36px", borderRadius: "8px", border: `2px solid ${editIcon === e ? "var(--accent)" : "var(--border)"}`,
                  background: editIcon === e ? "var(--accent-subtle)" : "var(--bg)", cursor: "pointer", fontSize: "18px",
                }}>
                  {e}
                </button>
              ))}
            </div>
          </label>
          <label>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)", marginBottom: "6px", textTransform: "uppercase" }}>Name</div>
            <input value={editName} onChange={e => setEditName(e.target.value)} style={inputStyle} />
          </label>
          <label>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)", marginBottom: "6px", textTransform: "uppercase" }}>Description</div>
            <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={3}
              style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
          </label>
          <button onClick={saveSettings} disabled={saving || !editName.trim()} style={{ padding: "8px 16px", background: "var(--accent)", color: "white", border: "none", borderRadius: "6px", fontSize: "14px", cursor: "pointer", alignSelf: "flex-start", opacity: (saving || !editName.trim()) ? 0.6 : 1 }}>
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      )}
    </div>
  );
}
