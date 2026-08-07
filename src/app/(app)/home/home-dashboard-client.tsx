"use client";

import Link from "next/link";
import { useState } from "react";
import { format, parseISO, isBefore } from "date-fns";
import type { TaskCard, ProjectCard, Collaborator } from "./page";

interface HomeDashboardClientProps {
  user: { id: string; name: string; email: string };
  upcomingTasks: TaskCard[];
  overdueTasks: TaskCard[];
  completedTasks: TaskCard[];
  recentProjects: ProjectCard[];
  collaborators: Collaborator[];
}

function getGreeting(name: string): string {
  const hour = new Date().getHours();
  if (hour < 12) return `Good morning, ${name.split(" ")[0]}`;
  if (hour < 18) return `Good afternoon, ${name.split(" ")[0]}`;
  return `Good evening, ${name.split(" ")[0]}`;
}

function Avatar({
  name,
  size = 28,
}: {
  name: string;
  size?: number;
}) {
  const initial = name.charAt(0).toUpperCase();
  const colors = [
    "#2f5cff",
    "#0d8f80",
    "#0f7a52",
    "#a6620a",
    "#bf2434",
    "#6d4be0",
  ];
  const color = colors[name.charCodeAt(0) % colors.length]!;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.4,
        fontWeight: 600,
        color: "white",
        flexShrink: 0,
      }}
    >
      {initial}
    </div>
  );
}

function TaskRow({ task, isLast }: { task: TaskCard; isLast: boolean }) {
  const isOverdue =
    task.dueDate && isBefore(parseISO(task.dueDate), new Date());
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "9px 14px",
        borderBottom: isLast ? "none" : "1px solid var(--border)",
      }}
    >
      <div
        style={{
          width: "15px",
          height: "15px",
          borderRadius: "50%",
          border: "1.5px solid var(--border-strong)",
          flexShrink: 0,
        }}
      />
      <span
        style={{
          flex: 1,
          fontSize: "13px",
          color: "var(--text-primary)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {task.title}
      </span>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          padding: "2px 7px",
          borderRadius: "10px",
          fontSize: "11px",
          background: `${task.projectColor}22`,
          color: task.projectColor,
          border: `1px solid ${task.projectColor}44`,
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            background: task.projectColor,
          }}
        />
        {task.projectName}
      </span>
      {task.dueDate && (
        <span
          style={{
            fontSize: "11px",
            color: isOverdue && task.status !== "completed"
              ? "var(--negative)"
              : "var(--text-muted)",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {format(parseISO(task.dueDate), "MMM d")}
        </span>
      )}
    </div>
  );
}

type TaskTab = "upcoming" | "overdue" | "completed";

