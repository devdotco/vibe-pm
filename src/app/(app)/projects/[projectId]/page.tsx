"use client";
import { useState, useEffect, use } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ProjectListView } from "@/components/pm/project/ProjectListView";
import { KanbanBoard } from "@/components/pm/board/KanbanBoard";
import { TaskDetailPanel } from "@/components/pm/task/TaskDetailPanel";

interface Project { id: string; name: string; color: string; status: string; description: string | null; }
interface Section { id: string; name: string; position: number; }
interface Task { id: string; title: string; status: string; priority: string; dueDate: string | null; assigneeId: string | null; sectionId: string | null; position: number; labels: string[]; completedAt: string | null; }

export default function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  const searchParams = useSearchParams();
  const router = useRouter();
  const view = searchParams.get("view") ?? "list";
  const [project, setProject] = useState<Project | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/pm/projects/${projectId}`).then(r => r.json()).then(d => setProject(d.project));
    fetch(`/api/pm/projects/${projectId}/sections`).then(r => r.json()).then(d => setSections(d.sections ?? []));
    fetch(`/api/pm/projects/${projectId}/tasks`).then(r => r.json()).then(d => setTasks(d.tasks ?? []));
  }, [projectId]);

  const setView = (v: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("view", v);
    router.push(`?view=${v}`, { scroll: false });
  };

  if (!project) return <div style={{ padding: "32px", color: "var(--text-muted)" }}>Loading...</div>;

  const VIEWS = ["list", "board", "calendar", "timeline"];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Project header */}
      <div style={{ padding: "16px 24px 0", background: "var(--bg-elevated)", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
          <span style={{ width: "12px", height: "12px", borderRadius: "50%", background: project.color, flexShrink: 0 }} />
          <h1 style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-primary)" }}>{project.name}</h1>
          <a href={`/projects/${projectId}/stats`} style={{ marginLeft: "auto", fontSize: "13px", color: "var(--text-muted)", textDecoration: "none", padding: "4px 10px", border: "1px solid var(--border)", borderRadius: "6px" }}>Stats</a>
          <a href={`/projects/${projectId}/settings`} style={{ fontSize: "13px", color: "var(--text-muted)", textDecoration: "none", padding: "4px 10px", border: "1px solid var(--border)", borderRadius: "6px" }}>⚙ Settings</a>
        </div>
        <div style={{ display: "flex", gap: "4px" }}>
          {VIEWS.map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: "6px 14px", border: "none", background: "transparent", cursor: "pointer", fontSize: "13px",
              color: view === v ? "var(--accent)" : "var(--text-secondary)",
              borderBottom: view === v ? "2px solid var(--accent)" : "2px solid transparent",
              fontWeight: view === v ? 600 : 400,
              textTransform: "capitalize",
            }}>
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* View content */}
      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        {view === "list" && (
          <ProjectListView
            projectId={projectId} sections={sections} tasks={tasks}
            setSections={setSections} setTasks={setTasks}
            onTaskClick={setSelectedTaskId}
          />
        )}
        {view === "board" && (
          <KanbanBoard
            projectId={projectId} sections={sections} tasks={tasks}
            setSections={setSections} setTasks={setTasks}
            onTaskClick={setSelectedTaskId}
          />
        )}
        {view === "calendar" && <CalendarView projectId={projectId} tasks={tasks} setTasks={setTasks} onTaskClick={setSelectedTaskId} />}
        {view === "timeline" && <TimelineView tasks={tasks} sections={sections} />}
      </div>

      {/* Task detail panel */}
      {selectedTaskId && (
        <TaskDetailPanel
          taskId={selectedTaskId}
          onClose={() => setSelectedTaskId(null)}
        />
      )}
    </div>
  );
}

// Simple stubs for calendar/timeline (to be replaced by Agent D)
function CalendarView({ projectId, tasks, setTasks, onTaskClick }: { projectId: string; tasks: Task[]; setTasks: (t: Task[]) => void; onTaskClick: (id: string) => void }) {
  return <div style={{ padding: "32px", color: "var(--text-muted)" }}>Calendar view — coming soon</div>;
}
function TimelineView({ tasks, sections }: { tasks: Task[]; sections: Section[] }) {
  return <div style={{ padding: "32px", color: "var(--text-muted)" }}>Timeline view — coming soon</div>;
}
