"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import type { User } from "@/lib/db/schema";

interface Project {
  id: string;
  name: string;
  color: string;
  teamId: string | null;
}

interface Team {
  id: string;
  name: string;
  icon: string | null;
}

interface SidebarProps {
  user: User;
}

const COLORS = [
  "#2f5cff",
  "#0d8f80",
  "#0f7a52",
  "#a6620a",
  "#bf2434",
  "#6d4be0",
  "#6c7484",
];

// ── Sub-components ─────────────────────────────────────────────────────────────

function NavItem({
  href,
  icon,
  label,
  badge,
  exact,
}: {
  href: string;
  icon: string;
  label: string;
  badge?: number;
  exact?: boolean;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "9px",
        padding: "6px 10px",
        borderRadius: "6px",
        color: active ? "white" : "var(--sidebar-text, rgba(193,196,207,0.9))",
        background: active ? "var(--accent)" : "transparent",
        textDecoration: "none",
        fontSize: "13.5px",
        fontWeight: active ? 500 : 400,
        transition: "background 0.1s",
        userSelect: "none",
      }}
      onMouseEnter={(e) => {
        if (!active)
          (e.currentTarget as HTMLAnchorElement).style.background =
            "rgba(255,255,255,0.08)";
      }}
      onMouseLeave={(e) => {
        if (!active)
          (e.currentTarget as HTMLAnchorElement).style.background = "transparent";
      }}
    >
      <span style={{ fontSize: "14px", width: "17px", textAlign: "center", flexShrink: 0 }}>
        {icon}
      </span>
      <span style={{ flex: 1 }}>{label}</span>
      {badge !== undefined && badge > 0 && (
        <span
          style={{
            background: "var(--accent)",
            color: "white",
            borderRadius: "10px",
            padding: "0 6px",
            fontSize: "10px",
            fontWeight: 600,
            minWidth: "16px",
            textAlign: "center",
          }}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );
}

