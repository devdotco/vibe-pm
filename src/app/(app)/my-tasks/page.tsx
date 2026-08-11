"use client";

import { useState, useEffect, useCallback } from "react";
import { format, parseISO, isBefore, startOfDay, endOfDay, addDays } from "date-fns";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Assignee { id: string; name: string; }

interface TaskRow {
  task: {
    id: string; title: string; status: string; priority: string;
    dueDate: string | null; projectId: string; completedAt: string | null;
    sectionId: string | null; parentTaskId: string | null; createdAt: string;
  };
  projectName: string; projectColor: string; sectionName: string | null;
  commentCount: number; subtaskCount: number; attachmentCount?: number;
  assignees: Assignee[];
}

type ViewTab = "list" | "board" | "calendar" | "files";
type SortField = "default" | "dueDate" | "priority" | "title";
interface Filters { priorities: string[]; dueDates: string[]; }

// ── Constants ─────────────────────────────────────────────────────────────────

const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };
const PRIORITY_COLORS: Record<string, string> = {
  urgent: "#ef4444", high: "#f97316", medium: "#eab308", low: "#22c55e", none: "#9ca3af",
};
const GRID_COLS = "8px 22px 16px 1fr 90px 100px 140px 130px 28px";

// ── Helpers ───────────────────────────────────────────────────────────────────

function hashColor(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  const colors = ["#2f5cff", "#0d8f80", "#0f7a52", "#a6620a", "#bf2434", "#6d4be0", "#0891b2", "#059669"];
  return colors[Math.abs(h) % colors.length]!;
}

function avatarInitial(name: string): string {
  return name.charAt(0).toUpperCase();
}

// ── Checkbox ──────────────────────────────────────────────────────────────────

