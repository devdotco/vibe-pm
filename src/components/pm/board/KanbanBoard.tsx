"use client";
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { Skeleton } from "@/components/ui/Skeleton";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState, useCallback, useEffect, useRef } from "react";
import { PriorityDot } from "@/components/pm/PriorityBadge";

interface Section { id: string; name: string; position: number; }
interface Task { id: string; title: string; status: string; priority: string; dueDate: string | null; assigneeId: string | null; sectionId: string | null; position: number; labels: string[]; completedAt: string | null; }
interface OrgUser { id: string; name: string; email: string; }

interface KanbanBoardProps {
  projectId: string; sections: Section[]; tasks: Task[];
  setSections: (s: Section[]) => void; setTasks: (t: Task[]) => void;
  onTaskClick: (id: string) => void; loading?: boolean;
}

export function KanbanBoardSkeleton() {
  return (
    <div style={{ display: "flex", gap: "16px", padding: "20px 24px", overflowX: "auto", height: "100%" }}>
      {[...Array(3)].map((_, ci) => (
        <div key={ci} style={{ width: "280px", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
            <Skeleton style={{ width: "100px", height: "14px" }} />
            <Skeleton style={{ width: "22px", height: "16px", borderRadius: "8px" }} />
          </div>
          {[...Array(4)].map((_, ri) => (
            <div key={ri} style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "8px", padding: "12px", marginBottom: "8px" }}>
              <Skeleton style={{ width: "80%", height: "13px" }} />
              <Skeleton style={{ width: "40%", height: "10px", marginTop: "8px" }} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function TaskCard({ task, onClick, selected, onToggleSelect, anySelected }: {
  task: Task; onClick: () => void;
  selected: boolean; onToggleSelect: (id: string) => void; anySelected: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const [hovered, setHovered] = useState(false);
  const done = task.status === "completed";
  const showCheck = hovered || selected || anySelected;

  return (
    <div ref={setNodeRef} {...attributes} {...listeners}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onKeyDown={e => { if (e.key === " " && e.target === e.currentTarget) { e.preventDefault(); onToggleSelect(task.id); } }}
      tabIndex={0}
      style={{
        transform: CSS.Transform.toString(transform), transition,
        background: selected ? "var(--accent-subtle, #eff6ff)" : "var(--bg-elevated)",
        border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`,
        borderRadius: "8px",
        padding: "10px 12px", marginBottom: "6px", cursor: "grab",
        opacity: isDragging ? 0.4 : done ? 0.6 : 1,
        boxShadow: isDragging ? "0 8px 24px rgba(0,0,0,0.12)" : "none",
        position: "relative", outline: "none",
      }}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      {showCheck && (
        <div style={{ position: "absolute", top: "8px", left: "8px" }} onClick={e => { e.stopPropagation(); onToggleSelect(task.id); }}>
          <input type="checkbox" checked={selected} onChange={() => onToggleSelect(task.id)}
            style={{ width: "13px", height: "13px", accentColor: "var(--accent)", cursor: "pointer" }} />
        </div>
      )}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px", paddingLeft: showCheck ? "18px" : "0" }}>
        <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-primary)", textDecoration: done ? "line-through" : "none", lineHeight: 1.4 }}>
          {task.title}
          {/* recurrence icon added by parent if task has recurrence */}
        </span>
        <PriorityDot priority={task.priority} />
      </div>
      {task.labels && task.labels.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "6px" }}>
          {task.labels.map(l => (
            <span key={l} style={{ fontSize: "10px", padding: "1px 5px", borderRadius: "3px", background: "var(--accent-subtle)", color: "var(--accent)" }}>{l}</span>
          ))}
        </div>
      )}
      {task.dueDate && (
        <div style={{ marginTop: "8px", fontSize: "11px", color: new Date(task.dueDate) < new Date() && !done ? "var(--negative)" : "var(--text-muted)" }}>
          📅 {new Date(task.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </div>
      )}
    </div>
  );
}

function BoardBulkBar({ selectedIds, orgUsers, sections, onAction, onClear }: {
  selectedIds: string[]; orgUsers: OrgUser[]; sections: Section[];
  onAction: (action: string, value?: string) => void; onClear: () => void;
}) {
  const [showAssign, setShowAssign] = useState(false);
  const [showPriority, setShowPriority] = useState(false);
  const [showMove, setShowMove] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        setShowAssign(false); setShowPriority(false); setShowMove(false);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const btnStyle: React.CSSProperties = { padding: "5px 12px", fontSize: "12px", fontWeight: 500, borderRadius: "6px", border: "1px solid rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.12)", color: "white", cursor: "pointer", whiteSpace: "nowrap" };

  return (
    <div style={{ position: "fixed", bottom: "24px", left: "50%", transform: "translateX(-50%)", background: "var(--text-primary)", color: "white", borderRadius: "10px", padding: "10px 16px", display: "flex", alignItems: "center", gap: "8px", boxShadow: "0 8px 32px rgba(0,0,0,0.3)", zIndex: 500, userSelect: "none" }} ref={popRef}>
      <span style={{ fontSize: "13px", fontWeight: 600, marginRight: "6px" }}>{selectedIds.length} selected</span>
      <button style={btnStyle} onClick={() => onAction('complete')}>Complete</button>
      <div style={{ position: "relative" }}>
        <button style={btnStyle} onClick={() => { setShowAssign(v => !v); setShowPriority(false); setShowMove(false); }}>Assign ▾</button>
        {showAssign && (
          <div style={{ position: "absolute", bottom: "calc(100% + 6px)", left: 0, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "8px", boxShadow: "0 8px 24px rgba(0,0,0,0.2)", minWidth: "180px", maxHeight: "240px", overflowY: "auto", padding: "4px" }}>
            {orgUsers.map(u => (
              <button key={u.id} onClick={() => { onAction('assign', u.id); setShowAssign(false); }}
                style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%", padding: "7px 10px", background: "none", border: "none", cursor: "pointer", color: "var(--text-primary)", fontSize: "13px", borderRadius: "4px" }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--panel-hover)")}
                onMouseLeave={e => (e.currentTarget.style.background = "none")}>{u.name}</button>
            ))}
          </div>
        )}
      </div>
      <div style={{ position: "relative" }}>
        <button style={btnStyle} onClick={() => { setShowPriority(v => !v); setShowAssign(false); setShowMove(false); }}>Priority ▾</button>
        {showPriority && (
          <div style={{ position: "absolute", bottom: "calc(100% + 6px)", left: 0, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "8px", boxShadow: "0 8px 24px rgba(0,0,0,0.2)", minWidth: "140px", padding: "4px" }}>
            {['urgent','high','medium','low','none'].map(p => (
              <button key={p} onClick={() => { onAction('change_priority', p); setShowPriority(false); }}
                style={{ display: "block", width: "100%", padding: "7px 10px", background: "none", border: "none", cursor: "pointer", fontSize: "13px", textAlign: "left", textTransform: "capitalize", borderRadius: "4px", color: "var(--text-primary)" }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--panel-hover)")}
                onMouseLeave={e => (e.currentTarget.style.background = "none")}>{p}</button>
            ))}
          </div>
        )}
      </div>
      <div style={{ position: "relative" }}>
        <button style={btnStyle} onClick={() => { setShowMove(v => !v); setShowAssign(false); setShowPriority(false); }}>Move ▾</button>
        {showMove && (
          <div style={{ position: "absolute", bottom: "calc(100% + 6px)", left: 0, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "8px", boxShadow: "0 8px 24px rgba(0,0,0,0.2)", minWidth: "160px", maxHeight: "240px", overflowY: "auto", padding: "4px" }}>
            {sections.map(s => (
              <button key={s.id} onClick={() => { onAction('move_section', s.id); setShowMove(false); }}
                style={{ display: "block", width: "100%", padding: "7px 10px", background: "none", border: "none", cursor: "pointer", color: "var(--text-primary)", fontSize: "13px", textAlign: "left", borderRadius: "4px" }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--panel-hover)")}
                onMouseLeave={e => (e.currentTarget.style.background = "none")}>{s.name}</button>
            ))}
          </div>
        )}
      </div>
      <button style={{ ...btnStyle, background: "rgba(239,68,68,0.3)", border: "1px solid rgba(239,68,68,0.5)" }} onClick={() => { if (confirm(`Delete ${selectedIds.length} tasks?`)) onAction('delete'); }}>Delete</button>
      <button style={{ ...btnStyle, background: "transparent", border: "1px solid rgba(255,255,255,0.15)" }} onClick={onClear}>Clear</button>
    </div>
  );
}

function Column({ section, tasks, onTaskClick, onAddTask, selectedIds, onToggleSelect }: { section: Section; tasks: Task[]; onTaskClick: (id: string) => void; onAddTask: (sId: string, title: string) => void; selectedIds: Set<string>; onToggleSelect: (id: string) => void; }) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");

  const handleAdd = () => {
    if (title.trim()) { onAddTask(section.id, title.trim()); setTitle(""); }
    setAdding(false);
  };

  return (
    <div style={{ width: "280px", flexShrink: 0, display: "flex", flexDirection: "column", maxHeight: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 4px 10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>{section.name}</span>
          <span style={{ fontSize: "11px", color: "var(--text-muted)", background: "var(--panel-hover)", padding: "1px 6px", borderRadius: "10px" }}>{tasks.length}</span>
        </div>
        <button onClick={() => setAdding(true)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: "18px", padding: "0 2px" }}>+</button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "4px" }}>
        <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map(task => (
            <TaskCard key={task.id} task={task} onClick={() => onTaskClick(task.id)}
              selected={selectedIds.has(task.id)} onToggleSelect={onToggleSelect} anySelected={selectedIds.size > 0} />
          ))}
        </SortableContext>
        {adding ? (
          <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--accent)", borderRadius: "8px", padding: "8px" }}>
            <input autoFocus value={title} onChange={e => setTitle(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") { setAdding(false); setTitle(""); } }}
              placeholder="Task title..."
              style={{ width: "100%", padding: "4px 0", border: "none", fontSize: "13px", background: "transparent", color: "var(--text-primary)", outline: "none" }} />
            <div style={{ display: "flex", gap: "6px", marginTop: "8px" }}>
              <button onClick={handleAdd} style={{ padding: "4px 10px", background: "var(--accent)", color: "white", border: "none", borderRadius: "4px", fontSize: "12px", cursor: "pointer" }}>Add</button>
              <button onClick={() => { setAdding(false); setTitle(""); }} style={{ padding: "4px 8px", background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}>Cancel</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setAdding(true)} style={{ width: "100%", padding: "8px", background: "none", border: "1px dashed var(--border)", borderRadius: "8px", cursor: "pointer", color: "var(--text-muted)", fontSize: "13px", marginTop: "4px" }}>
            + Add task
          </button>
        )}
      </div>
    </div>
  );
}

export function KanbanBoard({ projectId, sections, tasks, setSections, setTasks, onTaskClick }: KanbanBoardProps) {
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [orgUsers, setOrgUsers] = useState<OrgUser[]>([]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => {
    fetch("/api/pm/admin/users").then(r => r.json()).then(d => setOrgUsers(d.users ?? []));
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const runBulkAction = useCallback(async (action: string, value?: string) => {
    const taskIds = Array.from(selectedTaskIds);
    const res = await fetch("/api/pm/tasks/bulk", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskIds, action, value }),
    });
    const data = await res.json() as { tasks?: Task[] };
    if (data.tasks) {
      const updMap = new Map(data.tasks.map(t => [t.id, t]));
      setTasks(tasks.map(t => updMap.has(t.id) ? { ...t, ...updMap.get(t.id) } : t));
    }
    if (action === 'delete') setTasks(tasks.filter(t => !selectedTaskIds.has(t.id)));
    setSelectedTaskIds(new Set());
  }, [selectedTaskIds, tasks, setTasks]);

  const sectionTasks = (sId: string) => tasks.filter(t => t.sectionId === sId && !t.completedAt).sort((a, b) => a.position - b.position);

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveTask(tasks.find(t => t.id === active.id) ?? null);
  };

  const handleDragEnd = async ({ active, over }: DragEndEvent) => {
    setActiveTask(null);
    if (!over || active.id === over.id) return;
    const draggedTask = tasks.find(t => t.id === active.id);
    if (!draggedTask) return;

    // Determine target section
    let targetSectionId = draggedTask.sectionId;
    const overTask = tasks.find(t => t.id === over.id);
    const overSection = sections.find(s => s.id === over.id);
    if (overSection) targetSectionId = overSection.id;
    else if (overTask) targetSectionId = overTask.sectionId;

    // Calculate new position
    const targetTasks = sectionTasks(targetSectionId ?? "");
    const overIndex = overTask ? targetTasks.findIndex(t => t.id === over.id) : targetTasks.length;
    const before = overIndex > 0 ? targetTasks[overIndex - 1]?.position ?? null : null;
    const after = targetTasks[overIndex]?.position ?? null;
    const newPosition = before !== null && after !== null ? (before + after) / 2 : (before ?? 0) + 1000;

    // Optimistic update
    setTasks(tasks.map(t => t.id === draggedTask.id ? { ...t, sectionId: targetSectionId, position: newPosition } : t));

    // API call
    await fetch(`/api/pm/tasks/${draggedTask.id}/move`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sectionId: targetSectionId, position: newPosition }),
    });
  };

  const addTask = async (sectionId: string, title: string) => {
    const res = await fetch("/api/pm/tasks", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, sectionId, title }),
    });
    const d = await res.json();
    if (d.task) setTasks([...tasks, d.task]);
  };

  return (
    <>
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div style={{ display: "flex", gap: "16px", padding: "20px 24px", overflowX: "auto", height: "100%", alignItems: "flex-start" }}>
          {sections.map(section => (
            <Column key={section.id} section={section} tasks={sectionTasks(section.id)} onTaskClick={onTaskClick} onAddTask={addTask}
              selectedIds={selectedTaskIds} onToggleSelect={toggleSelect} />
          ))}
        </div>
        <DragOverlay>
          {activeTask && (
            <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--accent)", borderRadius: "8px", padding: "10px 12px", width: "280px", boxShadow: "0 12px 32px rgba(0,0,0,0.15)", fontSize: "13px", fontWeight: 500, color: "var(--text-primary)" }}>
              {activeTask.title}
            </div>
          )}
        </DragOverlay>
      </DndContext>
      {selectedTaskIds.size > 0 && (
        <BoardBulkBar
          selectedIds={Array.from(selectedTaskIds)}
          orgUsers={orgUsers}
          sections={sections}
          onAction={runBulkAction}
          onClear={() => setSelectedTaskIds(new Set())}
        />
      )}
    </>
  );
}