function ProjectLink({ project }: { project: Project }) {
  const pathname = usePathname();
  const active = pathname.startsWith(`/projects/${project.id}`);
  return (
    <Link
      href={`/projects/${project.id}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "5px 10px 5px 18px",
        borderRadius: "6px",
        color: active ? "white" : "var(--sidebar-text, rgba(193,196,207,0.85))",
        background: active ? "rgba(79,70,229,0.3)" : "transparent",
        textDecoration: "none",
        fontSize: "13px",
        fontWeight: active ? 500 : 400,
        transition: "background 0.1s",
      }}
      onMouseEnter={(e) => {
        if (!active)
          (e.currentTarget as HTMLAnchorElement).style.background =
            "rgba(255,255,255,0.07)";
      }}
      onMouseLeave={(e) => {
        if (!active)
          (e.currentTarget as HTMLAnchorElement).style.background = "transparent";
      }}
    >
      <span
        style={{
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          background: project.color,
          flexShrink: 0,
        }}
      />
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          flex: 1,
        }}
      >
        {project.name}
      </span>
    </Link>
  );
}

// ── NewProjectModal ────────────────────────────────────────────────────────────

function NewProjectModal({
  teamId,
  onClose,
  onCreated,
}: {
  teamId?: string;
  onClose: () => void;
  onCreated: (p: Project) => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#2f5cff");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    const res = await fetch("/api/pm/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), color, teamId }),
    });
    const data = await res.json() as { project: Project };
    if (data.project) onCreated(data.project);
    setLoading(false);
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
        zIndex: 2000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          borderRadius: "12px",
          padding: "24px",
          width: "360px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          style={{
            fontSize: "15px",
            fontWeight: 600,
            marginBottom: "16px",
            color: "var(--text-primary)",
          }}
        >
          New Project
        </h2>
        <form onSubmit={submit}>
          <div style={{ marginBottom: "14px" }}>
            <label
              style={{
                fontSize: "11px",
                fontWeight: 600,
                color: "var(--text-muted)",
                display: "block",
                marginBottom: "5px",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              Project name
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Q4 Launch"
              style={{
                width: "100%",
                padding: "8px 10px",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                fontSize: "13px",
                background: "var(--bg)",
                color: "var(--text-primary)",
                outline: "none",
              }}
            />
          </div>
          <div style={{ marginBottom: "18px" }}>
            <label
              style={{
                fontSize: "11px",
                fontWeight: 600,
                color: "var(--text-muted)",
                display: "block",
                marginBottom: "5px",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              Color
            </label>
            <div style={{ display: "flex", gap: "6px" }}>
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  style={{
                    width: "22px",
                    height: "22px",
                    borderRadius: "50%",
                    background: c,
                    border:
                      c === color
                        ? "2px solid var(--text-primary)"
                        : "2px solid transparent",
                    cursor: "pointer",
                    outline: "none",
                    flexShrink: 0,
                  }}
                />
              ))}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              gap: "8px",
              justifyContent: "flex-end",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "7px 14px",
                borderRadius: "6px",
                border: "1px solid var(--border)",
                background: "transparent",
                color: "var(--text-secondary)",
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              style={{
                padding: "7px 14px",
                borderRadius: "6px",
                border: "none",
                background: "var(--accent)",
                color: "white",
                fontSize: "13px",
                fontWeight: 500,
                cursor: "pointer",
                opacity: loading || !name.trim() ? 0.6 : 1,
              }}
            >
              {loading ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── NewTeamModal ───────────────────────────────────────────────────────────────

function NewTeamModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (t: Team) => void;
}) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    const res = await fetch("/api/pm/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    const data = await res.json() as { team: Team };
    if (data.team) onCreated(data.team);
    setLoading(false);
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
        zIndex: 2000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          borderRadius: "12px",
          padding: "24px",
          width: "340px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          style={{
            fontSize: "15px",
            fontWeight: 600,
            marginBottom: "16px",
            color: "var(--text-primary)",
          }}
        >
          New Workspace
        </h2>
        <form onSubmit={submit}>
          <div style={{ marginBottom: "18px" }}>
            <label
              style={{
                fontSize: "11px",
                fontWeight: 600,
                color: "var(--text-muted)",
                display: "block",
                marginBottom: "5px",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              Workspace name
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Engineering, Marketing"
              style={{
                width: "100%",
                padding: "8px 10px",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                fontSize: "13px",
                background: "var(--bg)",
                color: "var(--text-primary)",
                outline: "none",
              }}
            />
          </div>
          <div
            style={{
              display: "flex",
              gap: "8px",
              justifyContent: "flex-end",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "7px 14px",
                borderRadius: "6px",
                border: "1px solid var(--border)",
                background: "transparent",
                color: "var(--text-secondary)",
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              style={{
                padding: "7px 14px",
                borderRadius: "6px",
                border: "none",
                background: "var(--accent)",
                color: "white",
                fontSize: "13px",
                fontWeight: 500,
                cursor: "pointer",
                opacity: loading || !name.trim() ? 0.6 : 1,
              }}
            >
              {loading ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── WorkspaceSection ───────────────────────────────────────────────────────────

function WorkspaceSection({
  team,
  projects,
  onAddProject,
}: {
  team: Team;
  projects: Project[];
  onAddProject: (teamId: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div style={{ marginTop: "4px" }}>
      {/* Section header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "4px 8px",
          gap: "4px",
        }}
      >
        <button
          onClick={() => setCollapsed((c) => !c)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "2px 4px",
            color: "rgba(255,255,255,0.35)",
            fontSize: "10px",
            transition: "transform 0.1s",
            transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
            flexShrink: 0,
          }}
        >
          ▾
        </button>
        <Link
          href="/workspaces"
          style={{
            flex: 1,
            fontSize: "11px",
            fontWeight: 600,
            color: "rgba(255,255,255,0.4)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            textDecoration: "none",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={team.name}
        >
          {team.name}
        </Link>
        <button
          onClick={() => onAddProject(team.id)}
          title="Add project to workspace"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "rgba(255,255,255,0.35)",
            fontSize: "16px",
            lineHeight: 1,
            padding: "0 2px",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color =
              "rgba(255,255,255,0.7)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color =
              "rgba(255,255,255,0.35)";
          }}
        >
          +
        </button>
      </div>

      {/* Projects */}
      {!collapsed && (
        <div>
          {projects.map((p) => (
            <ProjectLink key={p.id} project={p} />
          ))}
          {projects.length === 0 && (
            <div
              style={{
                padding: "4px 18px",
                fontSize: "12px",
                color: "var(--text-muted)",
                fontStyle: "italic",
              }}
            >
              No projects
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sidebar ────────────────────────────────────────────────────────────────────

export function Sidebar({ user }: SidebarProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [newProjectTeamId, setNewProjectTeamId] = useState<
    string | undefined
  >(undefined);
  const [showNewProject, setShowNewProject] = useState(false);
  const [showNewTeam, setShowNewTeam] = useState(false);

  const loadData = useCallback(() => {
    fetch("/api/pm/projects")
      .then((r) => r.json())
      .then((d: { projects: Project[] }) => setProjects(d.projects ?? []));

    fetch("/api/pm/teams")
      .then((r) => r.json())
      .then((d: { teams: Team[] }) => setTeams(d.teams ?? []));

    fetch("/api/pm/notifications")
      .then((r) => r.json())
      .then((d: { notifications: Array<{ isRead: boolean }> }) => {
        const unread = (d.notifications ?? []).filter((n) => !n.isRead).length;
        setUnreadCount(unread);
      });
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAddProject = (teamId: string) => {
    setNewProjectTeamId(teamId);
    setShowNewProject(true);
  };

  const handleProjectCreated = (p: Project) => {
    setProjects((prev) => [...prev, p]);
    setShowNewProject(false);
    setNewProjectTeamId(undefined);
  };

  const handleTeamCreated = (t: Team) => {
    setTeams((prev) => [...prev, t]);
    setShowNewTeam(false);
  };

  // Group projects by teamId
  const projectsByTeam: Record<string, Project[]> = {};
  const noTeamProjects: Project[] = [];

  for (const p of projects) {
    if (p.teamId) {
      if (!projectsByTeam[p.teamId]) projectsByTeam[p.teamId] = [];
      projectsByTeam[p.teamId]!.push(p);
    } else {
      noTeamProjects.push(p);
    }
  }

  return (
    <aside
      style={{
        width: "220px",
        flexShrink: 0,
        background: "var(--sidebar-bg, #1e1f2e)",
        borderRight: "1px solid rgba(255,255,255,0.06)",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflowY: "auto",
        overflowX: "hidden",
        color: "var(--sidebar-text, #c1c4cf)",
      }}
    >
      {/* Logo + Workspace switcher */}
      <div
        style={{
          padding: "14px 12px 12px",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <span
          style={{
            fontWeight: 700,
            color: "white",
            fontSize: "14px",
            flex: 1,
            letterSpacing: "-0.2px",
          }}
        >
          ViBe PM
        </span>
      </div>

      {/* Primary navigation */}
      <nav style={{ padding: "6px 8px" }}>
        <NavItem href="/home" icon="⌂" label="Home" exact />
        <NavItem href="/inbox" icon="◻" label="Inbox" badge={unreadCount} />
        <NavItem href="/my-tasks" icon="✓" label="My Tasks" />
        <NavItem href="/projects" icon="◈" label="Projects" exact />
        <NavItem href="/portfolios" icon="▦" label="Portfolios" />
      </nav>

      {/* Divider */}
      <div
        style={{
          height: "1px",
          background: "rgba(255,255,255,0.07)",
          margin: "2px 8px 4px",
        }}
      />

      {/* Workspaces sections */}
      <div style={{ padding: "0 4px", flex: 1 }}>
        {/* Workspace header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "6px 8px 2px",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{
              fontSize: "10px",
              fontWeight: 700,
              color: "rgba(255,255,255,0.35)",
              textTransform: "uppercase",
              letterSpacing: "0.07em",
            }}
          >
            Workspaces
          </span>
          <button
            onClick={() => setShowNewTeam(true)}
            title="New workspace"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "rgba(255,255,255,0.35)",
              fontSize: "16px",
              lineHeight: 1,
              padding: "0 2px",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color =
                "rgba(255,255,255,0.7)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color =
                "rgba(255,255,255,0.35)";
            }}
          >
            +
          </button>
        </div>

        {/* Each team's section */}
        {teams.map((team) => (
          <WorkspaceSection
            key={team.id}
            team={team}
            projects={projectsByTeam[team.id] ?? []}
            onAddProject={handleAddProject}
          />
        ))}

        {/* Projects without a workspace */}
        {noTeamProjects.length > 0 && (
          <div style={{ marginTop: "8px" }}>
            <div
              style={{
                padding: "2px 12px",
                fontSize: "11px",
                fontWeight: 600,
                color: "rgba(255,255,255,0.35)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Other projects
            </div>
            {noTeamProjects.map((p) => (
              <ProjectLink key={p.id} project={p} />
            ))}
          </div>
        )}

        {/* Add project (no team context) */}
        <button
          onClick={() => {
            setNewProjectTeamId(undefined);
            setShowNewProject(true);
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "5px 10px",
            marginTop: "4px",
            width: "100%",
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "rgba(255,255,255,0.35)",
            fontSize: "12.5px",
            borderRadius: "6px",
            textAlign: "left",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background =
              "rgba(255,255,255,0.07)";
            (e.currentTarget as HTMLButtonElement).style.color =
              "rgba(255,255,255,0.7)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "none";
            (e.currentTarget as HTMLButtonElement).style.color =
              "rgba(255,255,255,0.35)";
          }}
        >
          <span style={{ fontSize: "14px" }}>+</span>
          Add project
        </button>
      </div>

      {/* User footer */}
      <div
        style={{
          padding: "10px 12px",
          borderTop: "1px solid rgba(255,255,255,0.07)",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <div
          style={{
            width: "26px",
            height: "26px",
            borderRadius: "50%",
            background: "var(--accent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "11px",
            fontWeight: 600,
            color: "white",
            flexShrink: 0,
          }}
        >
          {user.name.charAt(0).toUpperCase()}
        </div>
        <div style={{ overflow: "hidden", flex: 1 }}>
          <div
            style={{
              fontSize: "12.5px",
              fontWeight: 500,
              color: "white",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {user.name}
          </div>
          <div
            style={{
              fontSize: "11px",
              color: "rgba(255,255,255,0.45)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {user.email}
          </div>
        </div>
      </div>

      {/* Modals */}
      {showNewProject && (
        <NewProjectModal
          teamId={newProjectTeamId}
          onClose={() => {
            setShowNewProject(false);
            setNewProjectTeamId(undefined);
          }}
          onCreated={handleProjectCreated}
        />
      )}
      {showNewTeam && (
        <NewTeamModal
          onClose={() => setShowNewTeam(false)}
          onCreated={handleTeamCreated}
        />
      )}
    </aside>
  );
}
