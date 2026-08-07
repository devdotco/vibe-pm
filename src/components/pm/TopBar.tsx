"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import type { User } from "@/lib/db/schema";

interface TopBarProps {
  user: User;
}

export function TopBar({ user }: TopBarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [showNewTask, setShowNewTask] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowSearch(true);
        setTimeout(() => searchRef.current?.focus(), 50);
      }
      if (e.key === "Escape") setShowSearch(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) {
      router.push(`/search?q=${encodeURIComponent(search.trim())}`);
      setShowSearch(false);
      setSearch("");
    }
  };

  const title = getPageTitle(pathname);

  return (
    <header
      style={{
        height: "56px",
        background: "var(--bg-elevated)",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        padding: "0 20px",
        gap: "12px",
        flexShrink: 0,
      }}
    >
      <h1
        style={{
          fontSize: "16px",
          fontWeight: 600,
          color: "var(--text-primary)",
          flex: 1,
        }}
      >
        {title}
      </h1>

      {/* Search trigger */}
      <button
        onClick={() => { setShowSearch(true); setTimeout(() => searchRef.current?.focus(), 50); }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "6px 12px",
          border: "1px solid var(--border)",
          borderRadius: "6px",
          background: "var(--bg)",
          color: "var(--text-muted)",
          fontSize: "13px",
          cursor: "pointer",
          minWidth: "180px",
        }}
      >
        <span>🔍</span>
        <span>Search</span>
        <span
          style={{
            marginLeft: "auto",
            fontSize: "11px",
            background: "var(--panel-hover)",
            padding: "1px 5px",
            borderRadius: "4px",
            border: "1px solid var(--border)",
          }}
        >
          ⌘K
        </span>
      </button>

      {/* New task quick button */}
      <button
        onClick={() => setShowNewTask(true)}
        style={{
          padding: "7px 14px",
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
        New Task
      </button>

      {showNewTask && (
        <NewTaskModal onClose={() => setShowNewTask(false)} onCreated={(projectId) => {
          setShowNewTask(false);
          router.push(`/projects/${projectId}`);
          router.refresh();
        }} />
      )}

      {/* Search modal */}
      {showSearch && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            paddingTop: "120px",
            zIndex: 1000,
          }}
          onClick={() => setShowSearch(false)}
        >
          <div
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: "12px",
              width: "520px",
              overflow: "hidden",
              boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <form onSubmit={handleSearch}>
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tasks, projects, comments..."
                style={{
                  width: "100%",
                  padding: "16px 20px",
                  border: "none",
                  borderBottom: "1px solid var(--border)",
                  fontSize: "16px",
                  background: "transparent",
                  color: "var(--text-primary)",
                  outline: "none",
                }}
              />
            </form>
            <div style={{ padding: "8px 0" }}>
              <div style={{ padding: "8px 20px", fontSize: "12px", color: "var(--text-muted)" }}>
                Press Enter to search · Esc to close
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

function NewTaskModal({ onClose, onCreated }: { onClose: () => void; onCreated: (projectId: string) => void }) {
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState("");
  const [priority, setPriority] = useState("medium");
  const [projects, setProjects] = useState<{ id: string; name: string; color: string }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/pm/projects").then(r => r.json()).then(d => {
      const ps = d.projects ?? [];
      setProjects(ps);
      if (ps.length > 0) setProjectId(ps[0].id);
    });
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !projectId) return;
    setLoading(true);
    await fetch("/api/pm/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), projectId, priority }),
    });
    setLoading(false);
    onCreated(projectId);
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 12px", border: "1px solid var(--border)",
    borderRadius: "6px", fontSize: "14px", background: "var(--bg)",
    color: "var(--text-primary)", outline: "none", boxSizing: "border-box",
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={onClose}>
      <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "12px", padding: "24px", width: "420px", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }} onClick={e => e.stopPropagation()}>
        <h2 style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "20px" }}>New Task</h2>
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: "6px", textTransform: "uppercase" }}>Task name</label>
            <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Write release notes" style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: "6px", textTransform: "uppercase" }}>Project</label>
            <select value={projectId} onChange={e => setProjectId(e.target.value)} style={inputStyle}>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: "6px", textTransform: "uppercase" }}>Priority</label>
            <select value={priority} onChange={e => setPriority(e.target.value)} style={inputStyle}>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "4px" }}>
            <button type="button" onClick={onClose} style={{ padding: "8px 16px", borderRadius: "6px", border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", fontSize: "14px", cursor: "pointer" }}>Cancel</button>
            <button type="submit" disabled={loading || !title.trim() || !projectId} style={{ padding: "8px 16px", borderRadius: "6px", border: "none", background: "var(--accent)", color: "white", fontSize: "14px", fontWeight: 500, cursor: "pointer", opacity: loading || !title.trim() || !projectId ? 0.6 : 1 }}>
              {loading ? "Creating..." : "Create Task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function getPageTitle(pathname: string): string {
  if (pathname === "/home") return "Home";
  if (pathname === "/my-tasks") return "My Tasks";
  if (pathname === "/inbox") return "Inbox";
  if (pathname === "/goals") return "Goals";
  if (pathname === "/portfolios") return "Portfolios";
  if (pathname === "/projects") return "Projects";
  if (pathname === "/workspaces") return "Workspaces";
  if (pathname.startsWith("/search")) return "Search";
  if (pathname.startsWith("/projects/")) {
    const parts = pathname.split("/");
    if (parts.length === 3) return "Project";
    if (parts[3] === "stats") return "Project Stats";
    if (parts[3] === "settings") return "Project Settings";
    if (parts[3] === "milestones") return "Milestones";
  }
  return "ViBe PM";
}
