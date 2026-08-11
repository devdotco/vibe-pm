"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface Project {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  status: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === "active"
      ? "#0f7a52"
      : status === "on_hold"
      ? "#a6620a"
      : status === "completed"
      ? "#6c7484"
      : "#6c7484";
  return (
    <span
      style={{
        fontSize: "10px",
        fontWeight: 500,
        padding: "2px 7px",
        borderRadius: "10px",
        background: `${color}22`,
        color,
        border: `1px solid ${color}44`,
        textTransform: "capitalize",
      }}
    >
      {status.replace("_", " ")}
    </span>
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

  const colors = [
    "#2f5cff",
    "#0d8f80",
    "#0f7a52",
    "#a6620a",
    "#bf2434",
    "#6d4be0",
    "#6c7484",
  ];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    const res = await fetch("/api/pm/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), color }),
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
        <h2
          style={{
            fontSize: "16px",
            fontWeight: 600,
            marginBottom: "20px",
            color: "var(--text-primary)",
          }}
        >
          New Project
        </h2>
        <form onSubmit={submit}>
          <div style={{ marginBottom: "16px" }}>
            <label
              style={{
                fontSize: "12px",
                color: "var(--text-muted)",
                display: "block",
                marginBottom: "6px",
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
            <label
              style={{
                fontSize: "12px",
                color: "var(--text-muted)",
                display: "block",
                marginBottom: "6px",
              }}
            >
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
                    border:
                      c === color
                        ? "2px solid var(--text-primary)"
                        : "2px solid transparent",
                    cursor: "pointer",
                    outline: "none",
                  }}
                />
              ))}
            </div>
          </div>
          <div
            style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}
          >
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

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewProject, setShowNewProject] = useState(false);
  const [filter, setFilter] = useState<"all" | "active" | "completed">("all");

  useEffect(() => {
    fetch("/api/pm/preferences")
      .then((r) => r.json())
      .then((d: { preferences?: { hideCompletedProjects?: boolean } }) => {
        const hide = d.preferences?.hideCompletedProjects ?? false;
        if (hide) setFilter("active");
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/pm/projects")
      .then((r) => {
        if (r.status === 401) { window.location.href = '/sign-in'; return null; }
        return r.json();
      })
      .then((d: { projects: Project[] } | null) => {
        if (!d) return;
        setProjects(d.projects ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered =
    filter === "all"
      ? projects
      : projects.filter((p) =>
          filter === "completed"
            ? p.status === "completed"
            : p.status === "active"
        );

  return (
    <div style={{ padding: "32px 28px", maxWidth: "1100px", margin: "0 auto" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "24px",
        }}
      >
        <h1
          style={{
            fontSize: "22px",
            fontWeight: 700,
            color: "var(--text-primary)",
          }}
        >
          Projects
        </h1>
        <button
          onClick={() => setShowNewProject(true)}
          style={{
            padding: "8px 16px",
            background: "var(--accent)",
            color: "white",
            borderRadius: "6px",
            fontSize: "13px",
            fontWeight: 500,
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <span style={{ fontSize: "16px", lineHeight: 1 }}>+</span>
          New Project
        </button>
      </div>

      {/* Filter tabs */}
      <div
        style={{
          display: "flex",
          gap: "4px",
          marginBottom: "20px",
          borderBottom: "1px solid var(--border)",
          paddingBottom: "0",
        }}
      >
        {(["all", "active", "completed"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: "6px 14px",
              fontSize: "13px",
              background: "none",
              border: "none",
              cursor: "pointer",
              color:
                filter === f ? "var(--accent)" : "var(--text-muted)",
              borderBottom:
                filter === f
                  ? "2px solid var(--accent)"
                  : "2px solid transparent",
              marginBottom: "-1px",
              textTransform: "capitalize",
              fontWeight: filter === f ? 500 : 400,
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Projects grid */}
      {loading ? (
        <div style={{ color: "var(--text-muted)", padding: "32px" }}>
          Loading...
        </div>
      ) : filtered.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "60px 20px",
            color: "var(--text-muted)",
          }}
        >
          <div style={{ fontSize: "40px", marginBottom: "12px" }}>📋</div>
          <div style={{ fontSize: "16px", fontWeight: 500, marginBottom: "8px", color: "var(--text-primary)" }}>
            No projects yet
          </div>
          <div style={{ fontSize: "13px" }}>
            Create your first project to get started.
          </div>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: "14px",
          }}
        >
          {filtered.map((project) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                padding: "16px",
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                borderRadius: "10px",
                textDecoration: "none",
                transition: "border-color 0.1s, box-shadow 0.1s",
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLAnchorElement;
                el.style.borderColor = "var(--accent)";
                el.style.boxShadow = "0 2px 8px rgba(47,92,255,0.08)";
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLAnchorElement;
                el.style.borderColor = "var(--border)";
                el.style.boxShadow = "none";
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "8px",
                    background: project.color,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "16px",
                    color: "white",
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {project.icon ?? project.name.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, overflow: "hidden" }}>
                  <div
                    style={{
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {project.name}
                  </div>
                </div>
                <StatusBadge status={project.status} />
              </div>
              {project.description && (
                <div
                  style={{
                    fontSize: "12px",
                    color: "var(--text-muted)",
                    overflow: "hidden",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    lineHeight: "1.5",
                  }}
                >
                  {project.description}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}

      {showNewProject && (
        <NewProjectModal
          onClose={() => setShowNewProject(false)}
          onCreated={(p) => {
            setProjects((prev) => [p, ...prev]);
            setShowNewProject(false);
          }}
        />
      )}
    </div>
  );
}
