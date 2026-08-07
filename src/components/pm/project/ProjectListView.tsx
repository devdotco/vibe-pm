"use client";
import { useState, useCallback } from "react";
import { PriorityDot } from "@/components/pm/PriorityBadge";
import { StatusDot } from "@/components/pm/StatusBadge";

interface Section { id: string; name: string; position: number; }
interface Task { id: string; title: string; status: string; priority: string; dueDate: string | null; assigneeId: string | null; sectionId: string | null; position: number; labels: string[]; completedAt: string | null; }

interface ProjectListViewProps {
  projectId: string;
  sections: Section[];
  tasks: Task[];
  setSections: (s: Section[]) => void;
  setTasks: (t: Task[]) => void;
  onTaskClick: (id: string) => void;
}

export function ProjectListView({ projectId, sections, tasks, setSections, setTasks, onTaskClick }: ProjectListViewProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [addingInSection, setAddingInSection] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");

  const sectionTasks = (sId: string) => tasks.filter(t => t.sectionId === sId && !t.completedAt);

  const addTask = async (sectionId: string) => {
    if (!newTaskTitle.trim()) { setAddingInSection(null); return; }
    const res = await fetch("/api/pm/tasks", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, sectionId, title: newTaskTitle.trim() }),
    });
    const d = await res.json();
    if (d.task) setTasks([...tasks, d.task]);
    setNewTaskTitle(""); setAddingInSection(null);
  };

  const toggleComplete = async (task: Task) => {
    if (task.status === "completed") {
      await fetch(`/api/pm/tasks/${task.id}/reopen`, { method: "POST" });
    } else {
      await fetch(`/api/pm/tasks/${task.id}/complete`, { method: "POST" });
    }
    setTasks(tasks.map(t => t.id === task.id ? { ...t, status: t.status === "completed" ? "not_started" : "completed", completedAt: t.status === "completed" ? null : new Date().toISOString() } : t));
  };

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "16px 24px" }}>
      {sections.map(section => {
        const stasks = sectionTasks(section.id);
        const isCollapsed = collapsed[section.id];
        return (
          <div key={section.id} style={{ marginBottom: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 4px" }}>
              <button onClick={() => setCollapsed(c => ({ ...c, [section.id]: !c[section.id] }))} style={{ background: "none", border: "none", cursor: "pointer", padding: "0 2px", color: "var(--text-muted)", fontSize: "12px" }}>
                {isCollapsed ? "▶" : "▾"}
              </button>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>{section.name}</span>
              <span style={{ fontSize: "11px", color: "var(--text-muted)", background: "var(--panel-hover)", padding: "1px 6px", borderRadius: "10px" }}>{stasks.length}</span>
            </div>
            {!isCollapsed && (
              <div style={{ background: "var(--bg-elevated)", borderRadius: "8px", border: "1px solid var(--border)", overflow: "hidden", marginLeft: "20px" }}>
                {/* Header row */}
                <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 120px 80px 80px", gap: "8px", padding: "6px 12px", borderBottom: "1px solid var(--border)", background: "var(--panel-hover)" }}>
                  <span style={{ width: "16px" }} />
                  <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Title</span>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Assignee</span>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Due</span>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Priority</span>
                </div>
                {stasks.map((task, i) => {
                  const done = task.status === "completed";
                  return (
                    <div key={task.id} style={{
                      display: "grid", gridTemplateColumns: "auto 1fr 120px 80px 80px", gap: "8px",
                      padding: "8px 12px", alignItems: "center", cursor: "pointer",
                      borderBottom: i < stasks.length - 1 ? "1px solid var(--border)" : "none",
                      opacity: done ? 0.5 : 1,
                    }}
                      onClick={() => onTaskClick(task.id)}
                    >
                      <input type="checkbox" checked={done} onChange={e => { e.stopPropagation(); toggleComplete(task); }}
                        style={{ width: "14px", height: "14px", accentColor: "var(--positive)", cursor: "pointer" }} onClick={e => e.stopPropagation()} />
                      <span style={{ fontSize: "14px", color: "var(--text-primary)", textDecoration: done ? "line-through" : "none" }}>
                        {task.title}
                        {task.labels?.length > 0 && task.labels.map(l => (
                          <span key={l} style={{ marginLeft: "6px", fontSize: "10px", padding: "1px 6px", borderRadius: "3px", background: "var(--accent-subtle)", color: "var(--accent)" }}>{l}</span>
                        ))}
                      </span>
                      <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{task.assigneeId ?? "—"}</span>
                      <span style={{ fontSize: "12px", color: task.dueDate && new Date(task.dueDate) < new Date() && !done ? "var(--negative)" : "var(--text-muted)" }}>
                        {task.dueDate ? new Date(task.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                      </span>
                      <PriorityDot priority={task.priority} />
                    </div>
                  );
                })}
                {/* Inline add */}
                {addingInSection === section.id ? (
                  <div style={{ padding: "6px 12px", display: "flex", gap: "8px", alignItems: "center", borderTop: stasks.length > 0 ? "1px solid var(--border)" : "none" }}>
                    <span style={{ width: "14px" }} />
                    <input autoFocus value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") addTask(section.id); if (e.key === "Escape") { setAddingInSection(null); setNewTaskTitle(""); } }}
                      placeholder="Task title... (Enter to add)"
                      style={{ flex: 1, padding: "4px 8px", border: "1px solid var(--accent)", borderRadius: "4px", fontSize: "13px", background: "var(--bg)", color: "var(--text-primary)", outline: "none" }} />
                    <button onClick={() => addTask(section.id)} style={{ padding: "4px 10px", background: "var(--accent)", color: "white", border: "none", borderRadius: "4px", fontSize: "12px", cursor: "pointer" }}>Add</button>
                    <button onClick={() => { setAddingInSection(null); setNewTaskTitle(""); }} style={{ padding: "4px 8px", background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "16px" }}>×</button>
                  </div>
                ) : (
                  <button onClick={() => setAddingInSection(section.id)} style={{
                    display: "flex", alignItems: "center", gap: "6px", width: "100%", padding: "8px 12px",
                    background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: "13px",
                    borderTop: stasks.length > 0 ? "1px solid var(--border)" : "none",
                  }}>
                    <span style={{ fontSize: "16px" }}>+</span> Add task
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
