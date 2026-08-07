"use client";
import { useState, useEffect, use } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ProjectListView } from "@/components/pm/project/ProjectListView";
import { KanbanBoard } from "@/components/pm/board/KanbanBoard";
import { TaskDetailPanel } from "@/components/pm/task/TaskDetailPanel";

interface Project { id: string; name: string; color: string; status: string; description: string | null; }
interface Section { id: string; name: string; position: number; }
interface Task {
  id: string; title: string; status: string; priority: string; dueDate: string | null;
  assigneeId: string | null; sectionId: string | null; position: number; labels: string[];
  completedAt: string | null; createdAt?: string;
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "#ef4444", high: "#f97316", medium: "#eab308", low: "#22c55e", none: "#6b7280",
};

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
        {view === "calendar" && <CalendarView tasks={tasks} onTaskClick={setSelectedTaskId} />}
        {view === "timeline" && <TimelineView tasks={tasks} sections={sections} onTaskClick={setSelectedTaskId} />}
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

// ── Calendar View ─────────────────────────────────────────────────────────────

function CalendarView({ tasks, onTaskClick }: { tasks: Task[]; onTaskClick: (id: string) => void }) {
  const [currentDate, setCurrentDate] = useState(() => new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = firstDay.getDay(); // 0=Sun

  // Build day grid
  const gridStart = new Date(firstDay);
  gridStart.setDate(gridStart.getDate() - startDow);
  const totalCells = Math.ceil((startDow + lastDay.getDate()) / 7) * 7;
  const days: Date[] = [];
  for (let i = 0; i < totalCells; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    days.push(d);
  }

  const todayStr = new Date().toISOString().slice(0, 10);

  // Index tasks by due date
  const tasksByDate = tasks.reduce<Record<string, Task[]>>((acc, t) => {
    if (t.dueDate) {
      if (!acc[t.dueDate]) acc[t.dueDate] = [];
      acc[t.dueDate].push(t);
    }
    return acc;
  }, {});
  const noDateTasks = tasks.filter(t => !t.dueDate);

  const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const monthLabel = currentDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const goBack = () => {
    const d = new Date(currentDate);
    d.setMonth(d.getMonth() - 1);
    setCurrentDate(d);
  };
  const goForward = () => {
    const d = new Date(currentDate);
    d.setMonth(d.getMonth() + 1);
    setCurrentDate(d);
  };

  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  const fmtDate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Navigation header */}
      <div style={{ padding: "12px 20px", display: "flex", alignItems: "center", gap: "10px", flexShrink: 0, borderBottom: "1px solid var(--border)", background: "var(--bg)" }}>
        <button onClick={goBack} style={{ padding: "4px 10px", border: "1px solid var(--border)", borderRadius: "4px", background: "var(--bg)", cursor: "pointer", color: "var(--text-primary)", fontSize: "14px" }}>‹</button>
        <span style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-primary)", minWidth: "180px", textAlign: "center" }}>{monthLabel}</span>
        <button onClick={goForward} style={{ padding: "4px 10px", border: "1px solid var(--border)", borderRadius: "4px", background: "var(--bg)", cursor: "pointer", color: "var(--text-primary)", fontSize: "14px" }}>›</button>
        <button onClick={() => setCurrentDate(new Date())} style={{ marginLeft: "4px", padding: "4px 12px", border: "1px solid var(--border)", borderRadius: "4px", background: "var(--bg)", cursor: "pointer", fontSize: "12px", color: "var(--text-muted)" }}>Today</button>
      </div>

      <div style={{ flex: 1, overflow: "auto" }}>
        {/* Day-of-week headers */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
          {DOW_LABELS.map(d => (
            <div key={d} style={{ padding: "8px", textAlign: "center", fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{d}</div>
          ))}
        </div>

        {/* Weeks grid */}
        {weeks.map((week, wi) => (
          <div key={wi} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: "1px solid var(--border)" }}>
            {week.map((day, di) => {
              const dateStr = fmtDate(day);
              const isToday = dateStr === todayStr;
              const isCurrentMonth = day.getMonth() === month;
              const dayTasks = tasksByDate[dateStr] ?? [];

              return (
                <div
                  key={di}
                  style={{
                    minHeight: "100px", padding: "6px 8px",
                    borderRight: di < 6 ? "1px solid var(--border)" : "none",
                    background: isToday ? "var(--accent-subtle)" : "var(--bg)",
                    opacity: isCurrentMonth ? 1 : 0.4,
                  }}
                >
                  <div style={{
                    fontSize: "12px", fontWeight: isToday ? 700 : 400,
                    color: isToday ? "var(--accent)" : "var(--text-muted)",
                    marginBottom: "4px", display: "flex", alignItems: "center", justifyContent: "flex-end",
                  }}>
                    {isToday ? (
                      <span style={{ width: "20px", height: "20px", borderRadius: "50%", background: "var(--accent)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px" }}>
                        {day.getDate()}
                      </span>
                    ) : day.getDate()}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    {dayTasks.slice(0, 3).map(t => (
                      <button
                        key={t.id}
                        onClick={() => onTaskClick(t.id)}
                        style={{
                          padding: "2px 5px", borderRadius: "3px", border: "none", cursor: "pointer",
                          textAlign: "left",
                          background: (PRIORITY_COLORS[t.priority] ?? PRIORITY_COLORS.none) + "25",
                          borderLeft: `3px solid ${PRIORITY_COLORS[t.priority] ?? PRIORITY_COLORS.none}`,
                          fontSize: "11px", color: "var(--text-primary)",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", width: "100%",
                        }}
                        title={t.title}
                      >
                        {t.title}
                      </button>
                    ))}
                    {dayTasks.length > 3 && (
                      <div style={{ fontSize: "10px", color: "var(--text-muted)", padding: "0 2px" }}>
                        +{dayTasks.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {/* No-date strip */}
        {noDateTasks.length > 0 && (
          <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
            <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", marginBottom: "8px", textTransform: "uppercase" }}>
              No date — {noDateTasks.length} task{noDateTasks.length !== 1 ? "s" : ""}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
              {noDateTasks.map(t => (
                <button
                  key={t.id}
                  onClick={() => onTaskClick(t.id)}
                  style={{
                    padding: "3px 8px", borderRadius: "4px", border: "none", cursor: "pointer",
                    background: (PRIORITY_COLORS[t.priority] ?? PRIORITY_COLORS.none) + "25",
                    borderLeft: `3px solid ${PRIORITY_COLORS[t.priority] ?? PRIORITY_COLORS.none}`,
                    fontSize: "12px", color: "var(--text-primary)",
                  }}
                >
                  {t.title}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Timeline / Gantt View ─────────────────────────────────────────────────────

function TimelineView({ tasks, sections, onTaskClick }: { tasks: Task[]; sections: Section[]; onTaskClick: (id: string) => void }) {
  const tasksWithDates = tasks.filter(t => t.dueDate);

  if (tasksWithDates.length === 0) {
    return (
      <div style={{ padding: "60px 32px", textAlign: "center" }}>
        <div style={{ fontSize: "40px", marginBottom: "12px" }}>📅</div>
        <div style={{ fontSize: "16px", fontWeight: 500, color: "var(--text-primary)" }}>No timeline data</div>
        <div style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "4px" }}>
          Add due dates to tasks to see them on the timeline.
        </div>
      </div>
    );
  }

  // Compute date range
  const dueDates = tasksWithDates.map(t => new Date(t.dueDate!).getTime());
  const createdDates = tasks.map(t => t.createdAt ? new Date(t.createdAt).getTime() : Date.now()).filter(n => !isNaN(n));
  const minDate = Math.min(...createdDates, ...dueDates);
  const maxDate = Math.max(...dueDates);
  const MS_DAY = 24 * 60 * 60 * 1000;
  const startDate = new Date(minDate - 7 * MS_DAY);
  const endDate = new Date(maxDate + 14 * MS_DAY);
  const totalMs = endDate.getTime() - startDate.getTime();
  const totalDays = Math.ceil(totalMs / MS_DAY);

  const DAY_WIDTH = 28;
  const ROW_HEIGHT = 40;
  const LEFT_COL = 220;
  const HEADER_H = 36;
  const totalWidth = Math.max(totalDays * DAY_WIDTH, 400);

  // Week label markers
  const weekLabels: { label: string; left: number }[] = [];
  const cursor = new Date(startDate);
  while (cursor <= endDate) {
    const left = ((cursor.getTime() - startDate.getTime()) / MS_DAY) * DAY_WIDTH;
    weekLabels.push({ label: cursor.toLocaleDateString("en-US", { month: "short", day: "numeric" }), left });
    cursor.setDate(cursor.getDate() + 7);
  }

  // Today marker
  const todayLeft = ((Date.now() - startDate.getTime()) / MS_DAY) * DAY_WIDTH;

  // Bar props per task
  const barProps = (t: Task) => {
    const start = t.createdAt ? new Date(t.createdAt).getTime() : Date.now();
    const end = t.dueDate ? new Date(t.dueDate).getTime() : start;
    const left = ((start - startDate.getTime()) / MS_DAY) * DAY_WIDTH;
    const width = Math.max(DAY_WIDTH, ((end - start) / MS_DAY) * DAY_WIDTH);
    return { left: Math.max(0, left), width };
  };

  // Group rows: sections then ungrouped
  type RowItem = { kind: "section"; name: string } | { kind: "task"; task: Task };
  const rows: RowItem[] = [];
  const addedIds = new Set<string>();

  for (const sec of sections) {
    const secTasks = tasks.filter(t => t.sectionId === sec.id);
    if (secTasks.length === 0) continue;
    rows.push({ kind: "section", name: sec.name });
    for (const t of secTasks) { rows.push({ kind: "task", task: t }); addedIds.add(t.id); }
  }
  const ungrouped = tasks.filter(t => !addedIds.has(t.id));
  if (ungrouped.length > 0) {
    if (sections.length > 0) rows.push({ kind: "section", name: "No section" });
    for (const t of ungrouped) rows.push({ kind: "task", task: t });
  }

  const totalHeight = rows.length * ROW_HEIGHT;

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Fixed left column */}
      <div style={{ width: `${LEFT_COL}px`, flexShrink: 0, borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column" }}>
        <div style={{ height: `${HEADER_H}px`, borderBottom: "1px solid var(--border)", background: "var(--bg-elevated)", display: "flex", alignItems: "center", padding: "0 14px", flexShrink: 0 }}>
          <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>Task</span>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {rows.map((row, i) =>
            row.kind === "section" ? (
              <div key={i} style={{ height: `${ROW_HEIGHT}px`, padding: "0 14px", display: "flex", alignItems: "center", background: "var(--bg-elevated)", borderBottom: "1px solid var(--border)" }}>
                <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>{row.name}</span>
              </div>
            ) : (
              <div
                key={i}
                style={{ height: `${ROW_HEIGHT}px`, padding: "0 14px", display: "flex", alignItems: "center", borderBottom: "1px solid var(--border)", cursor: "pointer" }}
                onClick={() => onTaskClick(row.task.id)}
              >
                <span style={{ fontSize: "13px", color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.task.title}</span>
              </div>
            )
          )}
        </div>
      </div>

      {/* Scrollable right area */}
      <div style={{ flex: 1, overflowX: "auto", overflowY: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ width: `${totalWidth}px`, display: "flex", flexDirection: "column", height: `${HEADER_H + totalHeight}px` }}>
          {/* Week header */}
          <div style={{ height: `${HEADER_H}px`, position: "relative", borderBottom: "1px solid var(--border)", background: "var(--bg-elevated)", flexShrink: 0 }}>
            {weekLabels.map((wl, i) => (
              <div key={i} style={{ position: "absolute", left: `${wl.left}px`, top: 0, height: "100%", display: "flex", alignItems: "center", padding: "0 8px", borderLeft: "1px solid var(--border)" }}>
                <span style={{ fontSize: "11px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>{wl.label}</span>
              </div>
            ))}
            {/* Today marker in header */}
            {todayLeft >= 0 && todayLeft <= totalWidth && (
              <div style={{ position: "absolute", left: `${todayLeft}px`, top: 0, bottom: 0, width: "2px", background: "var(--accent)", opacity: 0.7 }} />
            )}
          </div>

          {/* Row bars */}
          <div style={{ position: "relative", flex: 1 }}>
            {/* Today vertical line */}
            {todayLeft >= 0 && todayLeft <= totalWidth && (
              <div style={{ position: "absolute", left: `${todayLeft}px`, top: 0, bottom: 0, width: "2px", background: "var(--accent)", opacity: 0.3, zIndex: 1 }} />
            )}
            {rows.map((row, i) =>
              row.kind === "section" ? (
                <div key={i} style={{ height: `${ROW_HEIGHT}px`, background: "var(--bg-elevated)", borderBottom: "1px solid var(--border)" }} />
              ) : (
                <div key={i} style={{ height: `${ROW_HEIGHT}px`, position: "relative", borderBottom: "1px solid var(--border)" }}>
                  {(() => {
                    const { left, width } = barProps(row.task);
                    const color = PRIORITY_COLORS[row.task.priority] ?? PRIORITY_COLORS.none;
                    return (
                      <button
                        onClick={() => onTaskClick(row.task.id)}
                        title={row.task.title}
                        style={{
                          position: "absolute",
                          left: `${left}px`,
                          width: `${width}px`,
                          top: "8px",
                          height: `${ROW_HEIGHT - 16}px`,
                          background: color + "35",
                          border: `1.5px solid ${color}`,
                          borderRadius: "4px",
                          cursor: "pointer",
                          padding: "0 6px",
                          overflow: "hidden",
                          textAlign: "left",
                          fontSize: "11px",
                          color: "var(--text-primary)",
                          whiteSpace: "nowrap",
                          textOverflow: "ellipsis",
                          zIndex: 2,
                        }}
                      >
                        {width > 50 ? row.task.title : ""}
                      </button>
                    );
                  })()}
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
