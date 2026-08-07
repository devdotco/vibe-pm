"use client";
import { useState, useRef, useEffect } from "react";
import { PriorityDot } from "@/components/pm/PriorityBadge";

interface Section { id: string; name: string; position: number; color?: string | null; }
interface Assignee { id: string; name: string; email: string; }
interface Task {
  id: string; title: string; status: string; priority: string; dueDate: string | null;
  assigneeId: string | null; sectionId: string | null; position: number; labels: string[];
  completedAt: string | null; assignees?: Assignee[];
}

interface ProjectListViewProps {
  projectId: string;
  sections: Section[];
  tasks: Task[];
  setSections: (s: Section[]) => void;
  setTasks: (t: Task[]) => void;
  onTaskClick: (id: string) => void;
}

const SECTION_COLORS = [
  { label: "Default", value: null },
  { label: "Red", value: "#ef4444" },
  { label: "Orange", value: "#f97316" },
  { label: "Yellow", value: "#eab308" },
  { label: "Green", value: "#22c55e" },
  { label: "Blue", value: "#3b82f6" },
  { label: "Purple", value: "#a855f7" },
  { label: "Pink", value: "#ec4899" },
];

function avatarInitials(a: Assignee): string {
  const parts = (a.name || a.email).trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
  return (parts[0]![0] ?? "?").toUpperCase();
}

function hashColor(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  const colors = ["#4f46e5", "#0891b2", "#059669", "#d97706", "#7c3aed", "#db2777", "#0284c7", "#16a34a"];
  return colors[Math.abs(h) % colors.length]!;
}

function AssigneeStack({ assignees }: { assignees: Assignee[] }) {
  if (!assignees || assignees.length === 0) return <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>—</span>;
  const shown = assignees.slice(0, 3);
  const extra = assignees.length - shown.length;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "-4px" }}>
      {shown.map((a, i) => (
        <div key={a.id} title={a.name || a.email} style={{
          width: "22px", height: "22px", borderRadius: "50%",
          background: hashColor(a.id),
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "9px", fontWeight: 700, color: "#fff",
          border: "2px solid var(--bg-elevated)",
          marginLeft: i > 0 ? "-6px" : "0",
          position: "relative", zIndex: shown.length - i,
          flexShrink: 0,
        }}>
          {avatarInitials(a)}
        </div>
      ))}
      {extra > 0 && (
        <div style={{
          width: "22px", height: "22px", borderRadius: "50%",
          background: "var(--panel-hover)", border: "2px solid var(--bg-elevated)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "9px", fontWeight: 600, color: "var(--text-muted)",
          marginLeft: "-6px", flexShrink: 0,
        }}>
          +{extra}
        </div>
      )}
    </div>
  );
}