export function HomeDashboardClient({
  user,
  upcomingTasks,
  overdueTasks,
  completedTasks,
  recentProjects,
  collaborators,
}: HomeDashboardClientProps) {
  const [taskTab, setTaskTab] = useState<TaskTab>("upcoming");
  const [showNewProject, setShowNewProject] = useState(false);

  const greeting = getGreeting(user.name);

  const tabs: { key: TaskTab; label: string; count?: number }[] = [
    { key: "upcoming", label: "Upcoming" },
    { key: "overdue", label: "Overdue", count: overdueTasks.length },
    { key: "completed", label: "Completed" },
  ];

  const displayTasks =
    taskTab === "upcoming"
      ? upcomingTasks
      : taskTab === "overdue"
      ? overdueTasks
      : completedTasks;

  const cardStyle: React.CSSProperties = {
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: "10px",
    overflow: "hidden",
  };

  const cardHeaderStyle: React.CSSProperties = {
    padding: "14px 16px 10px",
    borderBottom: "1px solid var(--border)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  };

  return (
    <div
      style={{
        padding: "32px 28px",
        maxWidth: "1100px",
        margin: "0 auto",
      }}
    >
      {/* Greeting */}
      <h1
        style={{
          fontSize: "28px",
          fontWeight: 700,
          color: "var(--text-primary)",
          marginBottom: "24px",
          letterSpacing: "-0.5px",
        }}
      >
        {greeting} 👋
      </h1>

      {/* Two-column grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "18px",
          marginBottom: "18px",
        }}
      >
        {/* My Tasks Widget */}
        <div style={cardStyle}>
          <div style={cardHeaderStyle}>
            <span
              style={{
                fontSize: "14px",
                fontWeight: 600,
                color: "var(--text-primary)",
              }}
            >
              My tasks
            </span>
            <Link
              href="/my-tasks"
              style={{
                fontSize: "12px",
                color: "var(--accent)",
                textDecoration: "none",
              }}
            >
              See all
            </Link>
          </div>

          {/* Tabs */}
          <div
            style={{
              display: "flex",
              borderBottom: "1px solid var(--border)",
              padding: "0 16px",
            }}
          >
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setTaskTab(tab.key)}
                style={{
                  padding: "8px 10px",
                  fontSize: "12px",
                  fontWeight: 500,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color:
                    taskTab === tab.key
                      ? "var(--accent)"
                      : "var(--text-muted)",
                  borderBottom:
                    taskTab === tab.key
                      ? "2px solid var(--accent)"
                      : "2px solid transparent",
                  marginBottom: "-1px",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span
                    style={{
                      background:
                        taskTab === tab.key
                          ? "var(--accent)"
                          : "var(--panel-hover)",
                      color: taskTab === tab.key ? "white" : "var(--text-muted)",
                      borderRadius: "10px",
                      padding: "0px 5px",
                      fontSize: "10px",
                      fontWeight: 600,
                    }}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Task list */}
          {displayTasks.length === 0 ? (
            <div
              style={{
                padding: "24px",
                textAlign: "center",
                color: "var(--text-muted)",
                fontSize: "13px",
              }}
            >
              {taskTab === "upcoming" && "No upcoming tasks. You're all clear!"}
              {taskTab === "overdue" && "No overdue tasks. Great work!"}
              {taskTab === "completed" && "No recently completed tasks."}
            </div>
          ) : (
            displayTasks.map((task, i) => (
              <TaskRow
                key={task.id}
                task={task}
                isLast={i === displayTasks.length - 1}
              />
            ))
          )}

          <div
            style={{
              padding: "8px 14px",
              borderTop: displayTasks.length > 0 ? "1px solid var(--border)" : "none",
            }}
          >
            <Link
              href="/my-tasks"
              style={{
                fontSize: "12px",
                color: "var(--text-muted)",
                textDecoration: "none",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <span style={{ fontSize: "14px", lineHeight: 1 }}>+</span>
              Create task
            </Link>
          </div>
        </div>

        {/* Projects Widget */}
        <div style={cardStyle}>
          <div style={cardHeaderStyle}>
            <span
              style={{
                fontSize: "14px",
                fontWeight: 600,
                color: "var(--text-primary)",
              }}
            >
              Projects
            </span>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <button
                onClick={() => setShowNewProject(true)}
                style={{
                  padding: "4px 10px",
                  fontSize: "12px",
                  fontWeight: 500,
                  background: "var(--accent)",
                  color: "white",
                  border: "none",
                  borderRadius: "5px",
                  cursor: "pointer",
                }}
              >
                + New project
              </button>
              <Link
                href="/projects"
                style={{
                  fontSize: "12px",
                  color: "var(--accent)",
                  textDecoration: "none",
                }}
              >
                See all
              </Link>
            </div>
          </div>

          {recentProjects.length === 0 ? (
            <div
              style={{
                padding: "24px",
                textAlign: "center",
                color: "var(--text-muted)",
                fontSize: "13px",
              }}
            >
              No projects yet. Create your first project!
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "1px",
                background: "var(--border)",
              }}
            >
              {recentProjects.map((project) => (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "10px",
                    padding: "12px 14px",
                    background: "var(--bg-elevated)",
                    textDecoration: "none",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLAnchorElement).style.background =
                      "var(--panel-hover)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLAnchorElement).style.background =
                      "var(--bg-elevated)";
                  }}
                >
                  <div
                    style={{
                      width: "30px",
                      height: "30px",
                      borderRadius: "6px",
                      background: project.color,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "14px",
                      flexShrink: 0,
                      color: "white",
                      fontWeight: 700,
                    }}
                  >
                    {project.icon ?? project.name.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ overflow: "hidden" }}>
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
                      {project.name}
                    </div>
                    <div
                      style={{
                        fontSize: "11px",
                        color: "var(--text-muted)",
                        marginTop: "2px",
                      }}
                    >
                      {project.dueSoonCount > 0
                        ? `${project.dueSoonCount} task${project.dueSoonCount !== 1 ? "s" : ""} due soon`
                        : "No tasks due soon"}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* People / Collaborators Widget */}
      {collaborators.length > 0 && (
        <div style={cardStyle}>
          <div style={cardHeaderStyle}>
            <span
              style={{
                fontSize: "14px",
                fontWeight: 600,
                color: "var(--text-primary)",
              }}
            >
              Frequent collaborators
            </span>
          </div>
          <div style={{ padding: "4px 0" }}>
            {collaborators.map((c, i) => (
              <div
                key={c.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "10px 16px",
                  borderBottom:
                    i < collaborators.length - 1
                      ? "1px solid var(--border)"
                      : "none",
                }}
              >
                <Avatar name={c.name} size={32} />
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: "13px",
                      fontWeight: 500,
                      color: "var(--text-primary)",
                    }}
                  >
                    {c.name}
                  </div>
                  <div
                    style={{
                      fontSize: "11px",
                      color: "var(--text-muted)",
                    }}
                  >
                    {c.email}
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: "12px",
                    fontSize: "12px",
                    color: "var(--text-muted)",
                  }}
                >
                  {c.overdue > 0 && (
                    <span style={{ color: "var(--negative)", fontWeight: 500 }}>
                      {c.overdue} overdue
                    </span>
                  )}
                  {c.completedThisWeek > 0 && (
                    <span style={{ color: "var(--positive)" }}>
                      {c.completedThisWeek} completed
                    </span>
                  )}
                  {c.upcoming > 0 && (
                    <span>{c.upcoming} upcoming</span>
                  )}
                  {c.overdue === 0 &&
                    c.completedThisWeek === 0 &&
                    c.upcoming === 0 && <span>No active tasks</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showNewProject && (
        <NewProjectModal onClose={() => setShowNewProject(false)} />
      )}
    </div>
  );
}

function NewProjectModal({ onClose }: { onClose: () => void }) {
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
    if (res.ok) {
      const data = await res.json() as { project: { id: string } };
      window.location.href = `/projects/${data.project.id}`;
    }
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
