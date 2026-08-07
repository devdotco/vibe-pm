"use client";

import { useState, useEffect, useCallback } from "react";
import { format, parseISO, isBefore } from "date-fns";

interface Assignee {
  id: string;
  name: string;
}

interface TaskRow {
  task: {
    id: string;
    title: string;
    status: string;
    priority: string;
    dueDate: string | null;
    projectId: string;
    completedAt: string | null;
    sectionId: string | null;
    parentTaskId: string | null;
    createdAt: string;
  };
  projectName: string;
  projectColor: string;
  sectionName: string | null;
  commentCount: number;
  subtaskCount: number;
  assignees: Assignee[];
}

type ViewTab = "list" | "board" | "calendar" | "files";

// ── Avatar ─────────────────────────────────────────────────────────────────────

function Avatar({ name, size = 20 }: { name: string; size?: number }) {
  const initial = name.charAt(0).toUpperCase();
  const colors = ["#4f46e5", "#0d8f80", "#0f7a52", "#a6620a", "#bf2434", "#6d4be0"];
  const color = colors[name.charCodeAt(0) % colors.length]!;
  return (
    <div
      title={name}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.44,
        fontWeight: 600,
        color: "white",
        flexShrink: 0,
        border: "1.5px solid var(--bg-elevated)",
      }}
    >
      {initial}
    </div>
  );
}

// ── Task row ───────────────────────────────────────────────────────────────────

