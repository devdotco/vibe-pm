"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Pusher from 'pusher-js';
import { Skeleton, SkeletonText, SkeletonAvatar } from "@/components/ui/Skeleton";
import { StatusSelect } from "@/components/pm/StatusBadge";
import { PrioritySelect } from "@/components/pm/PriorityBadge";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { formatDistanceToNow, parseISO, isValid } from "date-fns";

function safeRelativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  try {
    const d = parseISO(dateStr);
    if (!isValid(d)) return "";
    return formatDistanceToNow(d, { addSuffix: true });
  } catch {
    return "";
  }
}

// ── Table paste helpers ───────────────────────────────────────────────────────

function rowsToMarkdownTable(rows: string[][]): string {
  if (rows.length === 0) return "";
  const colCount = Math.max(...rows.map(r => r.length));
  const pad = (r: string[]) => [...r, ...Array(colCount - r.length).fill("")];
  const fmt = (cells: string[]) => `| ${cells.join(" | ")} |`;
  const header = pad(rows[0]!);
  const sep = Array(colCount).fill("---");
  const body = rows.slice(1).map(r => pad(r));
  return [fmt(header), fmt(sep), ...body.map(fmt)].join("\n");
}

function htmlTableToMarkdown(html: string): string | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const table = doc.querySelector("table");
  if (!table) return null;
  const rows = Array.from(table.querySelectorAll("tr")).map(tr =>
    Array.from(tr.querySelectorAll("td, th")).map(cell =>
      (cell.textContent ?? "").trim().replace(/\|/g, "\\|").replace(/\n/g, " ")
    )
  ).filter(r => r.length > 0);
  if (rows.length === 0 || rows[0]!.length < 2) return null;
  return rowsToMarkdownTable(rows);
}

function tsvToMarkdown(text: string): string | null {
  const rows = text.trim().split("\n").map(r => r.split("\t").map(c => c.trim().replace(/\|/g, "\\|")));
  if (rows.length === 0 || (rows[0]?.length ?? 0) < 2) return null;
  return rowsToMarkdownTable(rows);
}

// ── Comment rendering ────────────────────────────────────────────────────────

function CommentContent({ content }: { content: string }) {
  // Handle <u>…</u> before ReactMarkdown (markdown has no underline syntax)
  const segments = content.split(/(<u>[\s\S]*?<\/u>)/);
  if (segments.length === 1) return <CommentMarkdown content={content} />;
  return (
    <>
      {segments.map((seg, i) =>
        seg.startsWith("<u>") && seg.endsWith("</u>")
          ? <span key={i} style={{ textDecoration: "underline" }}>{seg.slice(3, -4)}</span>
          : <CommentMarkdown key={i} content={seg} />
      )}
    </>
  );
}

function addHardBreaks(text: string): string {
  const lines = text.split("\n");
  return lines.map((line, i) => {
    const next = lines[i + 1];
    if (next === undefined) return line;
    const isList = /^(\d+\.\s+|[-*]\s+)/.test(line);
    const nextIsList = /^(\d+\.\s+|[-*]\s+)/.test(next);
    const empty = line.trim() === "";
    const nextEmpty = next.trim() === "";
    // Add GFM hard-break (two trailing spaces) only between plain non-empty lines
    if (!isList && !nextIsList && !empty && !nextEmpty) return line + "  ";
    return line;
  }).join("\n");
}

function CommentMarkdown({ content }: { content: string }) {
  // Convert @Name → markdown link so we can style it in the `a` component
  const withMentions = content.replace(/@(\w+)/g, "[@$1](@$1)");
  const processed = addHardBreaks(withMentions);
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <span style={{ display: "block", marginBottom: 8, wordBreak: "break-word", overflowWrap: "anywhere" }}>{children}</span>,
        br: () => <br />,
        ul: ({ children }) => <ul style={{ paddingLeft: 18, margin: "6px 0", listStyleType: "disc" }}>{children}</ul>,
        ol: ({ children }) => <ol style={{ paddingLeft: 18, margin: "6px 0", listStyleType: "decimal" }}>{children}</ol>,
        li: ({ children }) => <li style={{ margin: "3px 0" }}>{children}</li>,
        strong: ({ children }) => <strong>{children}</strong>,
        em: ({ children }) => <em>{children}</em>,
        code: ({ children }) => <code style={{ background: "rgba(0,0,0,0.07)", padding: "1px 4px", borderRadius: 3, fontSize: "12px", fontFamily: "monospace" }}>{children}</code>,
        img: ({ src, alt }) => <img src={src} alt={alt ?? ""} style={{ maxWidth: "100%", borderRadius: 6, marginTop: 4, display: "block" }} />,
        a: ({ href, children }) =>
          typeof href === "string" && href.startsWith("@")
            ? <strong style={{ color: "var(--accent)", fontWeight: 600 }}>{children}</strong>
            : <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", textDecoration: "underline", wordBreak: "break-all" }}>{children}</a>,
        table: ({ children }) => (
          <div style={{ overflowX: "auto", margin: "6px 0" }}>
            <table style={{ borderCollapse: "collapse", fontSize: "12px", width: "max-content", maxWidth: "100%" }}>{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead>{children}</thead>,
        tbody: ({ children }) => <tbody>{children}</tbody>,
        tr: ({ children }) => <tr>{children}</tr>,
        th: ({ children }) => <th style={{ border: "1px solid var(--border)", padding: "4px 10px", background: "var(--bg-elevated)", fontWeight: 600, textAlign: "left", whiteSpace: "nowrap", fontSize: "11px", color: "var(--text-secondary)" }}>{children}</th>,
        td: ({ children }) => <td style={{ border: "1px solid var(--border)", padding: "4px 10px", whiteSpace: "nowrap", color: "var(--text-primary)" }}>{children}</td>,
      }}
    >
      {processed}
    </ReactMarkdown>
  );
}

// ── Formatting toolbar ────────────────────────────────────────────────────────

type FmtType = "bold" | "italic" | "underline" | "bullet" | "numbered" | "link";

function applyFormat(
  fmt: FmtType,
  ref: React.RefObject<HTMLTextAreaElement | null>,
  value: string,
  onChange: (v: string) => void,
) {
  const el = ref.current;
  if (!el) return;
  const start = el.selectionStart ?? 0;
  const end = el.selectionEnd ?? 0;
  const sel = value.slice(start, end);

  if (fmt === "bullet" || fmt === "numbered") {
    // Expand to full lines covering the selection
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const lineEndIdx = value.indexOf("\n", end);
    const blockEnd = lineEndIdx === -1 ? value.length : lineEndIdx;
    const lines = value.slice(lineStart, blockEnd).split("\n");
    const prefixed = lines
      .map((l, i) => fmt === "bullet" ? `- ${l}` : `${i + 1}. ${l}`)
      .join("\n");
    onChange(value.slice(0, lineStart) + prefixed + value.slice(blockEnd));
    const newEnd = lineStart + prefixed.length;
    setTimeout(() => { el.focus(); el.setSelectionRange(lineStart, newEnd); }, 0);
    return;
  }

  if (fmt === "link") {
    const isUrl = sel.startsWith("http");
    const insert = sel
      ? (isUrl ? `[${sel}](${sel})` : `[${sel}](https://)`)
      : "[link text](https://)";
    const cursorPos = sel
      ? (isUrl ? start + insert.length : start + sel.length + 3)
      : start + 12;
    onChange(value.slice(0, start) + insert + value.slice(end));
    setTimeout(() => { el.focus(); el.setSelectionRange(cursorPos, cursorPos + (sel && !isUrl ? 8 : 0)); }, 0);
    return;
  }

  const map: Record<string, [string, string, string]> = {
    bold:      ["**", "**", "bold text"],
    italic:    ["*",  "*",  "italic text"],
    underline: ["<u>", "</u>", "underline text"],
  };
  const [open, close, placeholder] = map[fmt]!;
  const insert = sel ? `${open}${sel}${close}` : `${open}${placeholder}${close}`;
  const cursor = sel ? start + insert.length : start + open.length;
  onChange(value.slice(0, start) + insert + value.slice(end));
  setTimeout(() => { el.focus(); el.setSelectionRange(cursor, cursor); }, 0);
}

