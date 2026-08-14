"use client";
import { useState, useRef, useEffect, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Section { id: string; name: string; position: number; color?: string | null; }
interface Assignee { id: string; name: string; email: string; }
interface Task {
  id: string; title: string; status: string; priority: string;
  dueDate: string | null; assigneeId: string | null; sectionId: string | null;
  position: number; labels: string[]; completedAt: string | null;
  assignees?: Assignee[]; subtaskCount?: number; parentTaskId?: string | null;
  commentCount?: number; attachmentCount?: number; createdAt?: string; updatedAt?: string;
}
interface ProjectInfo { name: string; color: string; }
interface ProjectListViewProps {
  projectId: string;
  project?: ProjectInfo | null;
  sections: Section[];
  tasks: Task[];
  setSections: (s: Section[]) => void;
  setTasks: (t: Task[]) => void;
  onTaskClick: (id: string) => void;
  activeTaskId?: string | null;
}
type SortField = "position" | "dueDate" | "priority" | "title" | "createdAt" | "updatedAt";
type GroupBy = "section" | "assignee" | "priority" | "status";
interface ColVis { dueDate: boolean; collaborators: boolean; projects: boolean; visibility: boolean; }
interface Filters { priorities: string[]; dueDates: string[]; hiddenSections: string[]; assignees: string[]; completion: "all" | "incomplete" | "complete"; }
interface TaskGroup { key: string; label: string; tasks: Task[]; sectionId?: string; }

// ── Constants ─────────────────────────────────────────────────────────────────

const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };
const PRIORITY_COLORS: Record<string, string> = {
  urgent: "#ef4444", high: "#f97316", medium: "#eab308", low: "#22c55e", none: "#9ca3af",
};
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function avatarInitials(a: Assignee): string {
  const parts = (a.name || a.email).trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
  return (parts[0]![0] ?? "?").toUpperCase();
}

function hashColor(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  const colors = ["#2f5cff", "#0891b2", "#059669", "#d97706", "#7c3aed", "#db2777", "#0284c7", "#16a34a"];
  return colors[Math.abs(h) % colors.length]!;
}

function fmtDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isOverdue(d: string | null, done: boolean): boolean {
  if (!d || done) return false;
  return new Date(d + "T23:59:59") < new Date();
}


function buildGridCols(cols: ColVis): string {
  return [
    "8px",
    "22px",
    "16px",
    "1fr",
    cols.dueDate ? "90px" : null,
    cols.collaborators ? "130px" : null,
    cols.projects ? "140px" : null,
    cols.visibility ? "130px" : null,
    "28px",
  ].filter(Boolean).join(" ");
}

// ── Checkbox ──────────────────────────────────────────────────────────────────

function Checkbox({ done, onToggle }: { done: boolean; onToggle: (e: React.MouseEvent) => void }) {
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
        <div key={a.id} title={a.name || a.email} style={{
          width: "20px", height: "20px", borderRadius: "50%",
          background: hashColor(a.id),
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "8px", fontWeight: 700, color: "#fff",
          border: "2px solid var(--bg, #fff)",
          marginLeft: i > 0 ? "-5px" : "0",
          position: "relative", zIndex: shown.length - i,
          flexShrink: 0,
        }}>
          {avatarInitials(a)}
        </div>
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

// ── ProjectBadge ──────────────────────────────────────────────────────────────

function ProjectBadge({ name, color }: { name: string; color: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "4px",
      padding: "2px 7px", borderRadius: "10px", fontSize: "11px",
      background: color + "22", color, border: `1px solid ${color}44`,
      maxWidth: "128px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      flexShrink: 0,
    }}>
      <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: color, flexShrink: 0 }} />
      {name}
    </span>
  );
}

// ── Column header ─────────────────────────────────────────────────────────────

function ColumnHeader({
  gridCols, cols, sortField, sortDir, onSort,
}: {
  gridCols: string; cols: ColVis; sortField: SortField;
  sortDir: "asc" | "desc"; onSort: (f: SortField) => void;
}) {
  const hdr = (label: string, field?: SortField): React.ReactNode => (
    <div
      onClick={field ? () => onSort(field) : undefined}
      style={{
        fontSize: "11px", fontWeight: 600, color: "var(--text-muted)",
        textTransform: "uppercase", letterSpacing: "0.04em",
        padding: "0 8px", cursor: field ? "pointer" : "default",
        userSelect: "none", display: "flex", alignItems: "center", gap: "3px",
        whiteSpace: "nowrap", overflow: "hidden",
      }}
    >
      {label}
      {field && sortField === field && (
        <span style={{ fontSize: "9px" }}>{sortDir === "asc" ? "▲" : "▼"}</span>
      )}
    </div>
  );

  return (
    <div style={{
      display: "grid", gridTemplateColumns: gridCols,
      alignItems: "center", minHeight: "30px",
      borderBottom: "1px solid var(--border)",
      background: "var(--bg-elevated)",
      position: "sticky", top: 0, zIndex: 10,
      flexShrink: 0,
    }}>
      <div />
      <div />
      <div />
      {hdr("Name", "title")}
      {cols.dueDate && hdr("Due date", "dueDate")}
      {cols.collaborators && hdr("Collaborators")}
      {cols.projects && hdr("Projects")}
      {cols.visibility && hdr("Task visibility")}
      <button
        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: "14px", padding: "0", display: "flex", alignItems: "center", justifyContent: "center" }}
        title="Add column"
      >+</button>
    </div>
  );
}

// ── Filter panel ──────────────────────────────────────────────────────────────

const DUEDATE_OPTIONS = [
  { value: "overdue", label: "Overdue" },
  { value: "today", label: "Today" },
  { value: "this_week", label: "This week" },
  { value: "no_date", label: "No date" },
];

const ALL_SECTION_NAMES = ["Backlog", "To Do", "In Progress", "In Review", "Done"];

