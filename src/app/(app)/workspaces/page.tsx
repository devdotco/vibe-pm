"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Team {
  id: string;
  name: string;
  icon: string | null;
  description: string | null;
  createdAt: string;
}

interface Project {
  id: string;
  name: string;
  color: string;
  teamId: string | null;
}

interface Member {
  id: string;
  teamId: string;
  userId: string;
  role: string;
  joinedAt: string;
}

const EMOJIS = ["🏢", "🚀", "💡", "🎯", "⚡", "🌱"];

function NewTeamModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (t: Team) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("🏢");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    const res = await fetch("/api/pm/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), description: description.trim() || undefined, icon }),
    });
    const data = await res.json() as { team: Team };
    if (data.team) onCreated(data.team);
    setLoading(false);
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    border: "1px solid var(--border)",
    borderRadius: "6px",
    fontSize: "13px",
    background: "var(--bg)",
    color: "var(--text-primary)",
    outline: "none",
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          borderRadius: "12px",
          padding: "24px",
          width: "400px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "20px", color: "var(--text-primary)" }}>
          New Workspace
        </h2>
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: "5px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Icon
            </label>
            <div style={{ display: "flex", gap: "8px" }}>
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setIcon(e)}
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "8px",
                    fontSize: "18px",
                    border: icon === e ? "2px solid var(--accent)" : "1px solid var(--border)",
                    background: icon === e ? "var(--accent-subtle)" : "var(--bg)",
                    cursor: "pointer",
                  }}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: "5px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Name *
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Engineering, Marketing"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: "5px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Description
            </label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this workspace do?"
              style={inputStyle}
            />
          </div>
          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "4px" }}>
            <button type="button" onClick={onClose} style={{ padding: "8px 16px", borderRadius: "6px", border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", fontSize: "13px", cursor: "pointer" }}>
              Cancel
            </button>
            <button type="submit" disabled={loading || !name.trim()} style={{ padding: "8px 16px", borderRadius: "6px", border: "none", background: "var(--accent)", color: "white", fontSize: "13px", fontWeight: 500, cursor: "pointer", opacity: loading || !name.trim() ? 0.6 : 1 }}>
              {loading ? "Creating..." : "Create workspace"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddMemberModal({
  teamId,
  onClose,
  onAdded,
}: {
  teamId: string;
  onClose: () => void;
  onAdded: (m: Member) => void;
}) {
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState("member");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId.trim()) return;
    setLoading(true);
    setError("");
    const res = await fetch(`/api/pm/teams/${teamId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: userId.trim(), role }),
    });
    const data = await res.json() as { member?: Member; error?: string };
    if (data.member) {
      onAdded(data.member);
    } else {
      setError(data.error ?? "Failed to add member");
    }
    setLoading(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100 }} onClick={onClose}>
      <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "12px", padding: "24px", width: "360px", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: "15px", fontWeight: 600, marginBottom: "16px", color: "var(--text-primary)" }}>Add Member</h2>
        {error && <div style={{ fontSize: "12px", color: "var(--negative)", marginBottom: "10px" }}>{error}</div>}
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div>
            <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: "5px", textTransform: "uppercase" }}>User ID</label>
            <input autoFocus value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="User UUID" style={{ width: "100%", padding: "7px 10px", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "13px", background: "var(--bg)", color: "var(--text-primary)", outline: "none" }} />
          </div>
          <div>
            <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: "5px", textTransform: "uppercase" }}>Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value)} style={{ width: "100%", padding: "7px 10px", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "13px", background: "var(--bg)", color: "var(--text-primary)", outline: "none" }}>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} style={{ padding: "7px 14px", borderRadius: "6px", border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", fontSize: "13px", cursor: "pointer" }}>Cancel</button>
            <button type="submit" disabled={loading || !userId.trim()} style={{ padding: "7px 14px", borderRadius: "6px", border: "none", background: "var(--accent)", color: "white", fontSize: "13px", fontWeight: 500, cursor: "pointer", opacity: loading || !userId.trim() ? 0.6 : 1 }}>{loading ? "Adding..." : "Add member"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function WorkspacesPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [members, setMembers] = useState<Record<string, Member[]>>({});
  const [loading, setLoading] = useState(true);
  const [showNewTeam, setShowNewTeam] = useState(false);
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
  const [addMemberForTeam, setAddMemberForTeam] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/pm/teams").then((r) => r.json()) as Promise<{ teams: Team[] }>,
      fetch("/api/pm/projects").then((r) => r.json()) as Promise<{ projects: Project[] }>,
    ]).then(([teamsData, projectsData]) => {
      setTeams(teamsData.teams ?? []);
      setProjects(projectsData.projects ?? []);
      setLoading(false);
    });
  }, []);

  const loadMembers = async (teamId: string) => {
    if (members[teamId]) return;
    const data = await fetch(`/api/pm/teams/${teamId}/members`).then((r) => r.json()) as { members: Member[] };
    setMembers((m) => ({ ...m, [teamId]: data.members ?? [] }));
  };

  const toggleTeam = (teamId: string) => {
    if (expandedTeam === teamId) {
      setExpandedTeam(null);
    } else {
      setExpandedTeam(teamId);
      loadMembers(teamId);
    }
  };

  const projectsByTeam = (teamId: string) =>
    projects.filter((p) => p.teamId === teamId);

  if (loading) {
    return <div style={{ padding: "32px", color: "var(--text-muted)" }}>Loading...</div>;
  }

  return (
    <div style={{ padding: "32px 28px", maxWidth: "900px", margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-primary)" }}>Workspaces</h1>
        <button
          onClick={() => setShowNewTeam(true)}
          style={{ padding: "8px 16px", background: "var(--accent)", color: "white", borderRadius: "6px", fontSize: "13px", fontWeight: 500, border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}
        >
          <span style={{ fontSize: "16px", lineHeight: 1 }}>+</span>
          New Workspace
        </button>
      </div>

      {teams.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <div style={{ fontSize: "40px", marginBottom: "12px" }}>🏢</div>
          <div style={{ fontSize: "16px", fontWeight: 500, marginBottom: "8px", color: "var(--text-primary)" }}>No workspaces yet</div>
          <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>Create a workspace to organize your projects by team or department.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {teams.map((team) => {
            const isExpanded = expandedTeam === team.id;
            const teamProjects = projectsByTeam(team.id);
            const teamMembers = members[team.id] ?? [];

            return (
              <div
                key={team.id}
                style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "10px", overflow: "hidden" }}
              >
                {/* Team header */}
                <div
                  style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 16px", cursor: "pointer" }}
                  onClick={() => toggleTeam(team.id)}
                >
                  <span style={{ fontSize: "24px" }}>{team.icon ?? "🏢"}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-primary)" }}>{team.name}</div>
                    {team.description && (
                      <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>{team.description}</div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{teamProjects.length} project{teamProjects.length !== 1 ? "s" : ""}</span>
                    <span style={{ fontSize: "12px", color: "var(--text-muted)", transform: isExpanded ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.1s", display: "inline-block" }}>▾</span>
                  </div>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div style={{ borderTop: "1px solid var(--border)", padding: "16px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                      {/* Projects */}
                      <div>
                        <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>Projects</div>
                        {teamProjects.length === 0 ? (
                          <div style={{ fontSize: "12px", color: "var(--text-muted)", fontStyle: "italic" }}>No projects in this workspace.</div>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                            {teamProjects.map((p) => (
                              <Link
                                key={p.id}
                                href={`/projects/${p.id}`}
                                style={{ display: "flex", alignItems: "center", gap: "8px", padding: "5px 8px", borderRadius: "6px", textDecoration: "none", background: "var(--bg)" }}
                                onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = "var(--panel-hover)"; }}
                                onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = "var(--bg)"; }}
                              >
                                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: p.color, flexShrink: 0, display: "inline-block" }} />
                                <span style={{ fontSize: "13px", color: "var(--text-primary)" }}>{p.name}</span>
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Members */}
                      <div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                          <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Members</div>
                          <button
                            onClick={(e) => { e.stopPropagation(); setAddMemberForTeam(team.id); }}
                            style={{ fontSize: "11px", color: "var(--accent)", background: "none", border: "none", cursor: "pointer", padding: "0" }}
                          >
                            + Add
                          </button>
                        </div>
                        {teamMembers.length === 0 ? (
                          <div style={{ fontSize: "12px", color: "var(--text-muted)", fontStyle: "italic" }}>No members loaded.</div>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                            {teamMembers.map((m) => (
                              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "4px 0" }}>
                                <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: "var(--accent-subtle)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 600, color: "var(--accent)", flexShrink: 0 }}>
                                  {m.userId.charAt(0).toUpperCase()}
                                </div>
                                <span style={{ fontSize: "12px", color: "var(--text-muted)", fontFamily: "monospace" }}>
                                  {m.userId.slice(0, 8)}…
                                </span>
                                <span style={{ fontSize: "11px", padding: "1px 6px", borderRadius: "10px", background: "var(--panel-hover)", color: "var(--text-muted)", textTransform: "capitalize" }}>
                                  {m.role}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showNewTeam && (
        <NewTeamModal
          onClose={() => setShowNewTeam(false)}
          onCreated={(t) => {
            setTeams((prev) => [...prev, t]);
            setShowNewTeam(false);
          }}
        />
      )}

      {addMemberForTeam && (
        <AddMemberModal
          teamId={addMemberForTeam}
          onClose={() => setAddMemberForTeam(null)}
          onAdded={(m) => {
            setMembers((prev) => ({
              ...prev,
              [addMemberForTeam]: [...(prev[addMemberForTeam] ?? []), m],
            }));
            setAddMemberForTeam(null);
          }}
        />
      )}
    </div>
  );
}