const FMT_BUTTONS: { fmt: FmtType; label: string; title: string; style?: React.CSSProperties }[] = [
  { fmt: "bold",      label: "B",  title: "Bold",          style: { fontWeight: 700 } },
  { fmt: "italic",    label: "I",  title: "Italic",        style: { fontStyle: "italic" } },
  { fmt: "underline", label: "U",  title: "Underline",     style: { textDecoration: "underline" } },
  { fmt: "bullet",    label: "•",  title: "Bullet list",   style: { fontSize: 16 } },
  { fmt: "numbered",  label: "1.", title: "Numbered list", style: { fontSize: 11 } },
  { fmt: "link",      label: "🔗", title: "Insert link",   style: { fontSize: 13 } },
];

function FormatToolbar({ textareaRef, value, onChange }: {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", gap: "1px", padding: "3px 6px", background: "var(--bg-elevated)", borderBottom: "1px solid var(--border)" }}>
      {FMT_BUTTONS.map(btn => (
        <button
          key={btn.fmt}
          type="button"
          title={btn.title}
          onMouseDown={e => { e.preventDefault(); applyFormat(btn.fmt, textareaRef, value, onChange); }}
          style={{
            width: 26, height: 22, padding: 0, border: "none", background: "none",
            cursor: "pointer", borderRadius: 3, fontSize: 13,
            color: "var(--text-secondary)", display: "flex", alignItems: "center",
            justifyContent: "center", ...btn.style,
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "var(--panel-hover)")}
          onMouseLeave={e => (e.currentTarget.style.background = "none")}
        >
          {btn.label}
        </button>
      ))}
    </div>
  );
}

interface Task {
  id: string; title: string; description: string | null; status: string; priority: string;
  dueDate: string | null; dueTime: string | null; startDate: string | null; assigneeId: string | null; sectionId: string | null;
  labels: string[]; projectId: string; sourceMessageId: string | null; sourceChannelId: string | null;
  completedAt: string | null; parentTaskId: string | null;
  estimatedMinutes: number | null; actualMinutes: number | null;
}
interface FeedItem {
  id: string; _type: "activity" | "comment"; content?: string; action?: string;
  oldValue?: string | null; newValue?: string | null; userId: string; createdAt: string;
  userName?: string | null; source?: string | null;
  reactions?: Array<{ userId: string; userName: string | null }>;
}
interface SubTask {
  id: string; title: string; status: string; assigneeId: string | null; dueDate: string | null;
}
interface Assignee {
  id: string; name: string; email: string;
}
interface Dependency {
  id: string; taskId: string; dependsOnTaskId: string; type: string;
}
interface Attachment {
  id: string; filename: string; fileType: string; fileSize: number | null; url: string; createdAt: string;
}

const ACTION_LABELS: Record<string, (a: { oldValue?: string | null; newValue?: string | null }) => string> = {
  created: () => "created this task",
  status_changed: (a) => `changed status from ${a.oldValue} to ${a.newValue}`,
  priority_changed: (a) => `changed priority from ${a.oldValue} to ${a.newValue}`,
  assigned: (a) => `assigned this to ${a.newValue}`,
  completed: () => "marked as completed",
  reopened: () => "reopened this task",
  title_changed: () => "updated the title",
  commented: () => "commented",
  due_date_set: (a) => `set due date to ${a.newValue}`,
  due_date_changed: (a) => `changed due date to ${a.newValue}`,
  moved: () => "moved this task",
  attachment_added: (a) => `attached ${a.newValue}`,
};