function FilterPanel({ filters, sections, taskAssignees, onFilters, onClose }: {
  filters: Filters; sections: Section[]; taskAssignees: Assignee[];
  onFilters: (f: Filters) => void; onClose: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [assigneeSearch, setAssigneeSearch] = useState("");

  const togglePriority = (p: string) => {
    const arr = filters.priorities;
    onFilters({ ...filters, priorities: arr.includes(p) ? arr.filter(v => v !== p) : [...arr, p] });
    setSaved(false);
  };
  const toggleDue = (d: string) => {
    const arr = filters.dueDates;
    onFilters({ ...filters, dueDates: arr.includes(d) ? arr.filter(v => v !== d) : [...arr, d] });
    setSaved(false);
  };
  const toggleSection = (name: string) => {
    const arr = filters.hiddenSections;
    onFilters({ ...filters, hiddenSections: arr.includes(name) ? arr.filter(v => v !== name) : [...arr, name] });
    setSaved(false);
  };
  const toggleAssignee = (id: string) => {
    const arr = filters.assignees;
    onFilters({ ...filters, assignees: arr.includes(id) ? arr.filter(v => v !== id) : [...arr, id] });
  };

  const hasAny = filters.priorities.length > 0 || filters.dueDates.length > 0
    || filters.hiddenSections.length > 0 || filters.assignees.length > 0
    || filters.completion !== "all";

  const sectionNames = sections.length > 0
    ? [...new Set([...sections.map(s => s.name), ...ALL_SECTION_NAMES])]
    : ALL_SECTION_NAMES;

  const visibleAssignees = taskAssignees.filter(a =>
    !assigneeSearch || a.name.toLowerCase().includes(assigneeSearch.toLowerCase())
      || a.email.toLowerCase().includes(assigneeSearch.toLowerCase())
  );

  const saveDefaults = async () => {
    setSaving(true);
    await fetch("/api/pm/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hiddenSections: filters.hiddenSections }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const labelStyle: React.CSSProperties = {
    fontSize: "11px", fontWeight: 600, color: "var(--text-muted)",
    textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px",
  };
  const pill = (active: boolean, color?: string): React.CSSProperties => ({
    padding: "2px 8px", borderRadius: "10px", fontSize: "11px", cursor: "pointer",
    border: `1px solid ${active ? (color ?? "var(--accent)") : "var(--border)"}`,
    background: active ? (color ? color + "33" : "var(--accent-subtle, rgba(47,92,255,0.08))") : "transparent",
    color: active ? (color ?? "var(--accent)") : "var(--text-secondary)",
    whiteSpace: "nowrap" as const,
  });

  return (
    <div style={{
      padding: "12px 16px", background: "var(--bg-elevated)",
      borderBottom: "1px solid var(--border)",
      display: "flex", gap: "20px", alignItems: "flex-start", flexWrap: "wrap",
    }}>
      {/* Completion */}
      <div>
        <div style={labelStyle}>Completion</div>
        <div style={{ display: "flex", gap: "4px" }}>
          {(["all", "incomplete", "complete"] as const).map(v => (
            <button key={v} onClick={() => onFilters({ ...filters, completion: v })} style={pill(filters.completion === v)}>
              {v === "all" ? "All" : v === "incomplete" ? "Incomplete" : "Complete"}
            </button>
          ))}
        </div>
      </div>

      {/* Assignee */}
      <div>
        <div style={labelStyle}>Assignee</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
          <input
            value={assigneeSearch}
            onChange={e => setAssigneeSearch(e.target.value)}
            placeholder="Search name or email…"
            style={{
              padding: "3px 8px", border: "1px solid var(--border)", borderRadius: "6px",
              fontSize: "11px", background: "var(--bg)", color: "var(--text-primary)",
              outline: "none", width: "160px",
            }}
          />
          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", maxWidth: "300px", maxHeight: "80px", overflowY: "auto" }}>
            {visibleAssignees.length === 0 && (
              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                {taskAssignees.length === 0 ? "No assignees" : "No match"}
              </span>
            )}
            {visibleAssignees.map(a => {
              const active = filters.assignees.includes(a.id);
              return (
                <button key={a.id} onClick={() => toggleAssignee(a.id)} title={a.email} style={pill(active)}>
                  {a.name || a.email}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Priority */}
      <div>
        <div style={labelStyle}>Priority</div>
        <div style={{ display: "flex", gap: "4px" }}>
          {Object.keys(PRIORITY_COLORS).map(p => (
            <button key={p} onClick={() => togglePriority(p)} style={pill(filters.priorities.includes(p), PRIORITY_COLORS[p])}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Due date */}
      <div>
        <div style={labelStyle}>Due date</div>
        <div style={{ display: "flex", gap: "4px" }}>
          {DUEDATE_OPTIONS.map(o => (
            <button key={o.value} onClick={() => toggleDue(o.value)} style={pill(filters.dueDates.includes(o.value))}>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* Hide sections */}
      <div>
        <div style={labelStyle}>Hide sections</div>
        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
          {sectionNames.map(name => (
            <button key={name} onClick={() => toggleSection(name)} style={pill(filters.hiddenSections.includes(name))}>
              {name}
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "flex-start", gap: "6px" }}>
        {filters.hiddenSections.length > 0 && (
          <button
            onClick={saveDefaults}
            disabled={saving}
            title="Save section visibility as your default for all projects"
            style={{
              alignSelf: "flex-start", padding: "2px 10px", fontSize: "11px",
              background: saved ? "#0f7a5222" : "var(--accent-subtle, rgba(47,92,255,0.08))",
              border: `1px solid ${saved ? "#0f7a52" : "var(--accent)"}`,
              borderRadius: "4px", cursor: "pointer",
              color: saved ? "#0f7a52" : "var(--accent)", fontWeight: 500,
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saved ? "✓ Saved" : saving ? "Saving…" : "Save as default"}
          </button>
        )}
        {hasAny && (
          <button onClick={() => { onFilters({ priorities: [], dueDates: [], hiddenSections: [], assignees: [], completion: "all" }); setSaved(false); }} style={{
            alignSelf: "flex-start", padding: "2px 8px", fontSize: "11px",
            background: "none", border: "1px solid var(--border)", borderRadius: "4px",
            cursor: "pointer", color: "var(--text-muted)",
          }}>Clear all</button>
        )}
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "16px", color: "var(--text-muted)", padding: "0" }}>×</button>
      </div>
    </div>
  );
}

// ── Toolbar ───────────────────────────────────────────────────────────────────

function ListToolbar({
  sortField, sortDir, onSort, groupBy, onGroup,
  cols, onToggleCol, filters, onFilters, sections, taskAssignees, onAddTask,
}: {
  sortField: SortField; sortDir: "asc" | "desc"; onSort: (f: SortField) => void;
  groupBy: GroupBy; onGroup: (g: GroupBy) => void;
  cols: ColVis; onToggleCol: (k: keyof ColVis) => void;
  filters: Filters; onFilters: (f: Filters) => void;
  sections: Section[]; taskAssignees: Assignee[];
  onAddTask: () => void;
}) {
  const [showSort, setShowSort] = useState(false);
  const [showGroup, setShowGroup] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setShowSort(false); setShowGroup(false); setShowOptions(false);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const hasActiveSort = sortField !== "position";
  const hasActiveGroup = groupBy !== "section";
  const activeFilterCount = filters.priorities.length + filters.dueDates.length + filters.hiddenSections.length
    + filters.assignees.length + (filters.completion !== "all" ? 1 : 0);
  const hasActiveFilter = activeFilterCount > 0;

  const tbtn = (active?: boolean): React.CSSProperties => ({
    padding: "5px 10px", fontSize: "12px",
    background: active ? "var(--accent-subtle, #eff6ff)" : "none",
    border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
    borderRadius: "5px", cursor: "pointer",
    color: active ? "var(--accent)" : "var(--text-secondary)",
    display: "flex", alignItems: "center", gap: "4px", whiteSpace: "nowrap",
  });

  const SORT_OPT: { label: string; value: SortField }[] = [
    { label: "Default (position)", value: "position" },
    { label: "Due date", value: "dueDate" },
    { label: "Priority", value: "priority" },
    { label: "Name (A–Z)", value: "title" },
    { label: "Date created", value: "createdAt" },
    { label: "Last modified", value: "updatedAt" },
  ];
  const GROUP_OPT: { label: string; value: GroupBy }[] = [
    { label: "Section", value: "section" },
    { label: "Assignee", value: "assignee" },
    { label: "Priority", value: "priority" },
    { label: "Status", value: "status" },
  ];
  const COL_OPT: { label: string; key: keyof ColVis }[] = [
    { label: "Due date", key: "dueDate" },
    { label: "Collaborators", key: "collaborators" },
    { label: "Projects", key: "projects" },
    { label: "Task visibility", key: "visibility" },
  ];

  const dropStyle: React.CSSProperties = {
    position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 300,
    background: "var(--bg-elevated)", border: "1px solid var(--border)",
    borderRadius: "8px", boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
    minWidth: "180px", padding: "4px",
  };
  const dropItemStyle = (active: boolean): React.CSSProperties => ({
    display: "flex", alignItems: "center", justifyContent: "space-between",
    width: "100%", padding: "7px 12px", background: "none", border: "none",
    cursor: "pointer", fontSize: "13px", borderRadius: "4px",
    color: active ? "var(--accent)" : "var(--text-primary)",
  });

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 16px", borderBottom: "1px solid var(--border)", background: "var(--bg)", gap: "8px", flexShrink: 0 }}>
        <button onClick={onAddTask} style={{ padding: "5px 12px", fontSize: "12px", background: "var(--accent)", color: "white", border: "none", borderRadius: "5px", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", fontWeight: 500 }}>
          <span style={{ fontSize: "14px" }}>+</span> Add task <span style={{ fontSize: "10px", opacity: 0.7 }}>▾</span>
        </button>

        <div ref={dropRef} style={{ display: "flex", gap: "4px", alignItems: "center" }}>
          <button onClick={() => setShowFilter(f => !f)} style={tbtn(hasActiveFilter || showFilter)}>
            Filter{hasActiveFilter ? ` (${activeFilterCount})` : ""}
          </button>

          <div style={{ position: "relative" }}>
            <button onClick={() => { setShowSort(s => !s); setShowGroup(false); setShowOptions(false); }} style={tbtn(hasActiveSort)}>
              Sort{hasActiveSort ? " ▲" : ""}
            </button>
            {showSort && (
              <div style={dropStyle}>
                {SORT_OPT.map(o => (
                  <button key={o.value} onClick={() => { onSort(o.value); setShowSort(false); }} style={dropItemStyle(sortField === o.value)}>
                    {o.label}
                    {sortField === o.value && <span style={{ fontSize: "10px" }}>{sortDir === "asc" ? "▲" : "▼"}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={{ position: "relative" }}>
            <button onClick={() => { setShowGroup(g => !g); setShowSort(false); setShowOptions(false); }} style={tbtn(hasActiveGroup)}>
              Group{hasActiveGroup ? `: ${groupBy}` : ""}
            </button>
            {showGroup && (
              <div style={dropStyle}>
                {GROUP_OPT.map(o => (
                  <button key={o.value} onClick={() => { onGroup(o.value); setShowGroup(false); }} style={dropItemStyle(groupBy === o.value)}>
                    {o.label}
                    {groupBy === o.value && <span>✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={{ position: "relative" }}>
            <button onClick={() => { setShowOptions(o => !o); setShowSort(false); setShowGroup(false); }} style={tbtn()}>Options</button>
            {showOptions && (
              <div style={{ ...dropStyle, minWidth: "200px", padding: "10px 14px" }}>
                <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "8px" }}>Columns</div>
                {COL_OPT.map(o => (
                  <label key={o.key} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "4px 0", cursor: "pointer", fontSize: "13px", color: "var(--text-primary)" }}>
                    <input type="checkbox" checked={cols[o.key]} onChange={() => onToggleCol(o.key)} style={{ accentColor: "var(--accent)" }} />
                    {o.label}
                  </label>
                ))}
                <div style={{ borderTop: "1px solid var(--border)", marginTop: "8px", paddingTop: "8px" }}>
                  <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>+ Add custom field (coming soon)</span>
                </div>
              </div>
            )}
          </div>

          <button style={tbtn()}>🔍</button>
        </div>
      </div>

      {showFilter && (
        <FilterPanel filters={filters} sections={sections} taskAssignees={taskAssignees} onFilters={onFilters} onClose={() => setShowFilter(false)} />
      )}
    </>
  );
}

// ── BulkActionBar ─────────────────────────────────────────────────────────────

interface BulkBarProps {
  selectedIds: string[];
  orgUsers: Assignee[];
  sections: Section[];
  onAction: (action: string, value?: string) => void;
  onClear: () => void;
}

function BulkActionBar({ selectedIds, orgUsers, sections, onAction, onClear }: BulkBarProps) {
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

  const btnStyle: React.CSSProperties = {
    padding: "5px 12px", fontSize: "12px", fontWeight: 500, borderRadius: "6px",
    border: "1px solid rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.12)",
    color: "white", cursor: "pointer", whiteSpace: "nowrap",
  };
  const dangerStyle: React.CSSProperties = { ...btnStyle, background: "rgba(239,68,68,0.3)", border: "1px solid rgba(239,68,68,0.5)" };

  return (
    <div style={{
      position: "fixed", bottom: "24px", left: "50%", transform: "translateX(-50%)",
      background: "var(--text-primary)", color: "white",
      borderRadius: "10px", padding: "10px 16px",
      display: "flex", alignItems: "center", gap: "8px",
      boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
      zIndex: 500, userSelect: "none",
    }} ref={popRef}>
      <span style={{ fontSize: "13px", fontWeight: 600, marginRight: "6px" }}>
        {selectedIds.length} selected
      </span>

      <button style={btnStyle} onClick={() => onAction('complete')}>Complete</button>

      <div style={{ position: "relative" }}>
        <button style={btnStyle} onClick={() => { setShowAssign(v => !v); setShowPriority(false); setShowMove(false); }}>
          Assign ▾
        </button>
        {showAssign && (
          <div style={{ position: "absolute", bottom: "calc(100% + 6px)", left: 0, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "8px", boxShadow: "0 8px 24px rgba(0,0,0,0.2)", minWidth: "180px", maxHeight: "240px", overflowY: "auto", padding: "4px" }}>
            {orgUsers.map(u => (
              <button key={u.id} onClick={() => { onAction('assign', u.id); setShowAssign(false); }}
                style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%", padding: "7px 10px", background: "none", border: "none", cursor: "pointer", color: "var(--text-primary)", fontSize: "13px", borderRadius: "4px" }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--panel-hover)")}
                onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                {u.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ position: "relative" }}>
        <button style={btnStyle} onClick={() => { setShowPriority(v => !v); setShowAssign(false); setShowMove(false); }}>
          Priority ▾
        </button>
        {showPriority && (
          <div style={{ position: "absolute", bottom: "calc(100% + 6px)", left: 0, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "8px", boxShadow: "0 8px 24px rgba(0,0,0,0.2)", minWidth: "140px", padding: "4px" }}>
            {['urgent', 'high', 'medium', 'low', 'none'].map(p => (
              <button key={p} onClick={() => { onAction('change_priority', p); setShowPriority(false); }}
                style={{ display: "block", width: "100%", padding: "7px 10px", background: "none", border: "none", cursor: "pointer", color: PRIORITY_COLORS[p] ?? "#9ca3af", fontSize: "13px", textAlign: "left", textTransform: "capitalize", borderRadius: "4px" }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--panel-hover)")}
                onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                {p}
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ position: "relative" }}>
        <button style={btnStyle} onClick={() => { setShowMove(v => !v); setShowAssign(false); setShowPriority(false); }}>
          Move ▾
        </button>
        {showMove && (
          <div style={{ position: "absolute", bottom: "calc(100% + 6px)", left: 0, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "8px", boxShadow: "0 8px 24px rgba(0,0,0,0.2)", minWidth: "160px", maxHeight: "240px", overflowY: "auto", padding: "4px" }}>
            {sections.map(s => (
              <button key={s.id} onClick={() => { onAction('move_section', s.id); setShowMove(false); }}
                style={{ display: "block", width: "100%", padding: "7px 10px", background: "none", border: "none", cursor: "pointer", color: "var(--text-primary)", fontSize: "13px", textAlign: "left", borderRadius: "4px" }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--panel-hover)")}
                onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                {s.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <button style={dangerStyle} onClick={() => { if (confirm(`Delete ${selectedIds.length} tasks?`)) onAction('delete'); }}>Delete</button>
      <button style={{ ...btnStyle, background: "transparent", border: "1px solid rgba(255,255,255,0.15)" }} onClick={onClear}>Clear</button>
    </div>
  );
}

// ── TaskRow ───────────────────────────────────────────────────────────────────

interface TaskRowProps {
  task: Task;
  projectId: string;
  project?: ProjectInfo | null;
  depth: number;
  cols: ColVis;
  gridCols: string;
  subtasks: Task[];
  expanded: boolean;
  onToggleExpand: () => void;
  onToggleComplete: (task: Task) => void;
  onTaskClick: (id: string) => void;
  addingSubtaskFor: string | null;
  setAddingSubtaskFor: (id: string | null) => void;
  onAddSubtask: (parentId: string, title: string) => Promise<void>;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  anySelected: boolean;
  activeTaskId?: string | null;
}

function TaskRow({
  task, project, depth, cols, gridCols,
  subtasks, expanded, onToggleExpand, onToggleComplete, onTaskClick,
  addingSubtaskFor, setAddingSubtaskFor, onAddSubtask, projectId,
  selected, onToggleSelect, anySelected, activeTaskId,
}: TaskRowProps) {
  const [hovered, setHovered] = useState(false);
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const done = task.status === "completed";
  const overdue = isOverdue(task.dueDate, done);
  const hasSubtasks = (task.subtaskCount ?? 0) > 0 || subtasks.length > 0;
  const showSelectBox = hovered || selected || anySelected;
  const isActive = activeTaskId === task.id;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === " " && e.target === e.currentTarget) { e.preventDefault(); onToggleSelect(task.id); }
  };

  return (
    <>
      <div
        tabIndex={0}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onKeyDown={handleKeyDown}
        style={{
          display: "grid", gridTemplateColumns: gridCols,
          alignItems: "center", minHeight: "36px",
          borderBottom: "1px solid var(--border)",
          background: selected
            ? "var(--accent-subtle, #eff6ff)"
            : isActive
            ? "rgba(47, 92, 255, 0.07)"
            : hovered ? "var(--panel-hover)" : "transparent",
          boxShadow: isActive ? "inset 3px 0 0 var(--accent)" : "none",
          paddingLeft: depth > 0 ? `${depth * 28}px` : "0",
          opacity: done ? 0.55 : 1,
          outline: "none",
        }}
      >
        {/* Selection checkbox */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          {showSelectBox && (
            <input
              type="checkbox"
              checked={selected}
              onChange={e => { e.stopPropagation(); onToggleSelect(task.id); }}
              onClick={e => e.stopPropagation()}
              style={{ width: "13px", height: "13px", accentColor: "var(--accent)", cursor: "pointer", flexShrink: 0 }}
            />
          )}
        </div>

        {/* Checkbox */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Checkbox done={done} onToggle={e => { e.stopPropagation(); onToggleComplete(task); }} />
        </div>

        {/* Expand arrow */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          {hasSubtasks && (
            <button
              onClick={e => { e.stopPropagation(); onToggleExpand(); }}
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
        <div
          style={{ display: "flex", alignItems: "center", gap: "5px", padding: "0 8px", overflow: "hidden", cursor: "pointer" }}
          onClick={() => onTaskClick(task.id)}
        >
          <span style={{
            fontSize: "13px", color: "var(--text-primary)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            textDecoration: done ? "line-through" : "none", flexShrink: 1, minWidth: 0,
          }}>{task.title}</span>
          {(task.commentCount ?? 0) > 0 && (
            <span style={{ fontSize: "10px", color: "var(--text-muted)", flexShrink: 0, display: "flex", alignItems: "center", gap: "2px" }}>
              💬 {task.commentCount}
            </span>
          )}
          {(task.attachmentCount ?? 0) > 0 && (
            <span style={{ fontSize: "10px", color: "var(--text-muted)", flexShrink: 0, display: "flex", alignItems: "center", gap: "2px" }}>
              📎 {task.attachmentCount}
            </span>
          )}
          {(task.subtaskCount ?? 0) > 0 && depth === 0 && (
            <span style={{ fontSize: "10px", color: "var(--text-muted)", flexShrink: 0 }}>↳ {task.subtaskCount}</span>
          )}
          {hovered && depth === 0 && (
            <button
              onClick={e => { e.stopPropagation(); setAddingSubtaskFor(task.id); }}
              style={{
                marginLeft: "6px", padding: "1px 6px", fontSize: "10px",
                background: "none", border: "1px solid var(--border)", borderRadius: "4px",
                cursor: "pointer", color: "var(--text-muted)", flexShrink: 0, whiteSpace: "nowrap",
              }}
            >↳ Add subtask</button>
          )}
        </div>

        {/* Due date */}
        {cols.dueDate && (
          <div style={{ padding: "0 8px", fontSize: "12px", color: overdue ? "#ef4444" : task.dueDate ? "var(--text-secondary)" : "var(--text-muted)" }}>
            {task.dueDate ? fmtDate(task.dueDate) : ""}
          </div>
        )}

        {/* Collaborators */}
        {cols.collaborators && (
          <div style={{ padding: "0 8px" }}>
            <AvatarStack assignees={task.assignees ?? []} />
          </div>
        )}

        {/* Projects */}
        {cols.projects && (
          <div style={{ padding: "0 8px", overflow: "hidden" }}>
            {project && <ProjectBadge name={project.name} color={project.color} />}
          </div>
        )}

        {/* Visibility */}
        {cols.visibility && (
          <div style={{ padding: "0 8px", fontSize: "11px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "4px" }}>
            <span>🔒</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Only me</span>
          </div>
        )}

        {/* More */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          {hovered && (
            <button style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: "13px", padding: 0 }}>···</button>
          )}
        </div>
      </div>

      {/* Inline add-subtask row */}
      {addingSubtaskFor === task.id && (
        <div style={{
          display: "flex", alignItems: "center", gap: "8px",
          paddingLeft: `${(depth + 1) * 28 + 46}px`, padding: `4px 12px 4px ${(depth + 1) * 28 + 46}px`,
          borderBottom: "1px solid var(--border)", background: "var(--bg)",
        }}>
          <div style={{ width: "14px", height: "14px", borderRadius: "50%", border: "2px solid var(--border-strong, #cbd5e1)", flexShrink: 0 }} />
          <input
            autoFocus value={subtaskTitle} onChange={e => setSubtaskTitle(e.target.value)}
            onKeyDown={async e => {
              if (e.key === "Enter" && subtaskTitle.trim()) {
                await onAddSubtask(task.id, subtaskTitle.trim());
                setSubtaskTitle(""); setAddingSubtaskFor(null);
              }
              if (e.key === "Escape") { setSubtaskTitle(""); setAddingSubtaskFor(null); }
            }}
            placeholder="Subtask name… (Enter to add)"
            style={{ flex: 1, padding: "3px 8px", border: "1px solid var(--accent)", borderRadius: "4px", fontSize: "12px", background: "var(--bg)", color: "var(--text-primary)", outline: "none" }}
          />
          <button onClick={() => setAddingSubtaskFor(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: "14px" }}>×</button>
        </div>
      )}

      {/* Subtask rows */}
      {expanded && subtasks.map(sub => (
        <TaskRow
          key={sub.id}
          task={sub} projectId={projectId} project={project}
          depth={depth + 1} cols={cols} gridCols={gridCols}
          subtasks={[]} expanded={false} onToggleExpand={() => {}}
          onToggleComplete={onToggleComplete} onTaskClick={onTaskClick}
          addingSubtaskFor={addingSubtaskFor}
          setAddingSubtaskFor={setAddingSubtaskFor}
          onAddSubtask={onAddSubtask}
          selected={selected} onToggleSelect={onToggleSelect} anySelected={anySelected}
          activeTaskId={activeTaskId}
        />
      ))}
    </>
  );
}

// ── Filter / sort / group helpers ─────────────────────────────────────────────

function applyFilters(tasks: Task[], filters: Filters): Task[] {
  return tasks.filter(t => {
    if (filters.completion === "incomplete" && t.status === "completed") return false;
    if (filters.completion === "complete" && t.status !== "completed") return false;
    if (filters.assignees.length > 0) {
      const taskAssigneeIds = (t.assignees ?? []).map(a => a.id);
      if (t.assigneeId) taskAssigneeIds.push(t.assigneeId);
      if (!filters.assignees.some(id => taskAssigneeIds.includes(id))) return false;
    }
    if (filters.priorities.length > 0 && !filters.priorities.includes(t.priority)) return false;
    if (filters.dueDates.length > 0) {
      const today = new Date().toISOString().slice(0, 10);
      const weekEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const ok = filters.dueDates.some(d => {
        if (d === "no_date") return !t.dueDate;
        if (d === "today") return t.dueDate === today;
        if (d === "overdue") return t.dueDate ? t.dueDate < today : false;
        if (d === "this_week") return t.dueDate ? t.dueDate >= today && t.dueDate <= weekEnd : false;
        return false;
      });
      if (!ok) return false;
    }
    return true;
  });
}

function applySort(tasks: Task[], sortField: SortField, sortDir: "asc" | "desc"): Task[] {
  if (sortField === "position") return [...tasks];
  return [...tasks].sort((a, b) => {
    let cmp = 0;
    if (sortField === "dueDate") {
      const av = a.dueDate ?? "9999-99-99"; const bv = b.dueDate ?? "9999-99-99";
      cmp = av < bv ? -1 : av > bv ? 1 : 0;
    } else if (sortField === "priority") {
      cmp = (PRIORITY_ORDER[a.priority] ?? 4) - (PRIORITY_ORDER[b.priority] ?? 4);
    } else if (sortField === "title") {
      cmp = a.title.localeCompare(b.title);
    } else if (sortField === "createdAt") {
      const av = a.createdAt ?? ""; const bv = b.createdAt ?? "";
      cmp = av < bv ? -1 : av > bv ? 1 : 0;
    } else if (sortField === "updatedAt") {
      const av = a.updatedAt ?? a.createdAt ?? ""; const bv = b.updatedAt ?? b.createdAt ?? "";
      cmp = av < bv ? -1 : av > bv ? 1 : 0;
    }
    return sortDir === "asc" ? cmp : -cmp;
  });
}

function buildGroups(tasks: Task[], groupBy: GroupBy, sections: Section[]): TaskGroup[] {
  if (groupBy === "section") {
    const result: TaskGroup[] = [];
    for (const s of sections) {
      const st = tasks.filter(t => t.sectionId === s.id);
      result.push({ key: s.id, label: s.name, tasks: st, sectionId: s.id });
    }
    return result;
  }
  if (groupBy === "priority") {
    return ["urgent", "high", "medium", "low", "none"].map(p => ({
      key: p, label: p.charAt(0).toUpperCase() + p.slice(1),
      tasks: tasks.filter(t => t.priority === p),
    })).filter(g => g.tasks.length > 0);
  }
  if (groupBy === "assignee") {
    const map = new Map<string, TaskGroup>();
    for (const t of tasks) {
      const key = t.assigneeId ?? "__unassigned__";
      if (!map.has(key)) {
        const a = t.assignees?.[0];
        map.set(key, { key, label: a ? (a.name || a.email) : "Unassigned", tasks: [] });
      }
      map.get(key)!.tasks.push(t);
    }
    return Array.from(map.values());
  }
  if (groupBy === "status") {
    const labels: Record<string, string> = { not_started: "Not started", in_progress: "In progress", completed: "Completed" };
    return ["not_started", "in_progress", "completed"].map(s => ({
      key: s, label: labels[s] ?? s, tasks: tasks.filter(t => t.status === s),
    })).filter(g => g.tasks.length > 0);
  }
  return [{ key: "all", label: "All tasks", tasks }];
}

// ── Main component ────────────────────────────────────────────────────────────

export function ProjectListView({
  projectId, project, sections, tasks, setSections, setTasks, onTaskClick, activeTaskId,
}: ProjectListViewProps) {
  // Toolbar state
  const [sortField, setSortField] = useState<SortField>("position");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [groupBy, setGroupBy] = useState<GroupBy>("section");
  const [filters, setFilters] = useState<Filters>({ priorities: [], dueDates: [], hiddenSections: [], assignees: [], completion: "all" });
  const [cols, setCols] = useState<ColVis>({ dueDate: true, collaborators: true, projects: true, visibility: true });

  // Section / task management
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [addingInSection, setAddingInSection] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [renamingSection, setRenamingSection] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [sectionMenu, setSectionMenu] = useState<string | null>(null);
  const [colorPicker, setColorPicker] = useState<string | null>(null);
  const [addingSection, setAddingSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");

  // Subtask expansion
  const [expandedTasks, setExpandedTasks] = useState<Record<string, boolean>>({});
  const [subtaskCache, setSubtaskCache] = useState<Record<string, Task[]>>({});
  const [addingSubtaskFor, setAddingSubtaskFor] = useState<string | null>(null);

  // Bulk selection
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [orgUsers, setOrgUsers] = useState<Assignee[]>([]);

  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setSectionMenu(null); setColorPicker(null);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  useEffect(() => {
    fetch("/api/pm/admin/users").then(r => r.json()).then(d => setOrgUsers(d.users ?? []));
  }, []);

  useEffect(() => {
    fetch("/api/pm/preferences")
      .then(r => r.json())
      .then((d: { preferences?: { hiddenSections?: string[] } }) => {
        const hidden = d.preferences?.hiddenSections ?? [];
        if (hidden.length > 0) {
          setFilters(f => ({ ...f, hiddenSections: hidden }));
        }
      });
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

  const gridCols = buildGridCols(cols);

  const topLevel = tasks.filter(t => !t.parentTaskId);
  const filtered = applyFilters(topLevel, filters);
  const sorted = applySort(filtered, sortField, sortDir);
  const allGroups = buildGroups(sorted, groupBy, sections);
  const groups = filters.hiddenSections.length > 0 && groupBy === "section"
    ? allGroups.filter(g => !filters.hiddenSections.includes(g.label))
    : allGroups;

  const toggleSort = useCallback((f: SortField) => {
    setSortField(prev => {
      if (prev === f) { setSortDir(d => d === "asc" ? "desc" : "asc"); return f; }
      setSortDir("asc"); return f;
    });
  }, []);

  const toggleCol = useCallback((k: keyof ColVis) => {
    setCols(c => ({ ...c, [k]: !c[k] }));
  }, []);

  const toggleExpand = useCallback(async (taskId: string) => {
    const nowExpanded = !expandedTasks[taskId];
    setExpandedTasks(prev => ({ ...prev, [taskId]: nowExpanded }));
    if (nowExpanded && !subtaskCache[taskId]) {
      const res = await fetch(`/api/pm/projects/${projectId}/tasks?parentTaskId=${taskId}`);
      const d = await res.json() as { tasks?: Task[] };
      setSubtaskCache(prev => ({ ...prev, [taskId]: d.tasks ?? [] }));
    }
  }, [expandedTasks, subtaskCache, projectId]);

  const addTask = useCallback(async (sectionId: string | null) => {
    if (!newTaskTitle.trim()) { setAddingInSection(null); return; }
    const res = await fetch("/api/pm/tasks", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, sectionId, title: newTaskTitle.trim() }),
    });
    const d = await res.json() as { task?: Task };
    if (d.task) setTasks([d.task, ...tasks]);
    setNewTaskTitle(""); setAddingInSection(null);
  }, [newTaskTitle, projectId, tasks, setTasks]);

  const addSubtask = useCallback(async (parentId: string, title: string) => {
    const res = await fetch("/api/pm/tasks", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, parentTaskId: parentId, title }),
    });
    const d = await res.json() as { task?: Task };
    if (d.task) {
      setSubtaskCache(prev => ({ ...prev, [parentId]: [...(prev[parentId] ?? []), d.task!] }));
      setTasks(tasks.map(t => t.id === parentId ? { ...t, subtaskCount: (t.subtaskCount ?? 0) + 1 } : t));
      setExpandedTasks(prev => ({ ...prev, [parentId]: true }));
    }
  }, [projectId, tasks, setTasks]);

  const toggleComplete = useCallback(async (task: Task) => {
    if (task.status === "completed") {
      await fetch(`/api/pm/tasks/${task.id}/reopen`, { method: "POST" });
    } else {
      await fetch(`/api/pm/tasks/${task.id}/complete`, { method: "POST" });
    }
    const upd = (t: Task): Task => t.id === task.id ? {
      ...t,
      status: t.status === "completed" ? "not_started" : "completed",
      completedAt: t.status === "completed" ? null : new Date().toISOString(),
    } : t;
    setTasks(tasks.map(upd));
    setSubtaskCache(prev => {
      const next = { ...prev };
      for (const k of Object.keys(next)) next[k] = next[k]!.map(upd);
      return next;
    });
  }, [tasks, setTasks]);

  // Section management
  const startRename = (section: Section) => {
    setRenamingSection(section.id); setRenameValue(section.name); setSectionMenu(null);
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
    if (!confirm("Delete this section? Tasks will become unsectioned.")) return;
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
    setColorPicker(null); setSectionMenu(null);
  };
  const addSection = async () => {
    if (!newSectionName.trim()) { setAddingSection(false); return; }
    const res = await fetch(`/api/pm/projects/${projectId}/sections`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newSectionName.trim() }),
    });
    const d = await res.json() as { section?: Section };
    if (d.section) setSections([...sections, d.section]);
    setNewSectionName(""); setAddingSection(false);
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Toolbar */}
      <ListToolbar
        sortField={sortField} sortDir={sortDir} onSort={toggleSort}
        groupBy={groupBy} onGroup={setGroupBy}
        cols={cols} onToggleCol={toggleCol}
        filters={filters} onFilters={setFilters}
        sections={sections}
        taskAssignees={(() => {
          const seen = new Set<string>();
          const result: Assignee[] = [];
          for (const t of tasks) {
            for (const a of (t.assignees ?? [])) {
              if (!seen.has(a.id)) { seen.add(a.id); result.push(a); }
            }
          }
          return result.sort((a, b) => a.name.localeCompare(b.name));
        })()}
        onAddTask={() => {
          const first = groups[0];
          if (first) { setCollapsed(c => ({ ...c, [first.key]: false })); setAddingInSection(first.key); }
        }}
      />

      {/* Column headers (sticky at top of scroll area) */}
      <ColumnHeader gridCols={gridCols} cols={cols} sortField={sortField} sortDir={sortDir} onSort={toggleSort} />

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {groups.map(group => {
          const sectionObj = sections.find(s => s.id === group.key);
          const isCollapsed = collapsed[group.key] ?? false;
          const isMenuOpen = sectionMenu === group.key;
          const isColorOpen = colorPicker === group.key;
          const isRenaming = renamingSection === group.key;
          const showMgmt = groupBy === "section" && !!sectionObj;
          const incompleteCnt = group.tasks.filter(t => t.status !== "completed").length;

          return (
            <div key={group.key}>
              {/* Section / group header */}
              <div style={{
                display: "flex", alignItems: "center", gap: "8px",
                padding: "5px 12px 5px 8px",
                background: "var(--bg-elevated)",
                borderBottom: "1px solid var(--border)",
              }}>
                <button
                  onClick={() => setCollapsed(c => ({ ...c, [group.key]: !c[group.key] }))}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: "11px", padding: "0 2px", flexShrink: 0 }}
                >
                  {isCollapsed ? "▶" : "▾"}
                </button>

                {sectionObj?.color && (
                  <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: sectionObj.color, flexShrink: 0 }} />
                )}

                {isRenaming ? (
                  <input
                    autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") commitRename(group.key); if (e.key === "Escape") setRenamingSection(null); }}
                    onBlur={() => commitRename(group.key)}
                    style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", border: "1px solid var(--accent)", borderRadius: "4px", padding: "2px 6px", background: "var(--bg)", outline: "none", minWidth: "120px" }}
                  />
                ) : (
                  <span
                    onClick={showMgmt ? () => startRename(sectionObj!) : undefined}
                    style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", cursor: showMgmt ? "text" : "default" }}
                  >{group.label}</span>
                )}

                <span style={{ fontSize: "11px", color: "var(--text-muted)", background: "var(--panel-hover)", padding: "1px 6px", borderRadius: "10px" }}>
                  {incompleteCnt}
                </span>

                {showMgmt && (
                  <div style={{ marginLeft: "auto", position: "relative" }}>
                    <button
                      onClick={() => { setSectionMenu(isMenuOpen ? null : group.key); setColorPicker(null); }}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: "14px", padding: "0 4px" }}
                    >···</button>

                    {isMenuOpen && (
                      <div ref={menuRef} style={{ position: "absolute", top: "100%", right: 0, zIndex: 200, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "8px", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", minWidth: "160px", padding: "4px" }}>
                        <button onClick={() => startRename(sectionObj!)} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", background: "none", border: "none", cursor: "pointer", fontSize: "13px", color: "var(--text-primary)", borderRadius: "4px" }}>Rename</button>
                        <button onClick={() => setColorPicker(group.key)} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", background: "none", border: "none", cursor: "pointer", fontSize: "13px", color: "var(--text-primary)", borderRadius: "4px" }}>Set color…</button>
                        <div style={{ borderTop: "1px solid var(--border)", margin: "4px 0" }} />
                        <button onClick={() => deleteSection(group.key)} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", background: "none", border: "none", cursor: "pointer", fontSize: "13px", color: "#ef4444", borderRadius: "4px" }}>Delete section</button>
                      </div>
                    )}

                    {isColorOpen && (
                      <div ref={menuRef} style={{ position: "absolute", top: "100%", right: 0, zIndex: 200, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "8px", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", padding: "12px", minWidth: "200px" }}>
                        <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "8px" }}>Section color</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                          {SECTION_COLORS.map(c => (
                            <button key={c.label} onClick={() => updateSectionColor(group.key, c.value)} title={c.label}
                              style={{ width: "24px", height: "24px", borderRadius: "50%", background: c.value ?? "var(--panel-hover)", border: sectionObj!.color === c.value ? "2px solid var(--accent)" : "2px solid transparent", cursor: "pointer", outline: "none" }}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Task rows */}
              {!isCollapsed && (
                <>
                  {group.tasks.map(task => (
                    <TaskRow
                      key={task.id}
                      task={task} projectId={projectId} project={project}
                      depth={0} cols={cols} gridCols={gridCols}
                      subtasks={subtaskCache[task.id] ?? []}
                      expanded={expandedTasks[task.id] ?? false}
                      onToggleExpand={() => toggleExpand(task.id)}
                      onToggleComplete={toggleComplete}
                      onTaskClick={onTaskClick}
                      addingSubtaskFor={addingSubtaskFor}
                      setAddingSubtaskFor={setAddingSubtaskFor}
                      onAddSubtask={addSubtask}
                      selected={selectedTaskIds.has(task.id)}
                      onToggleSelect={toggleSelect}
                      anySelected={selectedTaskIds.size > 0}
                      activeTaskId={activeTaskId}
                    />
                  ))}

                  {/* Inline add task */}
                  {addingInSection === group.key ? (
                    <div ref={el => el?.scrollIntoView({ block: "nearest", behavior: "smooth" })} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 12px", borderBottom: "1px solid var(--border)", background: "var(--bg)" }}>
                      <div style={{ width: "8px", flexShrink: 0 }} />
                      <div style={{ width: "16px", height: "16px", borderRadius: "50%", border: "2px solid var(--border-strong, #cbd5e1)", flexShrink: 0 }} />
                      <div style={{ width: "16px", flexShrink: 0 }} />
                      <input
                        autoFocus value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter") addTask(group.sectionId ?? null);
                          if (e.key === "Escape") { setAddingInSection(null); setNewTaskTitle(""); }
                        }}
                        placeholder="Task name… (Enter to add)"
                        style={{ flex: 1, padding: "4px 8px", border: "1px solid var(--accent)", borderRadius: "4px", fontSize: "13px", background: "var(--bg)", color: "var(--text-primary)", outline: "none" }}
                      />
                      <button onClick={() => addTask(group.sectionId ?? null)} style={{ padding: "4px 10px", background: "var(--accent)", color: "white", border: "none", borderRadius: "4px", fontSize: "12px", cursor: "pointer" }}>Add</button>
                      <button onClick={() => { setAddingInSection(null); setNewTaskTitle(""); }} style={{ padding: "4px 8px", background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "16px" }}>×</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddingInSection(group.key)}
                      style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 46px", width: "100%", background: "none", border: "none", borderBottom: "1px solid var(--border)", cursor: "pointer", color: "var(--text-muted)", fontSize: "13px" }}
                    >
                      <span style={{ fontSize: "15px" }}>+</span> Add task
                    </button>
                  )}
                </>
              )}
            </div>
          );
        })}

        {/* Add section (section group only) */}
        {groupBy === "section" && (
          <div style={{ padding: "8px 12px" }}>
            {addingSection ? (
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
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
                style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 4px", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: "13px" }}
              >
                <span style={{ fontSize: "16px" }}>+</span> Add section
              </button>
            )}
          </div>
        )}
      </div>

      {selectedTaskIds.size > 0 && (
        <BulkActionBar
          selectedIds={Array.from(selectedTaskIds)}
          orgUsers={orgUsers}
          sections={sections}
          onAction={runBulkAction}
          onClear={() => setSelectedTaskIds(new Set())}
        />
      )}
    </div>
  );
}
