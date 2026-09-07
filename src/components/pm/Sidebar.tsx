"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useCallback, useRef } from "react";
import {
  Home,
  Inbox,
  CheckSquare,
  FolderKanban,
  LayoutGrid,
  Users,
  Settings,
  LogOut,
  ChevronDown,
  ChevronUp,
  Plus,
  X,
} from "lucide-react";
import type { User } from "@/lib/db/schema";
import { ModuleSidebar, AppRail, buildRailItems } from "@erp-ui";
import type { ErpBrand } from "@erp-ui";
import { ERP_MODULE_ICONS } from "@erp-ui/icons";
import { withBase } from "@/lib/base-path";
import { apiFetch } from "@/lib/base-path";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SavedUserPreferences {
  hiddenSections: string[];
  hideCompletedProjects: boolean;
}

const DEFAULT_SECTION_NAMES = ["Backlog", "To Do", "In Progress", "In Review", "Done"];
const DEFAULT_PREFS: SavedUserPreferences = { hiddenSections: [], hideCompletedProjects: false };

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
  "#2563eb",
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
  icon: React.ReactNode;
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
      <span style={{ width: "17px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
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
        background: active ? "rgba(47,92,255,0.3)" : "transparent",
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
  const [color, setColor] = useState("#2563eb");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    const res = await apiFetch("/api/pm/projects", {
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
    const res = await apiFetch("/api/pm/teams", {
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
            display: "flex",
            alignItems: "center",
            transition: "transform 0.1s",
            transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
            flexShrink: 0,
          }}
        >
          <ChevronDown size={12} />
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
            display: "flex",
            alignItems: "center",
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
          <Plus size={14} />
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

// ── GlobalSettingsModal ────────────────────────────────────────────────────────

function GlobalSettingsModal({ onClose }: { onClose: () => void }) {
  const [prefs, setPrefs] = useState<SavedUserPreferences>(DEFAULT_PREFS);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiFetch("/api/pm/preferences")
      .then((r) => r.json())
      .then((d: { preferences: SavedUserPreferences }) => {
        if (d.preferences) setPrefs({ ...DEFAULT_PREFS, ...d.preferences });
      });
  }, []);

  const toggleSection = (name: string) => {
    setPrefs((p) => ({
      ...p,
      hiddenSections: p.hiddenSections.includes(name)
        ? p.hiddenSections.filter((s) => s !== name)
        : [...p.hiddenSections, name],
    }));
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    await apiFetch("/api/pm/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(prefs),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const labelStyle: React.CSSProperties = {
    fontSize: "11px",
    fontWeight: 600,
    color: "var(--text-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginBottom: "10px",
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 3000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          borderRadius: "12px",
          width: "460px",
          maxHeight: "80vh",
          overflowY: "auto",
          boxShadow: "0 24px 64px rgba(0,0,0,0.25)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 24px 16px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <h2 style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
            View Preferences
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-muted)",
              padding: "2px",
              display: "flex",
              alignItems: "center",
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px 24px" }}>
          {/* Section visibility */}
          <div style={{ marginBottom: "24px" }}>
            <div style={labelStyle}>Default section visibility</div>
            <p style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "12px", marginTop: 0 }}>
              Sections checked below will be hidden by default across all project views. You can always override per-project using the Filter button.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {DEFAULT_SECTION_NAMES.map((name) => {
                const hidden = prefs.hiddenSections.includes(name);
                return (
                  <label
                    key={name}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      cursor: "pointer",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      border: `1px solid ${hidden ? "var(--accent)" : "var(--border)"}`,
                      background: hidden ? "var(--accent-subtle, rgba(47,92,255,0.06))" : "transparent",
                      transition: "all 0.1s",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={hidden}
                      onChange={() => toggleSection(name)}
                      style={{ accentColor: "var(--accent)", width: "14px", height: "14px", cursor: "pointer" }}
                    />
                    <span style={{ fontSize: "13px", color: "var(--text-primary)", flex: 1 }}>{name}</span>
                    {hidden && (
                      <span style={{ fontSize: "10px", color: "var(--accent)", fontWeight: 600 }}>HIDDEN</span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>

          {/* Hide completed projects */}
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: "20px" }}>
            <div style={labelStyle}>Projects view</div>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                cursor: "pointer",
                padding: "10px 12px",
                borderRadius: "6px",
                border: `1px solid ${prefs.hideCompletedProjects ? "var(--accent)" : "var(--border)"}`,
                background: prefs.hideCompletedProjects ? "var(--accent-subtle, rgba(47,92,255,0.06))" : "transparent",
              }}
            >
              <input
                type="checkbox"
                checked={prefs.hideCompletedProjects}
                onChange={() => { setPrefs((p) => ({ ...p, hideCompletedProjects: !p.hideCompletedProjects })); setSaved(false); }}
                style={{ accentColor: "var(--accent)", width: "14px", height: "14px", cursor: "pointer" }}
              />
              <div>
                <div style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 500 }}>Hide completed projects</div>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                  Completed projects won&apos;t appear in your Projects list by default
                </div>
              </div>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: "10px",
          }}
        >
          {saved && (
            <span style={{ fontSize: "12px", color: "#0f7a52", fontWeight: 500 }}>Saved!</span>
          )}
          <button
            onClick={onClose}
            style={{
              padding: "7px 16px",
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
            onClick={save}
            disabled={saving}
            style={{
              padding: "7px 16px",
              borderRadius: "6px",
              border: "none",
              background: "var(--accent)",
              color: "white",
              fontSize: "13px",
              fontWeight: 500,
              cursor: "pointer",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "Saving…" : "Save preferences"}
          </button>
        </div>
      </div>
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
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const loadData = useCallback(() => {
    apiFetch("/api/pm/projects")
      .then((r) => r.json())
      .then((d: { projects: Project[] }) => setProjects(d.projects ?? []));

    apiFetch("/api/pm/teams")
      .then((r) => r.json())
      .then((d: { teams: Team[] }) => setTeams(d.teams ?? []));

    apiFetch("/api/pm/notifications")
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
    <>
      <ModuleSidebar
        moduleLabel="Projects"
        moduleIcon={ERP_MODULE_ICONS.pm}
        moduleHref="/home"
        sections={[
          {
            items: [
              { label: "Home", href: "/home", icon: Home, exact: true },
              { label: "Inbox", href: "/inbox", icon: Inbox, badge: unreadCount },
              { label: "My Tasks", href: "/my-tasks", icon: CheckSquare },
              { label: "Projects", href: "/projects", icon: FolderKanban, exact: true },
              { label: "Portfolios", href: "/portfolios", icon: LayoutGrid },
              { label: "Members", href: "/admin/users", icon: Users },
            ],
          },
        ]}
        user={{ name: user.name, email: user.email }}
        settingsHref="/admin/users"
        /*
         * A real sign-out. "Log out" here was an <a href={withBase("/sign-in")}> — it
         * navigated to the sign-in page and left the session cookie standing,
         * so the next click put you straight back in. The route below clears
         * the cookie at the mount path first.
         */
        signOutAction={withBase("/api/auth/sign-out")}
        /* The workspace and project tree — genuinely Projects', and the reason
           this module keeps a slot rather than a declared nav. */
        scrollExtra={
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <p className="erp-nav-section-label" style={{ marginBottom: 0 }}>
                Workspaces
              </p>
              <button
                onClick={() => setShowNewTeam(true)}
                title="New workspace"
                aria-label="New workspace"
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--erp-sidebar-text-muted)",
                  display: "flex",
                  alignItems: "center",
                  padding: "0 8px 0 2px",
                }}
              >
                <Plus size={14} />
              </button>
            </div>

            {teams.map((team) => (
              <WorkspaceSection
                key={team.id}
                team={team}
                projects={projectsByTeam[team.id] ?? []}
                onAddProject={handleAddProject}
              />
            ))}

            {noTeamProjects.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <p className="erp-nav-section-label">Other projects</p>
                {noTeamProjects.map((p) => (
                  <ProjectLink key={p.id} project={p} />
                ))}
              </div>
            )}

            <button
              type="button"
              className="erp-nav-row"
              style={{ color: "var(--erp-sidebar-text-muted)", marginTop: 4 }}
              onClick={() => {
                setNewProjectTeamId(undefined);
                setShowNewProject(true);
              }}
            >
              <Plus size={15} className="erp-nav-icon" />
              <span className="erp-nav-label">Add project</span>
            </button>
          </div>
        }
      />

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
      {showSettings && (
        <GlobalSettingsModal onClose={() => setShowSettings(false)} />
      )}
    </>
  );
}


/**
 * The suite rail for Projects.
 *
 * Built here rather than in the layout, and it must stay that way: the layout
 * is a server component and `buildRailItems()` returns items whose `icon` is a
 * React component. Handing a function across that boundary compiles, typechecks
 * and builds, then throws on every request.
 */
export function PmRail({ modules, brand }: { modules?: string[] | null; brand?: ErpBrand | null }) {
  return (
    <AppRail
      items={buildRailItems({ enabled: modules ?? undefined })}
      activeKey="pm"
      brand={brand}
    />
  );
}