function Checkbox({ done, onToggle }: { done: boolean; onToggle: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onToggle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={done ? "Mark incomplete" : "Mark complete"}
      style={{
        width: "16px", height: "16px", borderRadius: "50%",
        border: done ? "none" : `2px solid ${hovered ? "#22c55e" : "var(--border-strong, #cbd5e1)"}`,
        background: done ? "#22c55e" : hovered ? "#22c55e18" : "transparent",
        cursor: "pointer", padding: 0, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "background 0.12s, border-color 0.12s",
      }}
    >
      {(done || hovered) && (
        <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
          <path d="M1 3.5L3.5 6L8 1" stroke={done ? "white" : "#22c55e"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

// ── AvatarStack ───────────────────────────────────────────────────────────────

function AvatarStack({ assignees }: { assignees: Assignee[] }) {
  if (!assignees || assignees.length === 0)
    return <span style={{ color: "var(--text-muted)", fontSize: "12px" }}>—</span>;
  const shown = assignees.slice(0, 3);
  const extra = assignees.length - shown.length;
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {shown.map((a, i) => (
        <div key={a.id} title={a.name} style={{
          width: "20px", height: "20px", borderRadius: "50%",
          background: hashColor(a.id),
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "8px", fontWeight: 700, color: "#fff",
          border: "2px solid var(--bg, #fff)",
          marginLeft: i > 0 ? "-5px" : "0",
          position: "relative", zIndex: shown.length - i,
          flexShrink: 0,
        }}>{avatarInitial(a.name)}</div>
      ))}
      {extra > 0 && (
        <div style={{
          width: "20px", height: "20px", borderRadius: "50%",
          background: "var(--panel-hover)", border: "2px solid var(--bg, #fff)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "8px", fontWeight: 600, color: "var(--text-muted)",
          marginLeft: "-5px", flexShrink: 0,
        }}>+{extra}</div>
      )}
    </div>
  );
}

// ── Filter helpers ────────────────────────────────────────────────────────────

function matchesDueFilter(dueDate: string | null, filterDue: string): boolean {
  const today = startOfDay(new Date());
  const todayEnd = endOfDay(new Date());
  const weekEnd = endOfDay(addDays(new Date(), 7));
  if (filterDue === "no_date") return !dueDate;
  if (!dueDate) return false;
  const d = parseISO(dueDate);
  if (filterDue === "today") return d >= today && d <= todayEnd;
  if (filterDue === "overdue") return isBefore(d, today);
  if (filterDue === "this_week") return d >= today && d <= weekEnd;
  return false;
}

function applyFilters(rows: TaskRow[], filters: Filters): TaskRow[] {
  return rows.filter(r => {
    if (filters.priorities.length > 0 && !filters.priorities.includes(r.task.priority)) return false;
    if (filters.dueDates.length > 0) {
      const ok = filters.dueDates.some(d => matchesDueFilter(r.task.dueDate, d));
      if (!ok) return false;
    }
    return true;
  });
}

function applySort(rows: TaskRow[], sortField: SortField, sortDir: "asc" | "desc"): TaskRow[] {
  if (sortField === "default") return [...rows];
  return [...rows].sort((a, b) => {
    let cmp = 0;
    if (sortField === "dueDate") {
      const av = a.task.dueDate ?? "9999-99-99";
      const bv = b.task.dueDate ?? "9999-99-99";
      cmp = av < bv ? -1 : av > bv ? 1 : 0;
    } else if (sortField === "priority") {
      cmp = (PRIORITY_ORDER[a.task.priority] ?? 4) - (PRIORITY_ORDER[b.task.priority] ?? 4);
    } else if (sortField === "title") {
      cmp = a.task.title.localeCompare(b.task.title);
    }
    return sortDir === "asc" ? cmp : -cmp;
  });
}

// ── Filter panel ──────────────────────────────────────────────────────────────

const DUEDATE_OPTIONS = [
  { value: "overdue", label: "Overdue" },
  { value: "today", label: "Today" },
  { value: "this_week", label: "This week" },
  { value: "no_date", label: "No date" },
];

function FilterPanel({ filters, onFilters, onClose }: {
  filters: Filters; onFilters: (f: Filters) => void; onClose: () => void;
}) {
  const togglePriority = (p: string) => {
    const arr = filters.priorities;
    onFilters({ ...filters, priorities: arr.includes(p) ? arr.filter(v => v !== p) : [...arr, p] });
  };
  const toggleDue = (d: string) => {
    const arr = filters.dueDates;
    onFilters({ ...filters, dueDates: arr.includes(d) ? arr.filter(v => v !== d) : [...arr, d] });
  };
  const hasAny = filters.priorities.length > 0 || filters.dueDates.length > 0;

  return (
    <div style={{ padding: "10px 16px", background: "var(--bg-elevated)", borderBottom: "1px solid var(--border)", display: "flex", gap: "20px", alignItems: "flex-start", flexWrap: "wrap" }}>
      <div>
        <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>Priority</div>
        <div style={{ display: "flex", gap: "4px" }}>
          {Object.keys(PRIORITY_COLORS).map(p => (
            <button key={p} onClick={() => togglePriority(p)} style={{
              padding: "2px 8px", borderRadius: "10px", fontSize: "11px", cursor: "pointer",
              border: `1px solid ${PRIORITY_COLORS[p] ?? "#9ca3af"}`,
              background: filters.priorities.includes(p) ? (PRIORITY_COLORS[p] ?? "#9ca3af") + "33" : "transparent",
              color: PRIORITY_COLORS[p] ?? "#9ca3af", textTransform: "capitalize",
            }}>{p}</button>
          ))}
        </div>
      </div>
      <div>
        <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>Due date</div>
        <div style={{ display: "flex", gap: "4px" }}>
          {DUEDATE_OPTIONS.map(o => (
            <button key={o.value} onClick={() => toggleDue(o.value)} style={{
              padding: "2px 8px", borderRadius: "10px", fontSize: "11px", cursor: "pointer",
              border: "1px solid var(--border)",
              background: filters.dueDates.includes(o.value) ? "var(--accent-subtle, #eff6ff)" : "transparent",
              color: filters.dueDates.includes(o.value) ? "var(--accent)" : "var(--text-secondary)",
            }}>{o.label}</button>
          ))}
        </div>
      </div>
      {hasAny && (
        <button onClick={() => onFilters({ priorities: [], dueDates: [] })} style={{ alignSelf: "flex-end", padding: "2px 8px", fontSize: "12px", background: "none", border: "1px solid var(--border)", borderRadius: "4px", cursor: "pointer", color: "var(--text-muted)" }}>Clear all</button>
      )}
      <button onClick={onClose} style={{ marginLeft: "auto", alignSelf: "flex-start", background: "none", border: "none", cursor: "pointer", fontSize: "16px", color: "var(--text-muted)", padding: "0" }}>×</button>
    </div>
  );
}

// ── Task row ──────────────────────────────────────────────────────────────────

function TaskItem({
  row, onToggle, subtasks,
}: {
  row: TaskRow; onToggle: (id: string, status: string) => void; subtasks: TaskRow[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const done = row.task.status === "completed";
  const isOverdue = row.task.dueDate && !done && isBefore(parseISO(row.task.dueDate), startOfDay(new Date()));
  const isNew = Date.now() - new Date(row.task.createdAt).getTime() < 24 * 60 * 60 * 1000;
  const hasSubtasks = subtasks.length > 0 || row.subtaskCount > 0;

  return (
    <>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "grid", gridTemplateColumns: GRID_COLS,
          alignItems: "center", minHeight: "36px",
          borderBottom: "1px solid var(--border)",
          background: hovered ? "var(--panel-hover)" : "transparent",
          opacity: done ? 0.55 : 1,
        }}
      >
        {/* Blue dot */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          {isNew && !done && (
            <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#2f5cff" }} />
          )}
        </div>

        {/* Checkbox */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Checkbox done={done} onToggle={() => onToggle(row.task.id, row.task.status)} />
        </div>

        {/* Expand arrow */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          {hasSubtasks && (
            <button
              onClick={() => setExpanded(x => !x)}
              style={{
                background: "none", border: "none", cursor: "pointer", padding: 0,
                color: "var(--text-muted)", fontSize: "9px", lineHeight: 1,
                transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
                transition: "transform 0.12s",
              }}
            >▶</button>
          )}
        </div>

        {/* Name */}
        <div style={{ display: "flex", alignItems: "center", gap: "5px", padding: "0 8px", overflow: "hidden" }}>
          <span style={{
            fontSize: "13px", color: "var(--text-primary)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            textDecoration: done ? "line-through" : "none", flexShrink: 1, minWidth: 0,
          }}>{row.task.title}</span>
          {row.commentCount > 0 && (
            <span style={{ fontSize: "10px", color: "var(--text-muted)", flexShrink: 0, display: "flex", alignItems: "center", gap: "2px" }}>
              💬 {row.commentCount}
            </span>
          )}
          {(row.attachmentCount ?? 0) > 0 && (
            <span style={{ fontSize: "10px", color: "var(--text-muted)", flexShrink: 0, display: "flex", alignItems: "center", gap: "2px" }}>
              📎 {row.attachmentCount}
            </span>
          )}
          {row.subtaskCount > 0 && (
            <span style={{ fontSize: "10px", color: "var(--text-muted)", flexShrink: 0 }}>↳ {row.subtaskCount}</span>
          )}
        </div>

        {/* Due date */}
        <div style={{ padding: "0 8px", fontSize: "12px", color: isOverdue ? "#ef4444" : row.task.dueDate ? "var(--text-secondary)" : "var(--text-muted)" }}>
          {row.task.dueDate ? format(parseISO(row.task.dueDate), "MMM d") : ""}
        </div>

        {/* Collaborators */}
        <div style={{ padding: "0 8px" }}>
          <AvatarStack assignees={row.assignees} />
        </div>

        {/* Project badge */}
        <div style={{ padding: "0 8px", overflow: "hidden" }}>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: "4px",
            padding: "2px 7px", borderRadius: "10px", fontSize: "11px",
            background: `${row.projectColor}22`, color: row.projectColor,
            border: `1px solid ${row.projectColor}44`,
            maxWidth: "128px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: row.projectColor, flexShrink: 0 }} />
            {row.projectName}
          </span>
        </div>

        {/* Visibility */}
        <div style={{ padding: "0 8px", fontSize: "11px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "4px" }}>
          <span>🔒</span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Only me</span>
        </div>

        {/* More */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          {hovered && (
            <button style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: "13px", padding: 0 }}>···</button>
          )}
        </div>
      </div>

      {/* Subtask rows */}
      {expanded && subtasks.map(sub => (
        <div key={sub.task.id} style={{
          display: "grid", gridTemplateColumns: GRID_COLS,
          alignItems: "center", minHeight: "32px",
          borderBottom: "1px solid var(--border)",
          paddingLeft: "28px",
          opacity: sub.task.status === "completed" ? 0.5 : 1,
          background: "transparent",
        }}>
          <div />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Checkbox done={sub.task.status === "completed"} onToggle={() => onToggle(sub.task.id, sub.task.status)} />
          </div>
          <div />
          <div style={{ display: "flex", alignItems: "center", gap: "5px", padding: "0 8px", overflow: "hidden" }}>
            <span style={{
              fontSize: "12.5px", color: "var(--text-secondary)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              textDecoration: sub.task.status === "completed" ? "line-through" : "none",
              minWidth: 0,
            }}>{sub.task.title}</span>
          </div>
          <div style={{ padding: "0 8px", fontSize: "11px", color: "var(--text-muted)" }}>
            {sub.task.dueDate ? format(parseISO(sub.task.dueDate), "MMM d") : ""}
          </div>
          <div /><div /><div /><div />
        </div>
      ))}
    </>
  );
}

// ── Section group ─────────────────────────────────────────────────────────────

function SectionGroup({
  name, rows, allRows, onToggle,
}: {
  name: string; rows: TaskRow[]; allRows: TaskRow[];
  onToggle: (id: string, status: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const getSubtasks = (taskId: string) => allRows.filter(r => r.task.parentTaskId === taskId);

  return (
    <div>
      <div style={{
        display: "flex", alignItems: "center", gap: "8px",
        padding: "5px 12px 5px 8px",
        background: "var(--bg-elevated)",
        position: "sticky", top: "30px", zIndex: 9,
        borderBottom: "1px solid var(--border)",
      }}>
        <button
          onClick={() => setCollapsed(c => !c)}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: "11px", padding: "0 2px", flexShrink: 0, transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform 0.1s" }}
        >▾</button>
        <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>{name}</span>
        <span style={{ fontSize: "11px", color: "var(--text-muted)", background: "var(--panel-hover)", padding: "1px 6px", borderRadius: "10px" }}>
          {rows.filter(r => r.task.status !== "completed").length}
        </span>
      </div>
      {!collapsed && rows.map(row => (
        <TaskItem key={row.task.id} row={row} onToggle={onToggle} subtasks={getSubtasks(row.task.id)} />
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MyTasksPage() {
  const [rows, setRows] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ViewTab>("list");
  const [sortField, setSortField] = useState<SortField>("default");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filters, setFilters] = useState<Filters>({ priorities: [], dueDates: [] });
  const [showFilter, setShowFilter] = useState(false);
  const [showSort, setShowSort] = useState(false);

  const loadTasks = useCallback(() => {
    fetch("/api/pm/tasks/my")
      .then(r => r.json())
      .then((d: { tasks: TaskRow[] }) => { setRows(d.tasks ?? []); setLoading(false); });
  }, []);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  const toggleComplete = useCallback(async (taskId: string, status: string) => {
    if (status === "completed") {
      await fetch(`/api/pm/tasks/${taskId}/reopen`, { method: "POST" });
    } else {
      await fetch(`/api/pm/tasks/${taskId}/complete`, { method: "POST" });
    }
    loadTasks();
  }, [loadTasks]);

  // Compute displayed rows: top-level only, filtered, sorted
  const topLevel = rows.filter(r => !r.task.parentTaskId);
  const filtered = applyFilters(topLevel, filters);
  const sorted = applySort(filtered, sortField, sortDir);

  // Group by section
  const grouped = sorted.reduce<Record<string, TaskRow[]>>((acc, row) => {
    const key = row.sectionName ?? "Recently assigned";
    if (!acc[key]) acc[key] = [];
    acc[key]!.push(row);
    return acc;
  }, {});

  const viewTabs: { key: ViewTab; label: string }[] = [
    { key: "list", label: "List" },
    { key: "board", label: "Board" },
    { key: "calendar", label: "Calendar" },
    { key: "files", label: "Files" },
  ];

  const SORT_OPT: { label: string; value: SortField }[] = [
    { label: "Default", value: "default" },
    { label: "Due date", value: "dueDate" },
    { label: "Priority", value: "priority" },
    { label: "Name (A–Z)", value: "title" },
  ];

  const tbtn = (active?: boolean): React.CSSProperties => ({
    padding: "5px 10px", fontSize: "12px",
    background: active ? "var(--accent-subtle, #eff6ff)" : "none",
    border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
    borderRadius: "5px", cursor: "pointer",
    color: active ? "var(--accent)" : "var(--text-secondary)",
    display: "flex", alignItems: "center", gap: "4px", whiteSpace: "nowrap",
  });

  const hasActiveFilter = filters.priorities.length > 0 || filters.dueDates.length > 0;
  const hasActiveSort = sortField !== "default";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Page header */}
      <div style={{ padding: "16px 24px 0", borderBottom: "1px solid var(--border)", background: "var(--bg-elevated)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <h1 style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-primary)" }}>My tasks</h1>
            <span style={{ color: "var(--text-muted)", fontSize: "14px" }}>▾</span>
          </div>
        </div>

        {/* Tab bar + toolbar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: "0" }}>
            {viewTabs.map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
                padding: "8px 14px", fontSize: "13px", background: "none", border: "none", cursor: "pointer",
                color: activeTab === tab.key ? "var(--accent)" : "var(--text-muted)",
                borderBottom: activeTab === tab.key ? "2px solid var(--accent)" : "2px solid transparent",
                marginBottom: "-1px", fontWeight: activeTab === tab.key ? 500 : 400,
              }}>{tab.label}</button>
            ))}
          </div>

          {/* Toolbar */}
          <div style={{ display: "flex", gap: "4px", paddingBottom: "8px", position: "relative" }}>
            <button onClick={() => (window.location.href = "/projects")} style={{ padding: "5px 12px", fontSize: "12px", background: "var(--accent)", color: "white", border: "none", borderRadius: "5px", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", fontWeight: 500 }}>
              <span style={{ fontSize: "14px" }}>+</span> Add task <span style={{ fontSize: "10px", opacity: 0.7 }}>▾</span>
            </button>
            <button onClick={() => setShowFilter(f => !f)} style={tbtn(hasActiveFilter || showFilter)}>
              Filter{hasActiveFilter ? ` (${filters.priorities.length + filters.dueDates.length})` : ""}
            </button>
            <div style={{ position: "relative" }}>
              <button onClick={() => setShowSort(s => !s)} style={tbtn(hasActiveSort)}>
                Sort{hasActiveSort ? " ▲" : ""}
              </button>
              {showSort && (
                <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 300, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "8px", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", minWidth: "160px", padding: "4px" }}>
                  {SORT_OPT.map(o => (
                    <button key={o.value} onClick={() => {
                      if (sortField === o.value && o.value !== "default") {
                        setSortDir(d => d === "asc" ? "desc" : "asc");
                      } else {
                        setSortField(o.value); setSortDir("asc");
                      }
                      setShowSort(false);
                    }} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      width: "100%", padding: "7px 12px", background: "none", border: "none",
                      cursor: "pointer", fontSize: "13px", borderRadius: "4px",
                      color: sortField === o.value ? "var(--accent)" : "var(--text-primary)",
                    }}>
                      {o.label}
                      {sortField === o.value && o.value !== "default" && (
                        <span style={{ fontSize: "10px" }}>{sortDir === "asc" ? "▲" : "▼"}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button style={tbtn()}>Group</button>
            <button style={tbtn()}>Options</button>
            <button style={tbtn()}>🔍</button>
          </div>
        </div>
      </div>

      {/* Filter panel */}
      {showFilter && activeTab === "list" && (
        <FilterPanel filters={filters} onFilters={setFilters} onClose={() => setShowFilter(false)} />
      )}

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {activeTab === "list" && (
          <>
            {/* Column headers */}
            <div style={{
              display: "grid", gridTemplateColumns: GRID_COLS,
              alignItems: "center", minHeight: "30px",
              borderBottom: "1px solid var(--border)",
              background: "var(--bg-elevated)",
              position: "sticky", top: 0, zIndex: 10,
            }}>
              <div />
              <div />
              <div />
              {[
                { label: "Name", field: "title" as SortField },
                { label: "Due date", field: "dueDate" as SortField },
                { label: "Collaborators" },
                { label: "Project" },
                { label: "Task visibility" },
              ].map(col => (
                <div
                  key={col.label}
                  onClick={col.field ? () => {
                    if (sortField === col.field) setSortDir(d => d === "asc" ? "desc" : "asc");
                    else { setSortField(col.field!); setSortDir("asc"); }
                  } : undefined}
                  style={{
                    fontSize: "11px", fontWeight: 600, color: "var(--text-muted)",
                    textTransform: "uppercase", letterSpacing: "0.04em",
                    padding: "0 8px", cursor: col.field ? "pointer" : "default",
                    userSelect: "none", display: "flex", alignItems: "center", gap: "3px",
                    whiteSpace: "nowrap",
                  }}
                >
                  {col.label}
                  {col.field && sortField === col.field && (
                    <span style={{ fontSize: "9px" }}>{sortDir === "asc" ? "▲" : "▼"}</span>
                  )}
                </div>
              ))}
              <button style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: "14px", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }} title="Add column">+</button>
            </div>

            {loading ? (
              <div style={{ padding: "32px", color: "var(--text-muted)", textAlign: "center" }}>Loading...</div>
            ) : Object.keys(grouped).length === 0 ? (
              <div style={{ padding: "60px 24px", textAlign: "center", color: "var(--text-muted)" }}>
                <div style={{ fontSize: "32px", marginBottom: "12px" }}>✓</div>
                <div style={{ fontSize: "15px", fontWeight: 500, color: "var(--text-primary)", marginBottom: "6px" }}>
                  {hasActiveFilter ? "No tasks match filters" : "You're all caught up!"}
                </div>
                <div style={{ fontSize: "13px" }}>
                  {hasActiveFilter ? "Try clearing your filters." : "No tasks assigned to you yet."}
                </div>
              </div>
            ) : (
              Object.entries(grouped).map(([sectionName, sectionRows]) => (
                <SectionGroup
                  key={sectionName} name={sectionName}
                  rows={sectionRows} allRows={rows}
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
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "12px", color: "var(--text-muted)", padding: "60px" }}>
            <div style={{ fontSize: "40px" }}>📅</div>
            <div style={{ fontSize: "15px", fontWeight: 500, color: "var(--text-primary)" }}>Calendar view coming soon</div>
          </div>
        )}

        {activeTab === "files" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "12px", color: "var(--text-muted)", padding: "60px" }}>
            <div style={{ fontSize: "40px" }}>📎</div>
            <div style={{ fontSize: "15px", fontWeight: 500, color: "var(--text-primary)" }}>Files view coming soon</div>
          </div>
        )}
      </div>
    </div>
  );
}
