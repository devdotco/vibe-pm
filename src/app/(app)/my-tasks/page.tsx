"use client";
import { useState, useEffect, useCallback } from "react";
import { PriorityDot } from "@/components/pm/PriorityBadge";
import { format, isToday, parseISO, addDays, isBefore } from "date-fns";

interface TaskRow {
  task: {
    id: string; title: string; status: string; priority: string;
    dueDate: string | null; projectId: string; completedAt: string | null;
  };
  projectName: string; projectColor: string; sectionName: string | null;
}

function groupTasks(tasks: TaskRow[]) {
  const today = new Date(); today.setHours(0,0,0,0);
  const in7 = addDays(today, 7);
  const groups: Record<string, TaskRow[]> = { Today: [], Upcoming: [], Later: [], 'No due date': [] };
  for (const t of tasks) {
    if (!t.task.dueDate) { groups['No due date'].push(t); continue; }
    const d = parseISO(t.task.dueDate);
    if (isToday(d)) groups.Today.push(t);
    else if (!isBefore(d, today) && isBefore(d, in7)) groups.Upcoming.push(t);
    else if (!isBefore(d, in7)) groups.Later.push(t);
    else groups.Today.push(t); // overdue goes in Today
  }
  return groups;
}

export default function MyTasksPage() {
  const [rows, setRows] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch("/api/pm/tasks/my").then(r => r.json()).then(d => {
      setRows(d.tasks ?? []);
      setLoading(false);
    });
  }, []);

  const toggleComplete = useCallback(async (taskId: string, status: string) => {
    if (status === "completed") {
      await fetch(`/api/pm/tasks/${taskId}/reopen`, { method: "POST" });
    } else {
      await fetch(`/api/pm/tasks/${taskId}/complete`, { method: "POST" });
    }
    fetch("/api/pm/tasks/my").then(r => r.json()).then(d => setRows(d.tasks ?? []));
  }, []);

  if (loading) return <div style={{ padding: "32px", color: "var(--text-muted)" }}>Loading...</div>;

  const groups = groupTasks(rows);

  return (
    <div style={{ maxWidth: "760px", margin: "0 auto", padding: "32px 24px" }}>
      {Object.entries(groups).map(([groupName, groupTasks]) => {
        if (groupTasks.length === 0 && groupName !== "Today") return null;
        const isCollapsed = collapsed[groupName];
        return (
          <div key={groupName} style={{ marginBottom: "24px" }}>
            <button
              onClick={() => setCollapsed(c => ({ ...c, [groupName]: !c[groupName] }))}
              style={{
                display: "flex", alignItems: "center", gap: "8px",
                background: "none", border: "none", cursor: "pointer", padding: "4px 0",
                marginBottom: "8px", width: "100%",
              }}
            >
              <span style={{ fontSize: "12px", color: "var(--text-muted)", transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform 0.1s" }}>▾</span>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>{groupName}</span>
              <span style={{ fontSize: "11px", color: "var(--text-muted)", background: "var(--panel-hover)", padding: "1px 6px", borderRadius: "10px" }}>{groupTasks.length}</span>
            </button>
            {!isCollapsed && (
              <div style={{ background: "var(--bg-elevated)", borderRadius: "8px", border: "1px solid var(--border)", overflow: "hidden" }}>
                {groupTasks.length === 0 ? (
                  <div style={{ padding: "16px", color: "var(--text-muted)", fontSize: "13px", textAlign: "center" }}>No tasks</div>
                ) : groupTasks.map((row, i) => {
                  const done = row.task.status === "completed";
                  return (
                    <div key={row.task.id} style={{
                      display: "flex", alignItems: "center", gap: "12px", padding: "10px 16px",
                      borderBottom: i < groupTasks.length - 1 ? "1px solid var(--border)" : "none",
                      opacity: done ? 0.6 : 1,
                    }}>
                      <input type="checkbox" checked={done} onChange={() => toggleComplete(row.task.id, row.task.status)}
                        style={{ width: "15px", height: "15px", cursor: "pointer", flexShrink: 0, accentColor: "var(--positive)" }} />
                      <span style={{ flex: 1, fontSize: "14px", color: "var(--text-primary)", textDecoration: done ? "line-through" : "none" }}>
                        {row.task.title}
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: row.projectColor, display: "inline-block" }} />
                        <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{row.projectName}</span>
                      </div>
                      <PriorityDot priority={row.task.priority} />
                      {row.task.dueDate && (
                        <span style={{ fontSize: "12px", color: isBefore(parseISO(row.task.dueDate), new Date()) && !done ? "var(--negative)" : "var(--text-muted)" }}>
                          {format(parseISO(row.task.dueDate), "MMM d")}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
