"use client";
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent, type DragOverEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState, useCallback } from "react";
import { PriorityDot } from "@/components/pm/PriorityBadge";

interface Section { id: string; name: string; position: number; }
interface Task { id: string; title: string; status: string; priority: string; dueDate: string | null; assigneeId: string | null; sectionId: string | null; position: number; labels: string[]; completedAt: string | null; }

interface KanbanBoardProps {
  projectId: string; sections: Section[]; tasks: Task[];
  setSections: (s: Section[]) => void; setTasks: (t: Task[]) => void;
  onTaskClick: (id: string) => void;
}

function TaskCard({ task, onClick }: { task: Task; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const done = task.status === "completed";
  return (
    <div ref={setNodeRef} {...attributes} {...listeners}
      style={{
        transform: CSS.Transform.toString(transform), transition,
        background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "8px",
        padding: "10px 12px", marginBottom: "6px", cursor: "grab", opacity: isDragging ? 0.4 : done ? 0.6 : 1,
        boxShadow: isDragging ? "0 8px 24px rgba(0,0,0,0.12)" : "none",
      }}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px" }}>
        <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-primary)", textDecoration: done ? "line-through" : "none", lineHeight: 1.4 }}>
          {task.title}
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

function Column({ section, tasks, onTaskClick, onAddTask }: { section: Section; tasks: Task[]; onTaskClick: (id: string) => void; onAddTask: (sId: string, title: string) => void }) {
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
            <TaskCard key={task.id} task={task} onClick={() => onTaskClick(task.id)} />
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
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

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
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div style={{ display: "flex", gap: "16px", padding: "20px 24px", overflowX: "auto", height: "100%", alignItems: "flex-start" }}>
        {sections.map(section => (
          <Column key={section.id} section={section} tasks={sectionTasks(section.id)} onTaskClick={onTaskClick} onAddTask={addTask} />
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
  );
}
