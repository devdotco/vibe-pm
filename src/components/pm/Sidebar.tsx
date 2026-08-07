"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { User } from "@/lib/db/schema";

interface Project {
  id: string;
  name: string;
  color: string;
}

interface SidebarProps {
  user: User;
}

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const [projects, setProjects] = useState<Project[]>([]);
  const [showNewProject, setShowNewProject] = useState(false);

  useEffect(() => {
    fetch("/api/pm/projects")
      .then((r) => r.json())
      .then((d) => setProjects(d.projects ?? []));
  }, []);

  const navItem = (href: string, icon: string, label: string) => {
    const active = pathname === href || pathname.startsWith(href + "/");
    return (
      <Link
        key={href}
        href={href}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: "6px 12px",
          borderRadius: "6px",
          color: active ? "var(--accent)" : "var(--text-secondary)",
          background: active ? "var(--sidebar-active)" : "transparent",
          textDecoration: "none",
          fontSize: "14px",
          fontWeight: active ? 500 : 400,
          transition: "background 0.1s",
        }}
        onMouseEnter={(e) => {
          if (!active) (e.currentTarget as HTMLAnchorElement).style.background = "var(--panel-hover)";
        }}
        onMouseLeave={(e) => {
          if (!active) (e.currentTarget as HTMLAnchorElement).style.background = "transparent";
        }}
      >
        <span style={{ fontSize: "15px", width: "18px", textAlign: "center" }}>{icon}</span>
        {label}
      </Link>
    );
  };

  return (
    <aside
      style={{
        width: "260px",
        flexShrink: 0,
        background: "var(--sidebar)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflowY: "auto",
      }}
    >
      {/* Logo */}
      <div
        style={{
          padding: "16px 16px 12px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <div
          style={{
            width: "28px",
            height: "28px",
            borderRadius: "6px",
            background: "var(--accent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            fontSize: "14px",
            fontWeight: 700,
          }}
        >
          V
        </div>
        <span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "15px" }}>
          ViBe PM
        </span>
      </div>

      {/* Nav */}
      <nav style={{ padding: "8px", flex: 1 }}>
        {navItem("/my-tasks", "✓", "My Tasks")}
        {navItem("/inbox", "🔔", "Inbox")}
        {navItem("/search", "🔍", "Search")}
        {navItem("/goals", "🎯", "Goals")}
        {navItem("/admin/users", "⚙️", "Admin")}

        {/* Projects */}
        <div
          style={{
            margin: "16px 0 4px",
            padding: "0 12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{
              fontSize: "11px",
              fontWeight: 600,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Projects
          </span>
          <button
            onClick={() => setShowNewProject(true)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-muted)",
              fontSize: "18px",
              lineHeight: 1,
              padding: "0 2px",
            }}
            title="New project"
          >
            +
          </button>
        </div>

        {projects.map((p) => {
          const active = pathname.startsWith(`/projects/${p.id}`);
          return (
            <Link
              key={p.id}
              href={`/projects/${p.id}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "6px 12px",
                borderRadius: "6px",
                color: active ? "var(--accent)" : "var(--text-secondary)",
                background: active ? "var(--sidebar-active)" : "transparent",
                textDecoration: "none",
                fontSize: "14px",
                fontWeight: active ? 500 : 400,
              }}
            >
              <span
                style={{
                  width: "10px",
                  height: "10px",
                  borderRadius: "50%",
                  background: p.color,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {p.name}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div
        style={{
          padding: "12px 16px",
          borderTop: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <div
          style={{
            width: "28px",
            height: "28px",
            borderRadius: "50%",
            background: "var(--accent-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "12px",
            fontWeight: 600,
            color: "var(--accent)",
            flexShrink: 0,
          }}
        >
          {user.name.charAt(0).toUpperCase()}
        </div>
        <div style={{ overflow: "hidden", flex: 1 }}>
          <div
            style={{
              fontSize: "13px",
              fontWeight: 500,
              color: "var(--text-primary)",
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
              color: "var(--text-muted)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {user.email}
          </div>
        </div>
      </div>

      {showNewProject && <NewProjectModal onClose={() => setShowNewProject(false)} onCreated={(p) => { setProjects((prev) => [...prev, p]); setShowNewProject(false); }} />}
    </aside>
  );
}

function NewProjectModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (p: Project) => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#2f5cff");
  const [loading, setLoading] = useState(false);

  const colors = ["#2f5cff", "#0d8f80", "#0f7a52", "#a6620a", "#bf2434", "#6d4be0", "#6c7484"];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    const res = await fetch("/api/pm/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), color }),
    });
    const data = await res.json();
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
          width: "360px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "20px", color: "var(--text-primary)" }}>
          New Project
        </h2>
        <form onSubmit={submit}>
          <div style={{ marginBottom: "16px" }}>
            <label style={{ fontSize: "12px", color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>
              Project name
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Q4 Launch"
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                fontSize: "14px",
                background: "var(--bg)",
                color: "var(--text-primary)",
                outline: "none",
              }}
            />
          </div>
          <div style={{ marginBottom: "20px" }}>
            <label style={{ fontSize: "12px", color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>
              Color
            </label>
            <div style={{ display: "flex", gap: "8px" }}>
              {colors.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  style={{
                    width: "24px",
                    height: "24px",
                    borderRadius: "50%",
                    background: c,
                    border: c === color ? "2px solid var(--text-primary)" : "2px solid transparent",
                    cursor: "pointer",
                    outline: "none",
                  }}
                />
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "8px 16px",
                borderRadius: "6px",
                border: "1px solid var(--border)",
                background: "transparent",
                color: "var(--text-secondary)",
                fontSize: "14px",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              style={{
                padding: "8px 16px",
                borderRadius: "6px",
                border: "none",
                background: "var(--accent)",
                color: "white",
                fontSize: "14px",
                fontWeight: 500,
                cursor: "pointer",
                opacity: loading || !name.trim() ? 0.6 : 1,
              }}
            >
              {loading ? "Creating..." : "Create project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