export function ProjectListView({ projectId, sections, tasks, setSections, setTasks, onTaskClick }: ProjectListViewProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [addingInSection, setAddingInSection] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  // Section management
  const [renamingSection, setRenamingSection] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [sectionMenu, setSectionMenu] = useState<string | null>(null);
  const [colorPicker, setColorPicker] = useState<string | null>(null);
  const [addingSection, setAddingSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setSectionMenu(null);
        setColorPicker(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

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
    setTasks(tasks.map(t => t.id === task.id ? {
      ...t,
      status: t.status === "completed" ? "not_started" : "completed",
      completedAt: t.status === "completed" ? null : new Date().toISOString(),
    } : t));
  };

  const startRename = (section: Section) => {
    setRenamingSection(section.id);
    setRenameValue(section.name);
    setSectionMenu(null);
  };

  const commitRename = async (sectionId: string) => {
    if (!renameValue.trim()) { setRenamingSection(null); return; }
    await fetch(`/api/pm/projects/${projectId}/sections/${sectionId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: renameValue.trim() }),
    });
    setSections(sections.map(s => s.id === sectionId ? { ...s, name: renameValue.trim() } : s));
    setRenamingSection(null);
  };

  const deleteSection = async (sectionId: string) => {
    if (!confirm("Delete this section? Tasks in this section will become unsectioned.")) return;
    await fetch(`/api/pm/projects/${projectId}/sections/${sectionId}`, { method: "DELETE" });
    setSections(sections.filter(s => s.id !== sectionId));
    setSectionMenu(null);
  };

  const updateSectionColor = async (sectionId: string, color: string | null) => {
    await fetch(`/api/pm/projects/${projectId}/sections/${sectionId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ color }),
    });
    setSections(sections.map(s => s.id === sectionId ? { ...s, color } : s));
    setColorPicker(null);
    setSectionMenu(null);
  };

  const addSection = async () => {
    if (!newSectionName.trim()) { setAddingSection(false); return; }
    const res = await fetch(`/api/pm/projects/${projectId}/sections`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newSectionName.trim() }),
    });
    const d = await res.json();
    if (d.section) setSections([...sections, d.section]);
    setNewSectionName(""); setAddingSection(false);
  };

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "16px 24px" }}>
      {sections.map(section => {
        const stasks = sectionTasks(section.id);
        const isCollapsed = collapsed[section.id];
        const isRenaming = renamingSection === section.id;
        const isMenuOpen = sectionMenu === section.id;
        const isColorOpen = colorPicker === section.id;
        const sectionDot = section.color;

        return (
          <div key={section.id} style={{ marginBottom: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 4px", position: "relative" }}>
              {/* Collapse toggle */}
              <button
                onClick={() => setCollapsed(c => ({ ...c, [section.id]: !c[section.id] }))}
                style={{ background: "none", border: "none", cursor: "pointer", padding: "0 2px", color: "var(--text-muted)", fontSize: "12px", flexShrink: 0 }}
              >
                {isCollapsed ? "▶" : "▾"}
              </button>

              {/* Color dot */}
              {sectionDot && (
                <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: sectionDot, flexShrink: 0 }} />
              )}

              {/* Section name / inline rename */}
              {isRenaming ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") commitRename(section.id);
                    if (e.key === "Escape") setRenamingSection(null);
                  }}
                  onBlur={() => commitRename(section.id)}
                  style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", border: "1px solid var(--accent)", borderRadius: "4px", padding: "2px 6px", background: "var(--bg)", outline: "none", minWidth: "120px" }}
                />
              ) : (
                <span
                  onClick={() => startRename(section)}
                  style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", cursor: "text", userSelect: "none" }}
                  title="Click to rename"
                >
                  {section.name}
                </span>
              )}

              <span style={{ fontSize: "11px", color: "var(--text-muted)", background: "var(--panel-hover)", padding: "1px 6px", borderRadius: "10px" }}>{stasks.length}</span>

              {/* "..." menu button */}
              <button
                onClick={() => { setSectionMenu(isMenuOpen ? null : section.id); setColorPicker(null); }}
                style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: "14px", padding: "0 4px", lineHeight: 1, opacity: 0.7 }}
                title="Section options"
              >
                ···
              </button>

              {/* Dropdown menu */}
              {isMenuOpen && (
                <div ref={menuRef} style={{
                  position: "absolute", top: "100%", right: "0", zIndex: 200,
                  background: "var(--bg-elevated)", border: "1px solid var(--border)",
                  borderRadius: "8px", boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                  minWidth: "160px", padding: "4px",
                }}>
                  <button onClick={() => startRename(section)} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", background: "none", border: "none", cursor: "pointer", fontSize: "13px", color: "var(--text-primary)", borderRadius: "4px" }}>
                    Rename section
                  </button>
                  <button onClick={() => { setColorPicker(section.id); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", background: "none", border: "none", cursor: "pointer", fontSize: "13px", color: "var(--text-primary)", borderRadius: "4px" }}>
                    Set color…
                  </button>
                  <div style={{ borderTop: "1px solid var(--border)", margin: "4px 0" }} />
                  <button onClick={() => deleteSection(section.id)} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", background: "none", border: "none", cursor: "pointer", fontSize: "13px", color: "var(--negative)", borderRadius: "4px" }}>
                    Delete section
                  </button>
                </div>
              )}

              {/* Color picker dropdown */}
              {isColorOpen && (
                <div ref={menuRef} style={{
                  position: "absolute", top: "100%", right: "0", zIndex: 200,
                  background: "var(--bg-elevated)", border: "1px solid var(--border)",
                  borderRadius: "8px", boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                  padding: "12px", minWidth: "200px",
                }}>
                  <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "8px" }}>Section color</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {SECTION_COLORS.map(c => (
                      <button
                        key={c.label}
                        onClick={() => updateSectionColor(section.id, c.value)}
                        title={c.label}
                        style={{
                          width: "24px", height: "24px", borderRadius: "50%",
                          background: c.value ?? "var(--panel-hover)",
                          border: section.color === c.value ? "2px solid var(--accent)" : "2px solid transparent",
                          cursor: "pointer",
                          outline: "none",
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {!isCollapsed && (
              <div style={{ background: "var(--bg-elevated)", borderRadius: "8px", border: "1px solid var(--border)", overflow: "hidden", marginLeft: "20px" }}>
                {/* Header row */}
                <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 140px 80px 80px", gap: "8px", padding: "6px 12px", borderBottom: "1px solid var(--border)", background: "var(--panel-hover)" }}>
                  <span style={{ width: "16px" }} />
                  <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Title</span>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Assignee</span>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Due</span>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Priority</span>
                </div>

                {stasks.map((task, i) => {
                  const done = task.status === "completed";
                  return (
                    <div
                      key={task.id}
                      style={{
                        display: "grid", gridTemplateColumns: "auto 1fr 140px 80px 80px", gap: "8px",
                        padding: "8px 12px", alignItems: "center", cursor: "pointer",
                        borderBottom: i < stasks.length - 1 ? "1px solid var(--border)" : "none",
                        opacity: done ? 0.5 : 1,
                      }}
                      onClick={() => onTaskClick(task.id)}
                    >
                      <input
                        type="checkbox" checked={done}
                        onChange={e => { e.stopPropagation(); toggleComplete(task); }}
                        style={{ width: "14px", height: "14px", accentColor: "var(--positive)", cursor: "pointer" }}
                        onClick={e => e.stopPropagation()}
                      />
                      <span style={{ fontSize: "14px", color: "var(--text-primary)", textDecoration: done ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {task.title}
                        {task.labels?.length > 0 && task.labels.map(l => (
                          <span key={l} style={{ marginLeft: "6px", fontSize: "10px", padding: "1px 6px", borderRadius: "3px", background: "var(--accent-subtle)", color: "var(--accent)" }}>{l}</span>
                        ))}
                      </span>
                      <AssigneeStack assignees={task.assignees ?? []} />
                      <span style={{ fontSize: "12px", color: task.dueDate && new Date(task.dueDate) < new Date() && !done ? "var(--negative)" : "var(--text-muted)" }}>
                        {task.dueDate ? new Date(task.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                      </span>
                      <PriorityDot priority={task.priority} />
                    </div>
                  );
                })}

                {/* Inline add task */}
                {addingInSection === section.id ? (
                  <div style={{ padding: "6px 12px", display: "flex", gap: "8px", alignItems: "center", borderTop: stasks.length > 0 ? "1px solid var(--border)" : "none" }}>
                    <span style={{ width: "14px" }} />
                    <input
                      autoFocus value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") addTask(section.id); if (e.key === "Escape") { setAddingInSection(null); setNewTaskTitle(""); } }}
                      placeholder="Task title… (Enter to add)"
                      style={{ flex: 1, padding: "4px 8px", border: "1px solid var(--accent)", borderRadius: "4px", fontSize: "13px", background: "var(--bg)", color: "var(--text-primary)", outline: "none" }}
                    />
                    <button onClick={() => addTask(section.id)} style={{ padding: "4px 10px", background: "var(--accent)", color: "white", border: "none", borderRadius: "4px", fontSize: "12px", cursor: "pointer" }}>Add</button>
                    <button onClick={() => { setAddingInSection(null); setNewTaskTitle(""); }} style={{ padding: "4px 8px", background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "16px" }}>×</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingInSection(section.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: "6px", width: "100%", padding: "8px 12px",
                      background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: "13px",
                      borderTop: stasks.length > 0 ? "1px solid var(--border)" : "none",
                    }}
                  >
                    <span style={{ fontSize: "16px" }}>+</span> Add task
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Add section */}
      {addingSection ? (
        <div style={{ display: "flex", gap: "8px", alignItems: "center", padding: "8px 4px", marginTop: "8px" }}>
          <input
            autoFocus value={newSectionName} onChange={e => setNewSectionName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") addSection(); if (e.key === "Escape") { setAddingSection(false); setNewSectionName(""); } }}
            placeholder="Section name…"
            style={{ flex: 1, maxWidth: "240px", padding: "6px 10px", border: "1px solid var(--accent)", borderRadius: "6px", fontSize: "13px", background: "var(--bg)", color: "var(--text-primary)", outline: "none" }}
          />
          <button onClick={addSection} style={{ padding: "6px 12px", background: "var(--accent)", color: "white", border: "none", borderRadius: "6px", fontSize: "13px", cursor: "pointer" }}>Add</button>
          <button onClick={() => { setAddingSection(false); setNewSectionName(""); }} style={{ padding: "6px 8px", background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "16px" }}>×</button>
        </div>
      ) : (
        <button
          onClick={() => setAddingSection(true)}
          style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 4px", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: "13px", marginTop: "8px" }}
        >
          <span style={{ fontSize: "16px" }}>+</span> Add section
        </button>
      )}
    </div>
  );
}