function TaskItem({
  row,
  onToggle,
  subtasks,
}: {
  row: TaskRow;
  onToggle: (id: string, status: string) => void;
  subtasks: TaskRow[];
}) {
  const [expanded, setExpanded] = useState(false);
  const done = row.task.status === "completed";
  const isOverdue =
    row.task.dueDate &&
    !done &&
    isBefore(parseISO(row.task.dueDate), new Date());

  // Recently assigned = created in last 7 days
  const isRecent =
    Date.now() - new Date(row.task.createdAt).getTime() <
    7 * 24 * 60 * 60 * 1000;

  return (
    <>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "24px 1fr 90px 72px 100px 80px 20px",
          alignItems: "center",
          gap: "0",
          padding: "0 12px",
          minHeight: "36px",
          borderBottom: "1px solid var(--border)",
          background: done ? "transparent" : undefined,
          opacity: done ? 0.55 : 1,
        }}
        onMouseEnter={(e) =>
          ((e.currentTarget as HTMLDivElement).style.background =
            "var(--panel-hover)")
        }
        onMouseLeave={(e) =>
          ((e.currentTarget as HTMLDivElement).style.background =
            done ? "transparent" : "transparent")
        }
      >
        {/* Checkbox */}
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          {isRecent && !done && (
            <div
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: "#4f46e5",
                flexShrink: 0,
                marginLeft: "-10px",
                marginRight: "4px",
              }}
            />
          )}
          <button
            onClick={() => onToggle(row.task.id, row.task.status)}
            style={{
              width: "16px",
              height: "16px",
              borderRadius: "50%",
              border: done ? "none" : "1.5px solid var(--border-strong)",
              background: done ? "var(--positive)" : "transparent",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              padding: 0,
            }}
          >
            {done && (
              <span style={{ color: "white", fontSize: "9px", fontWeight: 700 }}>
                ✓
              </span>
            )}
          </button>
        </div>

        {/* Task name */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "0 8px",
            overflow: "hidden",
          }}
        >
          {subtasks.length > 0 && (
            <button
              onClick={() => setExpanded((x) => !x)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--text-muted)",
                fontSize: "10px",
                padding: "0",
                transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
                transition: "transform 0.1s",
                flexShrink: 0,
              }}
            >
              ▶
            </button>
          )}
          <span
            style={{
              fontSize: "13px",
              color: "var(--text-primary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              textDecoration: done ? "line-through" : "none",
            }}
          >
            {row.task.title}
          </span>
          {row.commentCount > 0 && (
            <span
              style={{
                fontSize: "10px",
                color: "var(--text-muted)",
                display: "flex",
                alignItems: "center",
                gap: "2px",
                flexShrink: 0,
              }}
            >
              💬 {row.commentCount}
            </span>
          )}
          {row.subtaskCount > 0 && (
            <span
              style={{
                fontSize: "10px",
                color: "var(--text-muted)",
                flexShrink: 0,
              }}
            >
              ↳ {row.subtaskCount}
            </span>
          )}
        </div>

        {/* Due date */}
        <div
          style={{
            fontSize: "12px",
            color: isOverdue ? "var(--negative)" : "var(--text-muted)",
            padding: "0 8px",
          }}
        >
          {row.task.dueDate
            ? format(parseISO(row.task.dueDate), "MMM d")
            : ""}
        </div>

        {/* Collaborators */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "0 8px",
            gap: "2px",
          }}
        >
          {row.assignees.slice(0, 3).map((a, i) => (
            <div key={a.id} style={{ marginLeft: i > 0 ? "-6px" : "0" }}>
              <Avatar name={a.name} size={20} />
            </div>
          ))}
          {row.assignees.length > 3 && (
            <span
              style={{
                fontSize: "10px",
                color: "var(--text-muted)",
                marginLeft: "2px",
              }}
            >
              +{row.assignees.length - 3}
            </span>
          )}
        </div>

        {/* Project badge */}
        <div style={{ padding: "0 8px", overflow: "hidden" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "2px 7px",
              borderRadius: "10px",
              fontSize: "11px",
              background: `${row.projectColor}22`,
              color: row.projectColor,
              border: `1px solid ${row.projectColor}44`,
              whiteSpace: "nowrap",
              maxWidth: "100%",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            <span
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: row.projectColor,
                flexShrink: 0,
              }}
            />
            {row.projectName}
          </span>
        </div>

        {/* Visibility */}
        <div
          style={{ fontSize: "11px", color: "var(--text-muted)", padding: "0 8px" }}
        >
          Only me
        </div>

        {/* Actions stub */}
        <div />
      </div>

      {/* Subtasks */}
      {expanded &&
        subtasks.map((sub) => (
          <div
            key={sub.task.id}
            style={{
              display: "grid",
              gridTemplateColumns: "24px 1fr 90px 72px 100px 80px 20px",
              alignItems: "center",
              padding: "0 12px 0 32px",
              minHeight: "32px",
              borderBottom: "1px solid var(--border)",
              background: "var(--bg)",
              opacity: sub.task.status === "completed" ? 0.5 : 1,
            }}
          >
            <button
              onClick={() => onToggle(sub.task.id, sub.task.status)}
              style={{
                width: "14px",
                height: "14px",
                borderRadius: "50%",
                border:
                  sub.task.status === "completed"
                    ? "none"
                    : "1.5px solid var(--border-strong)",
                background:
                  sub.task.status === "completed"
                    ? "var(--positive)"
                    : "transparent",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0,
              }}
            >
              {sub.task.status === "completed" && (
                <span style={{ color: "white", fontSize: "8px", fontWeight: 700 }}>
                  ✓
                </span>
              )}
            </button>
            <span
              style={{
                fontSize: "12.5px",
                color: "var(--text-secondary)",
                padding: "0 8px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                textDecoration:
                  sub.task.status === "completed" ? "line-through" : "none",
              }}
            >
              {sub.task.title}
            </span>
            <div
              style={{ fontSize: "11px", color: "var(--text-muted)", padding: "0 8px" }}
            >
              {sub.task.dueDate
                ? format(parseISO(sub.task.dueDate), "MMM d")
                : ""}
            </div>
            <div />
            <div />
            <div />
            <div />
          </div>
        ))}
    </>
  );
}

// ── Section group ──────────────────────────────────────────────────────────────