function Avatar({ name, size = 24 }: { name: string; size?: number }) {
  const colors = ["#2f5cff", "#0d8f80", "#0f7a52", "#a6620a", "#6d4be0"];
  const color = colors[name.charCodeAt(0) % colors.length]!;
  return (
    <div title={name} style={{ width: size, height: size, borderRadius: "50%", background: color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.42, fontWeight: 600, color: "white", flexShrink: 0 }}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

export function TaskDetailPanel({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const [task, setTask] = useState<Task | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [subtasks, setSubtasks] = useState<SubTask[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [dependencies, setDependencies] = useState<Dependency[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [comment, setComment] = useState("");
  const [postingComment, setPostingComment] = useState(false);
  const [commentError, setCommentError] = useState("");
  const [markdownPreview, setMarkdownPreview] = useState(false);
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [showLabelInput, setShowLabelInput] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [showDepInput, setShowDepInput] = useState(false);
  const [depTaskId, setDepTaskId] = useState("");
  const [depType, setDepType] = useState("finish_to_start");
  const [customFields, setCustomFields] = useState<Record<string, string>>({});
  const [customFieldsExpanded, setCustomFieldsExpanded] = useState(false);
  const [addingField, setAddingField] = useState(false);
  const [newFieldKey, setNewFieldKey] = useState("");
  const [editingFieldKey, setEditingFieldKey] = useState<string | null>(null);
  const [editingFieldValue, setEditingFieldValue] = useState("");
  const [orgUsers, setOrgUsers] = useState<Assignee[]>([]);
  const [showAssigneePicker, setShowAssigneePicker] = useState(false);
  const [watching, setWatching] = useState(false);
  const [watcherCount, setWatcherCount] = useState(0);
  const [recurrence, setRecurrence] = useState<{ frequency: string; nextDueDate: string } | null>(null);
  const [showRepeatPicker, setShowRepeatPicker] = useState(false);
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState(-1);
  const [showAllFeed, setShowAllFeed] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [hoveredCommentId, setHoveredCommentId] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const commentFileRef = useRef<HTMLInputElement>(null);
  const assigneePickerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 480) + "px";
  };

  const loadAll = useCallback(() => {
    fetch(`/api/pm/tasks/${taskId}`).then(r => r.json()).then(d => {
      setTask(d.task);
      setCustomFields((d.task?.customFields as Record<string, string>) ?? {});
    });
    fetch(`/api/pm/tasks/${taskId}/watch`).then(r => r.json()).then(d => setWatching(d.watching ?? false));
    fetch(`/api/pm/tasks/${taskId}/watchers`).then(r => r.json()).then(d => setWatcherCount((d.watchers ?? []).length));
    fetch(`/api/pm/tasks/${taskId}/recurrence`).then(r => r.json()).then(d => setRecurrence(d.recurrence));
    fetch(`/api/pm/tasks/${taskId}/activity`).then(r => r.json()).then(d => setFeed(d.feed ?? []));
    fetch(`/api/pm/tasks/${taskId}/subtasks`).then(r => r.json()).then(d => setSubtasks(d.subtasks ?? []));
    fetch(`/api/pm/tasks/${taskId}/assignees`).then(r => r.json()).then(d => setAssignees(d.assignees ?? []));
    fetch(`/api/pm/tasks/${taskId}/dependencies`).then(r => r.json()).then(d => setDependencies(d.dependencies ?? []));
    fetch(`/api/pm/tasks/${taskId}/attachments`).then(r => r.json()).then(d => setAttachments(d.attachments ?? []));
  }, [taskId]);

  useEffect(() => {
    fetch("/api/pm/admin/users").then(r => r.json()).then(d => setOrgUsers(d.users ?? []));
    fetch("/api/pm/me").then(r => r.json()).then(d => setCurrentUserId(d.id ?? null)).catch(() => {});
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => { autoResize(textareaRef.current); }, [comment]);
  useEffect(() => { autoResize(editTextareaRef.current); }, [editContent]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") { if (showAssigneePicker) { setShowAssigneePicker(false); } else { onClose(); } } };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, showAssigneePicker]);
  useEffect(() => {
    if (!showAssigneePicker) return;
    const h = (e: MouseEvent) => { if (assigneePickerRef.current && !assigneePickerRef.current.contains(e.target as Node)) setShowAssigneePicker(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showAssigneePicker]);

  // Real-time updates via Pusher
  useEffect(() => {
    const pusherKey = process.env.NEXT_PUBLIC_PUSHER_KEY;
    if (!pusherKey) { console.warn('[Pusher] NEXT_PUBLIC_PUSHER_KEY is not set — real-time updates disabled'); return; }
    const pusher = new Pusher(pusherKey, { cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER ?? "us2" });
    const ch = pusher.subscribe(`task-${taskId}`);
    const refreshFeed = () => {
      fetch(`/api/pm/tasks/${taskId}/activity`).then(r => r.json()).then(d => setFeed(d.feed ?? []));
    };
    const refreshAll = () => {
      fetch(`/api/pm/tasks/${taskId}`).then(r => r.json()).then(d => {
        if (d.task) setTask(d.task);
      });
      fetch(`/api/pm/tasks/${taskId}/assignees`).then(r => r.json()).then(d => setAssignees(d.assignees ?? []));
      refreshFeed();
    };
    ch.bind('task.comment', refreshFeed);
    ch.bind('task.updated', refreshAll);
    return () => { pusher.unsubscribe(`task-${taskId}`); pusher.disconnect(); };
  }, [taskId]);

  const save = useCallback((patch: Partial<Task>) => {
    if (!task) return;
    setTask(t => t ? { ...t, ...patch } : t);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await fetch(`/api/pm/tasks/${taskId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      fetch(`/api/pm/tasks/${taskId}/activity`).then(r => r.json()).then(d => setFeed(d.feed ?? []));
    }, 500);
  }, [task, taskId]);

  const postComment = async () => {
    if (!comment.trim() || postingComment) return;
    setPostingComment(true);
    setCommentError("");
    try {
      const res = await fetch(`/api/pm/tasks/${taskId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: comment.trim() }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setCommentError(d.error ?? `Failed to post (${res.status})`);
        return;
      }
      setComment("");
      const feedData = await fetch(`/api/pm/tasks/${taskId}/activity`).then(r => r.json());
      setFeed(feedData.feed ?? []);
    } catch {
      setCommentError("Network error — please try again");
    } finally {
      setPostingComment(false);
    }
  };

  const saveEdit = async () => {
    if (!editingCommentId || !editContent.trim() || savingEdit) return;
    setSavingEdit(true);
    await fetch(`/api/pm/tasks/${taskId}/comments/${editingCommentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: editContent.trim() }),
    });
    setEditingCommentId(null);
    const feedData = await fetch(`/api/pm/tasks/${taskId}/activity`).then(r => r.json());
    setFeed(feedData.feed ?? []);
    setSavingEdit(false);
  };

  const deleteComment = async (id: string) => {
    if (!confirm("Delete this comment?")) return;
    await fetch(`/api/pm/tasks/${taskId}/comments/${id}`, { method: "DELETE" });
    setFeed(prev => prev.filter(f => f.id !== id));
  };

  const toggleReaction = async (commentId: string) => {
    const hasReacted = feed.find(f => f.id === commentId)?.reactions?.some(r => r.userId === currentUserId);
    setFeed(prev => prev.map(f => {
      if (f.id !== commentId) return f;
      const reactions = f.reactions ?? [];
      return {
        ...f,
        reactions: hasReacted
          ? reactions.filter(r => r.userId !== currentUserId)
          : [...reactions, { userId: currentUserId!, userName: null }],
      };
    }));
    await fetch(`/api/pm/tasks/${taskId}/comments/${commentId}/reactions`, { method: "POST" });
    fetch(`/api/pm/tasks/${taskId}/activity`).then(r => r.json()).then(d => setFeed(d.feed ?? []));
  };

  const addSubtask = async () => {
    if (!newSubtaskTitle.trim()) return;
    const res = await fetch(`/api/pm/tasks/${taskId}/subtasks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: newSubtaskTitle.trim() }) });
    const d = await res.json();
    if (d.subtask) setSubtasks(s => [...s, d.subtask]);
    setNewSubtaskTitle(""); setAddingSubtask(false);
  };

  const toggleSubtask = async (sub: SubTask) => {
    const method = sub.status === "completed" ? "/reopen" : "/complete";
    await fetch(`/api/pm/tasks/${sub.id}${method}`, { method: "POST" });
    setSubtasks(s => s.map(x => x.id === sub.id ? { ...x, status: x.status === "completed" ? "not_started" : "completed" } : x));
  };

  const complete = async () => {
    if (!task) return;
    await fetch(`/api/pm/tasks/${taskId}/complete`, { method: "POST" });
    setTask(t => t ? { ...t, status: "completed", completedAt: new Date().toISOString() } : t);
  };

  const addLabel = async () => {
    if (!newLabel.trim() || !task) return;
    const updated = [...new Set([...(task.labels ?? []), newLabel.trim()])];
    save({ labels: updated });
    setNewLabel(""); setShowLabelInput(false);
  };

  const removeLabel = (label: string) => {
    if (!task) return;
    save({ labels: task.labels.filter(l => l !== label) });
  };

  const addDependency = async () => {
    if (!depTaskId.trim()) return;
    const res = await fetch(`/api/pm/tasks/${taskId}/dependencies`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dependsOnTaskId: depTaskId.trim(), type: depType }) });
    const d = await res.json();
    if (d.dependency) { setDependencies(prev => [...prev, d.dependency]); setDepTaskId(""); setShowDepInput(false); }
  };

  const saveCustomField = async (key: string, value: string) => {
    const updated = { ...customFields, [key]: value };
    setCustomFields(updated);
    setEditingFieldKey(null);
    await fetch(`/api/pm/tasks/${taskId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customFields: updated }),
    });
  };

  const addCustomField = async () => {
    const key = newFieldKey.trim();
    if (!key || key in customFields) return;
    const updated = { ...customFields, [key]: "" };
    setCustomFields(updated);
    setNewFieldKey(""); setAddingField(false);
    setEditingFieldKey(key); setEditingFieldValue("");
    await fetch(`/api/pm/tasks/${taskId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customFields: updated }),
    });
  };

  const removeCustomField = async (key: string) => {
    const updated = { ...customFields };
    delete updated[key];
    setCustomFields(updated);
    await fetch(`/api/pm/tasks/${taskId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customFields: updated }),
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !task) return;
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`/api/pm/tasks/${taskId}/attachments/upload`, { method: "POST", body: formData });
    const d = await res.json() as { attachment?: Attachment };
    if (d.attachment) setAttachments(prev => [...prev, d.attachment!]);
    e.target.value = "";
  };

  const insertIntoComment = (md: string) => {
    const el = textareaRef.current;
    const cursor = el?.selectionStart ?? comment.length;
    setComment(prev => prev.slice(0, cursor) + md + prev.slice(cursor));
    setTimeout(() => { el?.focus(); el?.setSelectionRange(cursor + md.length, cursor + md.length); }, 0);
  };

  const handleCommentPaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items);

    // Image paste
    const imageItem = items.find(item => item.type.startsWith("image/"));
    if (imageItem) {
      e.preventDefault();
      const file = imageItem.getAsFile();
      if (!file) return;
      const formData = new FormData();
      formData.append("file", file, `paste-${Date.now()}.png`);
      setUploadingImage(true);
      try {
        const res = await fetch(`/api/pm/tasks/${taskId}/attachments/upload`, { method: "POST", body: formData });
        const d = await res.json() as { attachment?: Attachment };
        if (d.attachment) insertIntoComment(`![image](${d.attachment.url})`);
      } finally {
        setUploadingImage(false);
      }
      return;
    }

    // Table paste (Google Sheets, Excel, etc.)
    const html = e.clipboardData.getData("text/html");
    const text = e.clipboardData.getData("text/plain");
    if (html) {
      const md = htmlTableToMarkdown(html);
      if (md) { e.preventDefault(); insertIntoComment(md); return; }
    }
    if (text && text.includes("\t")) {
      const md = tsvToMarkdown(text);
      if (md) { e.preventDefault(); insertIntoComment(md); return; }
    }
  };

  const handleCommentFileAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    setUploadingImage(true);
    try {
      const res = await fetch(`/api/pm/tasks/${taskId}/attachments/upload`, { method: "POST", body: formData });
      const d = await res.json() as { attachment?: Attachment };
      if (d.attachment) {
        const md = file.type.startsWith("image/")
          ? `![${file.name}](${d.attachment.url})`
          : `[${file.name}](${d.attachment.url})`;
        insertIntoComment(md);
      }
    } finally {
      setUploadingImage(false);
      e.target.value = "";
    }
  };

  if (!task) return (
    <div style={{ position: "fixed", right: 0, top: 0, bottom: 0, width: "540px", maxWidth: "100vw", background: "var(--bg-elevated)", borderLeft: "1px solid var(--border)", display: "flex", flexDirection: "column", zIndex: 100, boxShadow: "-4px 0 24px rgba(0,0,0,0.08)" }}>
      {/* Skeleton header */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "16px 20px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <Skeleton style={{ width: 16, height: 16, borderRadius: "50%" }} />
        <SkeletonText width="60%" height={16} />
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: "20px", lineHeight: 1, padding: "0 2px", marginLeft: "auto" }}>×</button>
      </div>
      <div style={{ padding: "16px 20px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        {[...Array(4)].map((_, i) => (
          <div key={i}>
            <SkeletonText width="50%" height={10} />
            <Skeleton style={{ height: 28, marginTop: 6 }} />
          </div>
        ))}
      </div>
      <div style={{ padding: "14px 20px", borderTop: "1px solid var(--border)" }}>
        <SkeletonText width="40%" height={10} />
        <div style={{ display: "flex", gap: "6px", marginTop: 8 }}>
          {[...Array(3)].map((_, i) => <SkeletonAvatar key={i} size={24} />)}
        </div>
      </div>
      <div style={{ padding: "14px 20px", borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8 }}>
        {[...Array(5)].map((_, i) => (
          <div key={i} style={{ display: "flex", gap: 10 }}>
            <SkeletonAvatar size={24} />
            <div style={{ flex: 1 }}>
              <SkeletonText height={12} width="80%" />
              <SkeletonText height={10} width="30%" style={{ marginTop: 4 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const fieldLabel = (text: string) => (
    <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px", fontWeight: 600, textTransform: "uppercase" }}>{text}</div>
  );

  const dateInput = (value: string | null, onChange: (v: string | null) => void) => (
    <input type="date" value={value ?? ""} onChange={e => onChange(e.target.value || null)}
      style={{ padding: "4px 8px", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "13px", background: "var(--bg)", color: "var(--text-primary)", cursor: "pointer" }} />
  );

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 99 }} />
      <div style={{ position: "fixed", right: 0, top: 0, bottom: 0, width: "540px", maxWidth: "100vw", background: "var(--bg-elevated)", borderLeft: "1px solid var(--border)", display: "flex", flexDirection: "column", zIndex: 100, boxShadow: "-4px 0 24px rgba(0,0,0,0.08)" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "16px 20px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <input type="checkbox" checked={task.status === "completed"} onChange={complete}
            style={{ width: "16px", height: "16px", accentColor: "var(--positive)", cursor: "pointer", flexShrink: 0 }} />
          <input value={task.title} onChange={e => save({ title: e.target.value })}
            style={{ flex: 1, border: "none", background: "transparent", fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", outline: "none" }} />
          <button
            onClick={async () => {
              const method = watching ? "DELETE" : "POST";
              await fetch(`/api/pm/tasks/${taskId}/watch`, { method });
              setWatching(!watching);
              setWatcherCount(c => watching ? c - 1 : c + 1);
            }}
            title={watching ? `Watching (${watcherCount})` : `Watch · ${watcherCount} watching`}
            style={{ background: "none", border: `1px solid ${watching ? "var(--accent)" : "var(--border)"}`, borderRadius: "6px", cursor: "pointer", color: watching ? "var(--accent)" : "var(--text-muted)", fontSize: "12px", padding: "3px 8px", display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}
          >
            <span style={{ fontSize: "14px" }}>{watching ? "👁" : "👁‍🗨"}</span>
            <span>{watching ? "Watching" : "Watch"}</span>
          </button>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: "20px", lineHeight: 1, padding: "0 2px" }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {/* Metadata grid */}
          <div style={{ padding: "16px 20px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", borderBottom: "1px solid var(--border)" }}>
            <div>{fieldLabel("Status")}<StatusSelect value={task.status} onChange={v => save({ status: v })} /></div>
            <div>{fieldLabel("Priority")}<PrioritySelect value={task.priority} onChange={v => save({ priority: v })} /></div>
            <div>{fieldLabel("Start date")}{dateInput(task.startDate, v => save({ startDate: v }))}</div>
            <div>
              {fieldLabel("Due date")}
              <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                {dateInput(task.dueDate, v => save({ dueDate: v }))}
                <input
                  type="time"
                  value={task.dueTime ?? ""}
                  onChange={e => save({ dueTime: e.target.value || null })}
                  title="Due time (optional)"
                  style={{ padding: "4px 8px", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "13px", background: "var(--bg)", color: "var(--text-primary)", cursor: "pointer" }}
                />
              </div>
              {task.dueDate && task.dueTime && (
                <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "3px" }}>
                  {new Date(`${task.dueDate}T${task.dueTime}`).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </div>
              )}
            </div>
          </div>

          {/* Assignees */}
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
            {fieldLabel("Assignees")}
            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
              {assignees.map(a => (
                <div key={a.id} style={{ display: "flex", alignItems: "center", gap: "4px", padding: "3px 8px", borderRadius: "20px", background: "var(--panel-hover)", fontSize: "12px", color: "var(--text-primary)" }}>
                  <Avatar name={a.name} size={18} />
                  {a.name}
                  <button onClick={async () => {
                    await fetch(`/api/pm/tasks/${taskId}/assignees/${a.id}`, { method: "DELETE" });
                    setAssignees(prev => prev.filter(x => x.id !== a.id));
                  }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: "12px", lineHeight: 1, padding: "0", marginLeft: "2px" }}>×</button>
                </div>
              ))}
              <div ref={assigneePickerRef} style={{ position: "relative" }}>
                <button
                  onClick={() => { setShowAssigneePicker(v => !v); setAssigneeSearch(""); }}
                  style={{ fontSize: "12px", color: "var(--accent)", background: "none", border: "1px dashed var(--border)", padding: "3px 8px", borderRadius: "20px", cursor: "pointer" }}
                >
                  + Add
                </button>
                {showAssigneePicker && (
                  <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 200, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "8px", boxShadow: "0 8px 24px rgba(0,0,0,0.2)", width: "220px", overflow: "hidden" }}>
                    <div style={{ padding: "8px" }}>
                      <input
                        autoFocus
                        value={assigneeSearch}
                        onChange={e => setAssigneeSearch(e.target.value)}
                        placeholder="Search people..."
                        style={{ width: "100%", padding: "5px 8px", border: "1px solid var(--border)", borderRadius: "5px", fontSize: "12px", background: "var(--bg)", color: "var(--text-primary)", outline: "none", boxSizing: "border-box" }}
                      />
                    </div>
                    <div style={{ maxHeight: "200px", overflowY: "auto" }}>
                      {orgUsers
                        .filter(u => !assignees.some(a => a.id === u.id))
                        .filter(u => !assigneeSearch || u.name.toLowerCase().includes(assigneeSearch.toLowerCase()) || u.email.toLowerCase().includes(assigneeSearch.toLowerCase()))
                        .map(u => (
                          <button
                            key={u.id}
                            onClick={async () => {
                              await fetch(`/api/pm/tasks/${taskId}/assignees`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: u.id }) });
                              const d = await fetch(`/api/pm/tasks/${taskId}/assignees`).then(r => r.json());
                              setAssignees(d.assignees ?? []);
                              setShowAssigneePicker(false);
                            }}
                            style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%", padding: "7px 12px", background: "none", border: "none", cursor: "pointer", color: "var(--text-primary)", fontSize: "13px", textAlign: "left" }}
                            onMouseEnter={e => (e.currentTarget.style.background = "var(--panel-hover)")}
                            onMouseLeave={e => (e.currentTarget.style.background = "none")}
                          >
                            <Avatar name={u.name} size={22} />
                            <div>
                              <div style={{ fontWeight: 500, lineHeight: 1.2 }}>{u.name}</div>
                              <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{u.email}</div>
                            </div>
                          </button>
                        ))}
                      {orgUsers.filter(u => !assignees.some(a => a.id === u.id)).filter(u => !assigneeSearch || u.name.toLowerCase().includes(assigneeSearch.toLowerCase()) || u.email.toLowerCase().includes(assigneeSearch.toLowerCase())).length === 0 && (
                        <div style={{ padding: "12px", fontSize: "12px", color: "var(--text-muted)", textAlign: "center" }}>No users found</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Labels */}
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
            {fieldLabel("Labels")}
            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
              {(task.labels ?? []).map(label => (
                <span key={label} style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 8px", borderRadius: "10px", fontSize: "11px", background: "var(--accent-subtle)", color: "var(--accent)", border: "1px solid var(--accent)", fontWeight: 500 }}>
                  {label}
                  <button onClick={() => removeLabel(label)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent)", fontSize: "12px", lineHeight: 1, padding: 0 }}>×</button>
                </span>
              ))}
              {showLabelInput ? (
                <div style={{ display: "flex", gap: "4px" }}>
                  <input autoFocus value={newLabel} onChange={e => setNewLabel(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") addLabel(); if (e.key === "Escape") { setShowLabelInput(false); setNewLabel(""); } }}
                    placeholder="Label name" style={{ padding: "2px 8px", border: "1px solid var(--border)", borderRadius: "10px", fontSize: "11px", background: "var(--bg)", color: "var(--text-primary)", outline: "none", width: "100px" }} />
                  <button onClick={addLabel} style={{ padding: "2px 7px", background: "var(--accent)", color: "white", border: "none", borderRadius: "10px", fontSize: "11px", cursor: "pointer" }}>Add</button>
                  <button onClick={() => setShowLabelInput(false)} style={{ padding: "2px 7px", background: "none", border: "1px solid var(--border)", borderRadius: "10px", fontSize: "11px", cursor: "pointer", color: "var(--text-muted)" }}>✕</button>
                </div>
              ) : (
                <button onClick={() => setShowLabelInput(true)} style={{ fontSize: "11px", color: "var(--text-muted)", background: "none", border: "1px dashed var(--border)", padding: "2px 8px", borderRadius: "10px", cursor: "pointer" }}>
                  + Add label
                </button>
              )}
            </div>
          </div>

          {/* Time tracking */}
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
            {fieldLabel("Time tracking")}
            <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--text-secondary)" }}>
                Estimated:
                <input type="number" min={0} value={task.estimatedMinutes ?? ""}
                  onChange={e => save({ estimatedMinutes: e.target.value ? Number(e.target.value) : null })}
                  style={{ width: "70px", padding: "3px 6px", border: "1px solid var(--border)", borderRadius: "5px", fontSize: "13px", background: "var(--bg)", color: "var(--text-primary)", outline: "none" }} />
                min
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--text-secondary)" }}>
                Actual:
                <input type="number" min={0} value={task.actualMinutes ?? ""}
                  onChange={e => save({ actualMinutes: e.target.value ? Number(e.target.value) : null })}
                  style={{ width: "70px", padding: "3px 6px", border: "1px solid var(--border)", borderRadius: "5px", fontSize: "13px", background: "var(--bg)", color: "var(--text-primary)", outline: "none" }} />
                min
              </label>
              {task.estimatedMinutes && task.actualMinutes && task.estimatedMinutes > 0 && (
                <div style={{ flex: 1, minWidth: "80px" }}>
                  <div style={{ height: "4px", background: "var(--border)", borderRadius: "2px", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.min(100, (task.actualMinutes / task.estimatedMinutes) * 100)}%`, background: task.actualMinutes > task.estimatedMinutes ? "var(--negative)" : "var(--positive)", borderRadius: "2px" }} />
                  </div>
                  <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "2px" }}>{Math.round((task.actualMinutes / task.estimatedMinutes) * 100)}%</div>
                </div>
              )}
            </div>
          </div>

          {/* Repeat */}
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
            {fieldLabel("Repeat")}
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <select
                value={recurrence?.frequency ?? ""}
                onChange={async e => {
                  const freq = e.target.value;
                  if (!freq) {
                    await fetch(`/api/pm/tasks/${taskId}/recurrence`, { method: "DELETE" });
                    setRecurrence(null);
                  } else {
                    const nextDueDate = task?.dueDate ?? new Date().toISOString().slice(0, 10);
                    const res = await fetch(`/api/pm/tasks/${taskId}/recurrence`, {
                      method: "POST", headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ frequency: freq, nextDueDate }),
                    });
                    const d = await res.json() as { recurrence?: { frequency: string; nextDueDate: string } };
                    setRecurrence(d.recurrence ?? null);
                  }
                  setShowRepeatPicker(false);
                }}
                style={{ padding: "4px 8px", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "13px", background: "var(--bg)", color: "var(--text-primary)" }}
              >
                <option value="">Does not repeat</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Biweekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
              </select>
              {recurrence && (
                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                  Next: {recurrence.nextDueDate}
                </span>
              )}
            </div>
          </div>

          {/* Description */}
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
              {fieldLabel("Description")}
              <button onClick={() => setMarkdownPreview(p => !p)} style={{ fontSize: "11px", color: "var(--accent)", background: "none", border: "none", cursor: "pointer" }}>
                {markdownPreview ? "Edit" : "Preview"}
              </button>
            </div>
            {markdownPreview ? (
              <div style={{ fontSize: "14px", color: "var(--text-primary)", minHeight: "60px", overflowWrap: "break-word", wordBreak: "break-word" }}>
                {task.description ? (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", textDecoration: "underline", wordBreak: "break-all" }}>{children}</a>,
                      img: ({ src, alt }) => <img src={src} alt={alt ?? ""} style={{ maxWidth: "100%", borderRadius: 6, marginTop: 4, display: "block" }} />,
                    }}
                  >
                    {task.description}
                  </ReactMarkdown>
                ) : <span style={{ color: "var(--text-muted)" }}>No description</span>}
              </div>
            ) : (
              <textarea value={task.description ?? ""} onChange={e => save({ description: e.target.value })}
                placeholder="Add a description..." rows={4}
                style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "14px", background: "var(--bg)", color: "var(--text-primary)", resize: "vertical", outline: "none", fontFamily: "inherit" }} />
            )}
          </div>

          {/* Subtasks */}
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                Subtasks <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>({subtasks.filter(s => s.status === "completed").length}/{subtasks.length})</span>
              </div>
              <button onClick={() => setAddingSubtask(true)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent)", fontSize: "13px" }}>+ Add</button>
            </div>
            {subtasks.map(sub => (
              <div key={sub.id} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "4px 0" }}>
                <input type="checkbox" checked={sub.status === "completed"} onChange={() => toggleSubtask(sub)}
                  style={{ accentColor: "var(--positive)", cursor: "pointer" }} />
                <span style={{ fontSize: "13px", color: "var(--text-primary)", textDecoration: sub.status === "completed" ? "line-through" : "none", opacity: sub.status === "completed" ? 0.6 : 1 }}>
                  {sub.title}
                </span>
              </div>
            ))}
            {addingSubtask && (
              <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
                <input autoFocus value={newSubtaskTitle} onChange={e => setNewSubtaskTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") addSubtask(); if (e.key === "Escape") { setAddingSubtask(false); setNewSubtaskTitle(""); } }}
                  placeholder="Subtask title..." style={{ flex: 1, padding: "4px 8px", border: "1px solid var(--border)", borderRadius: "4px", fontSize: "13px", background: "var(--bg)", color: "var(--text-primary)", outline: "none" }} />
                <button onClick={addSubtask} style={{ padding: "4px 10px", background: "var(--accent)", color: "white", border: "none", borderRadius: "4px", fontSize: "12px", cursor: "pointer" }}>Add</button>
              </div>
            )}
          </div>

          {/* Dependencies */}
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
              {fieldLabel("Dependencies")}
              <button onClick={() => setShowDepInput(v => !v)} style={{ fontSize: "11px", color: "var(--accent)", background: "none", border: "none", cursor: "pointer" }}>+ Add</button>
            </div>
            {dependencies.length === 0 && !showDepInput && (
              <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>No dependencies.</div>
            )}
            {dependencies.map(dep => (
              <div key={dep.id} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "3px 0", fontSize: "12px", color: "var(--text-secondary)" }}>
                <span style={{ color: "var(--text-muted)" }}>{dep.type === "finish_to_start" ? "Waiting on" : "Blocks"}</span>
                <span style={{ fontFamily: "monospace", fontSize: "11px" }}>{dep.dependsOnTaskId.slice(0, 8)}…</span>
                <button onClick={async () => {
                  await fetch(`/api/pm/tasks/${taskId}/dependencies/${dep.id}`, { method: "DELETE" });
                  setDependencies(prev => prev.filter(d => d.id !== dep.id));
                }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: "12px", marginLeft: "auto" }}>×</button>
              </div>
            ))}
            {showDepInput && (
              <div style={{ display: "flex", gap: "6px", marginTop: "6px", alignItems: "center" }}>
                <select value={depType} onChange={e => setDepType(e.target.value)} style={{ padding: "4px 6px", border: "1px solid var(--border)", borderRadius: "4px", fontSize: "11px", background: "var(--bg)", color: "var(--text-primary)" }}>
                  <option value="finish_to_start">Waiting on</option>
                  <option value="blocks">Blocks</option>
                </select>
                <input value={depTaskId} onChange={e => setDepTaskId(e.target.value)}
                  placeholder="Task UUID" style={{ flex: 1, padding: "4px 8px", border: "1px solid var(--border)", borderRadius: "4px", fontSize: "12px", background: "var(--bg)", color: "var(--text-primary)", outline: "none" }} />
                <button onClick={addDependency} style={{ padding: "4px 10px", background: "var(--accent)", color: "white", border: "none", borderRadius: "4px", fontSize: "11px", cursor: "pointer" }}>Add</button>
              </div>
            )}
          </div>

          {/* Attachments */}
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
              {fieldLabel("Attachments")}
              <button onClick={() => fileInputRef.current?.click()} style={{ fontSize: "11px", color: "var(--accent)", background: "none", border: "none", cursor: "pointer" }}>+ Upload</button>
            </div>
            <input ref={fileInputRef} type="file" style={{ display: "none" }} onChange={handleFileUpload} />
            {attachments.length === 0 ? (
              <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>No attachments.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {attachments.map(att => (
                  <div key={att.id} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "4px 8px", background: "var(--panel-hover)", borderRadius: "5px" }}>
                    <span style={{ fontSize: "14px" }}>📎</span>
                    <a href={att.url} target="_blank" rel="noreferrer" style={{ fontSize: "12px", color: "var(--accent)", textDecoration: "none", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {att.filename}
                    </a>
                    {att.fileSize && (
                      <span style={{ fontSize: "10px", color: "var(--text-muted)", flexShrink: 0 }}>
                        {att.fileSize > 1024 * 1024 ? `${(att.fileSize / 1024 / 1024).toFixed(1)}MB` : `${Math.round(att.fileSize / 1024)}KB`}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Custom Fields */}
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
            <button
              onClick={() => setCustomFieldsExpanded(v => !v)}
              style={{ display: "flex", alignItems: "center", gap: "6px", background: "none", border: "none", cursor: "pointer", padding: 0, width: "100%" }}
            >
              <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" }}>
                {customFieldsExpanded ? "▾" : "▶"} Custom Fields
              </span>
              {Object.keys(customFields).length > 0 && (
                <span style={{ fontSize: "10px", color: "var(--text-muted)", padding: "1px 5px", background: "var(--panel-hover)", borderRadius: "8px" }}>
                  {Object.keys(customFields).length}
                </span>
              )}
            </button>
            {customFieldsExpanded && (
              <div style={{ marginTop: "10px" }}>
                {Object.keys(customFields).length === 0 && !addingField && (
                  <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "8px" }}>No custom fields.</div>
                )}
                {Object.entries(customFields).map(([key, value]) => (
                  <div key={key} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                    <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", width: "100px", flexShrink: 0, textTransform: "uppercase", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{key}</span>
                    {editingFieldKey === key ? (
                      <>
                        <input
                          autoFocus value={editingFieldValue}
                          onChange={e => setEditingFieldValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter") saveCustomField(key, editingFieldValue);
                            if (e.key === "Escape") setEditingFieldKey(null);
                          }}
                          onBlur={() => saveCustomField(key, editingFieldValue)}
                          style={{ flex: 1, padding: "3px 8px", border: "1px solid var(--accent)", borderRadius: "4px", fontSize: "12px", background: "var(--bg)", color: "var(--text-primary)", outline: "none" }}
                        />
                      </>
                    ) : (
                      <>
                        <span
                          onClick={() => { setEditingFieldKey(key); setEditingFieldValue(value); }}
                          style={{ flex: 1, fontSize: "13px", color: value ? "var(--text-primary)" : "var(--text-muted)", cursor: "text", minHeight: "20px" }}
                        >
                          {value || "—"}
                        </span>
                        <button onClick={() => removeCustomField(key)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: "13px", padding: "0 2px", flexShrink: 0 }}>×</button>
                      </>
                    )}
                  </div>
                ))}
                {addingField ? (
                  <div style={{ display: "flex", gap: "6px", alignItems: "center", marginTop: "4px" }}>
                    <input
                      autoFocus value={newFieldKey}
                      onChange={e => setNewFieldKey(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") addCustomField(); if (e.key === "Escape") { setAddingField(false); setNewFieldKey(""); } }}
                      placeholder="Field name"
                      style={{ flex: 1, padding: "4px 8px", border: "1px solid var(--accent)", borderRadius: "4px", fontSize: "12px", background: "var(--bg)", color: "var(--text-primary)", outline: "none" }}
                    />
                    <button onClick={addCustomField} style={{ padding: "4px 10px", background: "var(--accent)", color: "white", border: "none", borderRadius: "4px", fontSize: "11px", cursor: "pointer" }}>Add</button>
                    <button onClick={() => { setAddingField(false); setNewFieldKey(""); }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: "14px" }}>×</button>
                  </div>
                ) : (
                  <button onClick={() => setAddingField(true)} style={{ fontSize: "11px", color: "var(--accent)", background: "none", border: "none", cursor: "pointer", padding: 0, marginTop: "4px" }}>
                    + Add field
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Source message */}
          {task.sourceMessageId && (
            <div style={{ margin: "16px 20px", padding: "10px 14px", background: "var(--ai-subtle)", border: "1px solid var(--ai)", borderRadius: "8px", fontSize: "13px", color: "var(--ai)" }}>
              Created from a message{task.sourceChannelId ? ` in #${task.sourceChannelId}` : ""}.{" "}
              <a href={`https://chat.vb.co/channels/${task.sourceChannelId}?msg=${task.sourceMessageId}`} target="_blank" rel="noreferrer" style={{ color: "var(--ai)", fontWeight: 500 }}>
                View original →
              </a>
            </div>
          )}

          {/* Activity feed */}
          <div style={{ padding: "16px 20px" }}>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "12px" }}>Activity</div>
            {(() => {
              const comments = feed.filter(f => f._type === "comment");
              const hiddenCount = Math.max(0, comments.length - 3);
              const visibleCommentIds = new Set(
                (showAllFeed ? comments : comments.slice(-3)).map(c => c.id)
              );
              const visibleFeed = showAllFeed
                ? feed
                : feed.filter(f => f._type === "activity" || visibleCommentIds.has(f.id));
              return (
                <>
                  {hiddenCount > 0 && (
                    <button
                      onClick={() => setShowAllFeed(v => !v)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent)", fontSize: "13px", padding: "0 0 10px 0", display: "block" }}
                    >
                      {showAllFeed ? "Hide earlier comments" : `Show ${hiddenCount} earlier comment${hiddenCount === 1 ? "" : "s"}`}
                    </button>
                  )}
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {visibleFeed.map(item => {
                      if (item._type === "activity") {
                        const firstName = (item.userName ?? item.userId ?? "?").split(" ")[0];
                        const actionText = (ACTION_LABELS[item.action ?? ""] ?? (() => item.action ?? ""))({
                          oldValue: item.oldValue,
                          newValue: item.action === "assigned" && item.newValue
                            ? (orgUsers.find(u => u.id === item.newValue)?.name ?? item.newValue.slice(0, 8))
                            : item.newValue,
                        });
                        return (
                          <div key={item.id} style={{ display: "flex", alignItems: "center", gap: "5px", marginTop: "-4px", marginBottom: "-4px" }}>
                            <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: "var(--border)", flexShrink: 0, marginLeft: "10px" }} />
                            <div style={{ fontSize: "11px", color: "var(--text-muted)", lineHeight: 1.4 }}>
                              <span style={{ fontWeight: 500 }}>{firstName}</span>
                              {" "}{actionText}
                              {safeRelativeTime(item.createdAt) && <span style={{ marginLeft: 5, opacity: 0.7 }}>· {safeRelativeTime(item.createdAt)}</span>}
                            </div>
                          </div>
                        );
                      }
                      return (
                        <div key={item.id} style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                          <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: "var(--accent-subtle)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 600, flexShrink: 0 }}>
                            {(item.userName ?? item.userId ?? "?").slice(0, 2).toUpperCase()}
                          </div>
                          <div style={{ flex: 1 }}>
                            {editingCommentId === item.id ? (
                              <div>
                                <div style={{ border: "1px solid var(--accent)", borderRadius: "6px", overflow: "hidden" }}>
                                  <FormatToolbar textareaRef={editTextareaRef} value={editContent} onChange={setEditContent} />
                                  <textarea
                                    ref={editTextareaRef}
                                    value={editContent}
                                    onChange={e => setEditContent(e.target.value)}
                                    autoFocus
                                    onKeyDown={e => {
                                      if (e.key === "Escape") { setEditingCommentId(null); return; }
                                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { saveEdit(); return; }
                                      if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
                                        const el = editTextareaRef.current;
                                        if (!el) return;
                                        const cursor = el.selectionStart ?? editContent.length;
                                        const lineStart = editContent.lastIndexOf("\n", cursor - 1) + 1;
                                        const line = editContent.slice(lineStart, cursor);
                                        const bullet = line.match(/^(- )(.*)$/);
                                        const numbered = line.match(/^(\d+)\. (.*)$/);
                                        if (bullet) {
                                          e.preventDefault();
                                          if (!bullet[2]) {
                                            setEditContent(editContent.slice(0, lineStart) + editContent.slice(cursor));
                                            setTimeout(() => el.setSelectionRange(lineStart, lineStart), 0);
                                          } else {
                                            const ins = "\n- ";
                                            setEditContent(editContent.slice(0, cursor) + ins + editContent.slice(cursor));
                                            setTimeout(() => el.setSelectionRange(cursor + ins.length, cursor + ins.length), 0);
                                          }
                                        } else if (numbered) {
                                          e.preventDefault();
                                          const nextNum = parseInt(numbered[1]!) + 1;
                                          if (!numbered[2]) {
                                            setEditContent(editContent.slice(0, lineStart) + editContent.slice(cursor));
                                            setTimeout(() => el.setSelectionRange(lineStart, lineStart), 0);
                                          } else {
                                            const ins = `\n${nextNum}. `;
                                            setEditContent(editContent.slice(0, cursor) + ins + editContent.slice(cursor));
                                            setTimeout(() => el.setSelectionRange(cursor + ins.length, cursor + ins.length), 0);
                                          }
                                        }
                                      }
                                    }}
                                    style={{ width: "100%", padding: "8px 10px", border: "none", fontSize: "13px", background: "var(--bg)", color: "var(--text-primary)", resize: "none", outline: "none", fontFamily: "inherit", minHeight: "72px", overflow: "hidden", boxSizing: "border-box" }}
                                  />
                                </div>
                                <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
                                  <button onClick={() => setEditingCommentId(null)} style={{ padding: "3px 10px", border: "1px solid var(--border)", borderRadius: "5px", background: "transparent", color: "var(--text-secondary)", fontSize: "12px", cursor: "pointer" }}>Cancel</button>
                                  <button onClick={saveEdit} disabled={savingEdit || !editContent.trim()} style={{ padding: "3px 10px", background: "var(--accent)", color: "white", border: "none", borderRadius: "5px", fontSize: "12px", cursor: "pointer", opacity: (savingEdit || !editContent.trim()) ? 0.6 : 1 }}>
                                    {savingEdit ? "Saving…" : "Save"}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div
                                style={{ position: "relative" }}
                                onMouseEnter={() => setHoveredCommentId(item.id)}
                                onMouseLeave={() => setHoveredCommentId(null)}
                              >
                                <div style={{ background: "var(--panel-hover)", borderRadius: "8px", padding: "8px 10px", fontSize: "13px", color: "var(--text-primary)", overflowWrap: "break-word", wordBreak: "break-word", minWidth: 0 }}>
                                  <CommentContent content={item.content ?? ""} />
                                  {item.source === "email" && (
                                    <span title="Via email reply" style={{ marginLeft: "6px", fontSize: "11px", color: "var(--text-muted)" }}>&#128231;</span>
                                  )}
                                </div>
                                {hoveredCommentId === item.id && currentUserId === item.userId && (
                                  <div style={{ position: "absolute", top: 4, right: 6, display: "flex", gap: "3px" }}>
                                    <button
                                      onClick={() => { setEditingCommentId(item.id); setEditContent(item.content ?? ""); }}
                                      title="Edit"
                                      style={{ padding: "2px 6px", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "4px", fontSize: "11px", cursor: "pointer", color: "var(--text-muted)" }}
                                    >✏</button>
                                    <button
                                      onClick={() => deleteComment(item.id)}
                                      title="Delete"
                                      style={{ padding: "2px 6px", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "4px", fontSize: "11px", cursor: "pointer", color: "#ef4444" }}
                                    >✕</button>
                                  </div>
                                )}
                              </div>
                            )}
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "3px" }}>
                              {(() => {
                                const reactions = item.reactions ?? [];
                                const reacted = reactions.some(r => r.userId === currentUserId);
                                const visible = hoveredCommentId === item.id || reactions.length > 0;
                                return (
                                  <button
                                    onClick={() => toggleReaction(item.id)}
                                    title={reactions.length > 0 ? reactions.map(r => r.userName ?? "Someone").join(", ") + " liked this" : "Like"}
                                    style={{
                                      display: "flex", alignItems: "center", gap: "3px",
                                      padding: "1px 6px",
                                      background: reacted ? "var(--accent-subtle)" : "transparent",
                                      border: `1px solid ${reacted ? "var(--accent)" : "var(--border)"}`,
                                      borderRadius: "10px", cursor: "pointer", fontSize: "12px",
                                      color: reacted ? "var(--accent)" : "var(--text-muted)",
                                      opacity: visible ? 1 : 0,
                                      transition: "opacity 0.1s",
                                      lineHeight: 1,
                                    }}
                                  >
                                    👍{reactions.length > 0 && <span style={{ marginLeft: "2px" }}>{reactions.length}</span>}
                                  </button>
                                );
                              })()}
                              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                                {safeRelativeTime(item.createdAt)}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}
            <div style={{ marginTop: "16px" }}>
              <input ref={commentFileRef} type="file" style={{ display: "none" }} onChange={handleCommentFileAttach} />
              <div style={{ position: "relative" }}>
                <div style={{ border: `1px solid ${commentError ? "#ef4444" : "var(--border)"}`, borderRadius: "6px", overflow: "hidden" }}>
                  <FormatToolbar textareaRef={textareaRef} value={comment} onChange={setComment} />
                  <textarea
                    ref={textareaRef}
                    value={comment}
                    onPaste={handleCommentPaste}
                    onChange={e => {
                      const val = e.target.value;
                      setComment(val);
                      if (commentError) setCommentError("");
                      const cursor = e.target.selectionStart ?? val.length;
                      const before = val.slice(0, cursor);
                      const match = before.match(/@([\w.]*)$/);
                      if (match) {
                        setMentionQuery(match[1]!);
                        setMentionStart(cursor - match[0].length);
                      } else {
                        setMentionQuery(null);
                        setMentionStart(-1);
                      }
                    }}
                    onKeyDown={e => {
                      if (e.key === "Escape") { setMentionQuery(null); return; }
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { postComment(); return; }
                      if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
                        const el = textareaRef.current;
                        if (!el) return;
                        const cursor = el.selectionStart ?? comment.length;
                        const lineStart = comment.lastIndexOf("\n", cursor - 1) + 1;
                        const line = comment.slice(lineStart, cursor);
                        const bullet = line.match(/^(- )(.*)$/);
                        const numbered = line.match(/^(\d+)\. (.*)$/);
                        if (bullet) {
                          e.preventDefault();
                          if (!bullet[2]) {
                            setComment(comment.slice(0, lineStart) + comment.slice(cursor));
                            setTimeout(() => el.setSelectionRange(lineStart, lineStart), 0);
                          } else {
                            const ins = "\n- ";
                            setComment(comment.slice(0, cursor) + ins + comment.slice(cursor));
                            setTimeout(() => el.setSelectionRange(cursor + ins.length, cursor + ins.length), 0);
                          }
                        } else if (numbered) {
                          e.preventDefault();
                          const nextNum = parseInt(numbered[1]!) + 1;
                          if (!numbered[2]) {
                            setComment(comment.slice(0, lineStart) + comment.slice(cursor));
                            setTimeout(() => el.setSelectionRange(lineStart, lineStart), 0);
                          } else {
                            const ins = `\n${nextNum}. `;
                            setComment(comment.slice(0, cursor) + ins + comment.slice(cursor));
                            setTimeout(() => el.setSelectionRange(cursor + ins.length, cursor + ins.length), 0);
                          }
                        }
                      }
                    }}
                    placeholder="Add a comment… (⌘Enter to post)"
                    style={{ width: "100%", padding: "8px 10px", border: "none", fontSize: "13px", background: "var(--bg)", color: "var(--text-primary)", resize: "none", outline: "none", fontFamily: "inherit", minHeight: "72px", overflow: "hidden", boxSizing: "border-box" }}
                  />
                </div>
                {mentionQuery !== null && (
                  <div style={{ position: "absolute", bottom: "calc(100% + 4px)", left: 0, zIndex: 300, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "8px", boxShadow: "0 8px 24px rgba(0,0,0,0.2)", width: "220px", maxHeight: "180px", overflowY: "auto" }}>
                    {orgUsers
                      .filter(u => !mentionQuery || u.name.toLowerCase().includes(mentionQuery.toLowerCase()) || u.email.toLowerCase().includes(mentionQuery.toLowerCase()))
                      .slice(0, 8)
                      .map(u => (
                        <button
                          key={u.id}
                          type="button"
                          onMouseDown={e => {
                            e.preventDefault();
                            const firstName = u.name.split(" ")[0]!;
                            // Replace from mentionStart (the @) to cursor with @FirstName
                            const cursor = textareaRef.current?.selectionStart ?? comment.length;
                            const before = comment.slice(0, mentionStart);
                            const after = comment.slice(cursor);
                            setComment(`${before}@${firstName} ${after}`);
                            setMentionQuery(null);
                            setMentionStart(-1);
                            setTimeout(() => textareaRef.current?.focus(), 0);
                          }}
                          style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%", padding: "7px 12px", background: "none", border: "none", cursor: "pointer", fontSize: "13px", color: "var(--text-primary)", textAlign: "left" }}
                          onMouseEnter={e => (e.currentTarget.style.background = "var(--panel-hover)")}
                          onMouseLeave={e => (e.currentTarget.style.background = "none")}
                        >
                          <Avatar name={u.name} size={20} />
                          <div>
                            <div style={{ fontWeight: 500, lineHeight: 1.2 }}>{u.name}</div>
                            <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{u.email}</div>
                          </div>
                        </button>
                      ))}
                    {orgUsers.filter(u => !mentionQuery || u.name.toLowerCase().includes(mentionQuery.toLowerCase()) || u.email.toLowerCase().includes(mentionQuery.toLowerCase())).length === 0 && (
                      <div style={{ padding: "10px 12px", fontSize: "12px", color: "var(--text-muted)" }}>No users found</div>
                    )}
                  </div>
                )}
              </div>
              {commentError && <div style={{ fontSize: "12px", color: "#ef4444", marginTop: "4px" }}>{commentError}</div>}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "6px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <button
                    type="button"
                    onClick={() => commentFileRef.current?.click()}
                    disabled={uploadingImage}
                    title="Attach file or image"
                    style={{ padding: "5px 8px", border: "1px solid var(--border)", borderRadius: "6px", background: "none", cursor: "pointer", fontSize: "14px", color: "var(--text-muted)", opacity: uploadingImage ? 0.5 : 1 }}
                  >
                    📎
                  </button>
                  {uploadingImage && <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Uploading…</span>}
                </div>
                <button onClick={postComment} disabled={!comment.trim() || postingComment || uploadingImage} style={{ padding: "6px 14px", background: "var(--accent)", color: "white", border: "none", borderRadius: "6px", fontSize: "13px", fontWeight: 500, cursor: "pointer", opacity: (comment.trim() && !postingComment && !uploadingImage) ? 1 : 0.5 }}>
                  {postingComment ? "Posting…" : "Post"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