function SectionGroup({
  name,
  rows,
  allRows,
  onToggle,
}: {
  name: string;
  rows: TaskRow[];
  allRows: TaskRow[];
  onToggle: (id: string, status: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  // Get subtasks for each row
  const getSubtasks = (taskId: string) =>
    allRows.filter((r) => r.task.parentTaskId === taskId);

  return (
    <div style={{ marginBottom: "0" }}>
      {/* Section header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "8px 12px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg)",
          position: "sticky",
          top: 0,
          zIndex: 1,
        }}
      >
        <button
          onClick={() => setCollapsed((c) => !c)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "0",
            color: "var(--text-muted)",
            fontSize: "10px",
            transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
            transition: "transform 0.1s",
          }}
        >
          ▾
        </button>
        <span
          style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}
        >
          {name}
        </span>
        <span
          style={{
            fontSize: "11px",
            color: "var(--text-muted)",
            background: "var(--panel-hover)",
            padding: "1px 6px",
            borderRadius: "10px",
          }}
        >
          {rows.length}
        </span>
      </div>

      {/* Tasks */}
      {!collapsed &&
        rows.map((row) => (
          <TaskItem
            key={row.task.id}
            row={row}
            onToggle={onToggle}
            subtasks={getSubtasks(row.task.id)}
          />
        ))}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function MyTasksPage() {
  const [rows, setRows] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ViewTab>("list");

  const loadTasks = useCallback(() => {
    fetch("/api/pm/tasks/my")
      .then((r) => r.json())
      .then((d: { tasks: TaskRow[] }) => {
        setRows(d.tasks ?? []);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const toggleComplete = useCallback(async (taskId: string, status: string) => {
    if (status === "completed") {
      await fetch(`/api/pm/tasks/${taskId}/reopen`, { method: "POST" });
    } else {
      await fetch(`/api/pm/tasks/${taskId}/complete`, { method: "POST" });
    }
    loadTasks();
  }, [loadTasks]);

  // Group by section
  const grouped = rows.reduce<Record<string, TaskRow[]>>((acc, row) => {
    const key = row.sectionName ?? "Recently assigned";
    if (!acc[key]) acc[key] = [];
    // Only top-level tasks (no parent)
    if (!row.task.parentTaskId) {
      acc[key]!.push(row);
    }
    return acc;
  }, {});

  const viewTabs: { key: ViewTab; label: string }[] = [
    { key: "list", label: "List" },
    { key: "board", label: "Board" },
    { key: "calendar", label: "Calendar" },
    { key: "files", label: "Files" },
  ];

  const toolbarBtnStyle: React.CSSProperties = {
    padding: "5px 10px",
    fontSize: "12px",
    background: "none",
    border: "1px solid var(--border)",
    borderRadius: "5px",
    cursor: "pointer",
    color: "var(--text-secondary)",
    display: "flex",
    alignItems: "center",
    gap: "4px",
    whiteSpace: "nowrap",
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* Page header */}
      <div
        style={{
          padding: "16px 24px 0",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-elevated)",
          flexShrink: 0,
        }}
      >
        {/* Title row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <h1
              style={{
                fontSize: "20px",
                fontWeight: 700,
                color: "var(--text-primary)",
              }}
            >
              My tasks
            </h1>
            <span style={{ color: "var(--text-muted)", fontSize: "14px" }}>▾</span>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button style={toolbarBtnStyle}>Share</button>
            <button style={toolbarBtnStyle}>Customize</button>
          </div>
        </div>

        {/* Tab bar + toolbar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {/* View tabs */}
          <div style={{ display: "flex", gap: "0" }}>
            {viewTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: "8px 14px",
                  fontSize: "13px",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color:
                    activeTab === tab.key
                      ? "var(--accent)"
                      : "var(--text-muted)",
                  borderBottom:
                    activeTab === tab.key
                      ? "2px solid var(--accent)"
                      : "2px solid transparent",
                  marginBottom: "-1px",
                  fontWeight: activeTab === tab.key ? 500 : 400,
                  transition: "color 0.1s",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Toolbar */}
          <div style={{ display: "flex", gap: "6px", paddingBottom: "8px" }}>
            <button
              onClick={() => (window.location.href = "/projects")}
              style={{
                padding: "5px 12px",
                fontSize: "12px",
                background: "var(--accent)",
                color: "white",
                border: "none",
                borderRadius: "5px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                fontWeight: 500,
              }}
            >
              <span style={{ fontSize: "14px" }}>+</span>
              Add task
              <span style={{ fontSize: "10px", opacity: 0.7 }}>▾</span>
            </button>
            <button style={toolbarBtnStyle}>Filter</button>
            <button style={toolbarBtnStyle}>Sort</button>
            <button style={toolbarBtnStyle}>Group</button>
            <button style={toolbarBtnStyle}>Options</button>
            <button style={toolbarBtnStyle}>🔍</button>
          </div>
        </div>
      </div>

      {/* Content area */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {activeTab === "list" && (
          <>
            {/* Column header */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "24px 1fr 90px 72px 100px 80px 20px",
                alignItems: "center",
                gap: "0",
                padding: "6px 12px",
                borderBottom: "1px solid var(--border)",
                background: "var(--bg-elevated)",
                position: "sticky",
                top: 0,
                zIndex: 2,
              }}
            >
              <div />
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "var(--text-muted)",
                  padding: "0 8px",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                Name
              </div>
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "var(--text-muted)",
                  padding: "0 8px",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                Due date
              </div>
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "var(--text-muted)",
                  padding: "0 8px",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                Assignees
              </div>
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "var(--text-muted)",
                  padding: "0 8px",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                Project
              </div>
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "var(--text-muted)",
                  padding: "0 8px",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                Visibility
              </div>
              <button
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--text-muted)",
                  fontSize: "14px",
                }}
                title="Add column"
              >
                +
              </button>
            </div>

            {loading ? (
              <div
                style={{ padding: "32px", color: "var(--text-muted)", textAlign: "center" }}
              >
                Loading...
              </div>
            ) : Object.keys(grouped).length === 0 ? (
              <div
                style={{ padding: "60px 24px", textAlign: "center", color: "var(--text-muted)" }}
              >
                <div style={{ fontSize: "32px", marginBottom: "12px" }}>✓</div>
                <div
                  style={{
                    fontSize: "15px",
                    fontWeight: 500,
                    color: "var(--text-primary)",
                    marginBottom: "6px",
                  }}
                >
                  You&apos;re all caught up!
                </div>
                <div style={{ fontSize: "13px" }}>
                  No tasks assigned to you yet.
                </div>
              </div>
            ) : (
              Object.entries(grouped).map(([sectionName, sectionRows]) => (
                <SectionGroup
                  key={sectionName}
                  name={sectionName}
                  rows={sectionRows}
                  allRows={rows}
                  onToggle={toggleComplete}
                />
              ))
            )}
          </>
        )}

        {activeTab === "board" && (
          <div style={{ padding: "16px", color: "var(--text-muted)", fontSize: "13px" }}>
            Board view: use the project kanban board for a specific project.
          </div>
        )}

        {activeTab === "calendar" && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: "12px",
              color: "var(--text-muted)",
              padding: "60px",
            }}
          >
            <div style={{ fontSize: "40px" }}>📅</div>
            <div style={{ fontSize: "15px", fontWeight: 500, color: "var(--text-primary)" }}>
              Calendar view coming soon
            </div>
          </div>
        )}

        {activeTab === "files" && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: "12px",
              color: "var(--text-muted)",
              padding: "60px",
            }}
          >
            <div style={{ fontSize: "40px" }}>📎</div>
            <div style={{ fontSize: "15px", fontWeight: 500, color: "var(--text-primary)" }}>
              Files view coming soon
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
