"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { StatusSelect } from "@/components/pm/StatusBadge";
import { PrioritySelect } from "@/components/pm/PriorityBadge";
import ReactMarkdown from "react-markdown";
import { formatDistanceToNow, parseISO } from "date-fns";

interface Task {
  id: string; title: string; description: string | null; status: string; priority: string;
  dueDate: string | null; assigneeId: string | null; sectionId: string | null;
  labels: string[]; projectId: string; sourceMessageId: string | null; sourceChannelId: string | null;
  completedAt: string | null; parentTaskId: string | null;
}
interface FeedItem {
  id: string; _type: "activity" | "comment"; content?: string; action?: string;
  oldValue?: string | null; newValue?: string | null; userId: string; createdAt: string;
  userName?: string | null;
}
interface SubTask {
  id: string; title: string; status: string; assigneeId: string | null; dueDate: string | null;
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

export function TaskDetailPanel({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const [task, setTask] = useState<Task | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [subtasks, setSubtasks] = useState<SubTask[]>([]);
  const [comment, setComment] = useState("");
  const [markdownPreview, setMarkdownPreview] = useState(false);
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetch(`/api/pm/tasks/${taskId}`).then(r => r.json()).then(d => setTask(d.task));
    fetch(`/api/pm/tasks/${taskId}/activity`).then(r => r.json()).then(d => setFeed(d.feed ?? []));
    fetch(`/api/pm/tasks/${taskId}/subtasks`).then(r => r.json()).then(d => setSubtasks(d.subtasks ?? []));
  }, [taskId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const save = useCallback((patch: Partial<Task>) => {
    if (!task) return;
    setTask(t => t ? { ...t, ...patch } : t);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await fetch(`/api/pm/tasks/${taskId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
      });
      // refresh feed
      fetch(`/api/pm/tasks/${taskId}/activity`).then(r => r.json()).then(d => setFeed(d.feed ?? []));
    }, 500);
  }, [task, taskId]);

  const postComment = async () => {
    if (!comment.trim()) return;
    await fetch(`/api/pm/tasks/${taskId}/comments`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: comment.trim() }),
    });
    setComment("");
    fetch(`/api/pm/tasks/${taskId}/activity`).then(r => r.json()).then(d => setFeed(d.feed ?? []));
  };

  const addSubtask = async () => {
    if (!newSubtaskTitle.trim()) return;
    const res = await fetch(`/api/pm/tasks/${taskId}/subtasks`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: newSubtaskTitle.trim() }),
    });
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

  if (!task) return (
    <div style={{ position: "fixed", right: 0, top: 0, bottom: 0, width: "520px", background: "var(--bg-elevated)", borderLeft: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", zIndex: 100 }}>
      Loading...
    </div>
  );

  return (
    <>
      {/* Overlay */}
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 99 }} />

      {/* Panel */}
      <div style={{
        position: "fixed", right: 0, top: 0, bottom: 0, width: "520px", maxWidth: "100vw",
        background: "var(--bg-elevated)", borderLeft: "1px solid var(--border)",
        display: "flex", flexDirection: "column", zIndex: 100,
        boxShadow: "-4px 0 24px rgba(0,0,0,0.08)",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "16px 20px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <input
            type="checkbox"
            checked={task.status === "completed"}
            onChange={complete}
            style={{ width: "16px", height: "16px", accentColor: "var(--positive)", cursor: "pointer", flexShrink: 0 }}
          />
          <input
            value={task.title}
            onChange={e => save({ title: e.target.value })}
            style={{ flex: 1, border: "none", background: "transparent", fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", outline: "none" }}
          />
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: "20px", lineHeight: 1, padding: "0 2px" }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {/* Metadata */}
          <div style={{ padding: "16px 20px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", borderBottom: "1px solid var(--border)" }}>
            <div>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px", fontWeight: 600, textTransform: "uppercase" }}>Status</div>
              <StatusSelect value={task.status} onChange={v => save({ status: v })} />
            </div>
            <div>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px", fontWeight: 600, textTransform: "uppercase" }}>Priority</div>
              <PrioritySelect value={task.priority} onChange={v => save({ priority: v })} />
            </div>
            <div>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px", fontWeight: 600, textTransform: "uppercase" }}>Due date</div>
              <input
                type="date"
                value={task.dueDate ?? ""}
                onChange={e => save({ dueDate: e.target.value || null })}
                style={{ padding: "4px 8px", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "13px", background: "var(--bg)", color: "var(--text-primary)", cursor: "pointer" }}
              />
            </div>
          </div>

          {/* Description */}
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
              <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>Description</div>
              <button onClick={() => setMarkdownPreview(p => !p)} style={{ fontSize: "11px", color: "var(--accent)", background: "none", border: "none", cursor: "pointer" }}>
                {markdownPreview ? "Edit" : "Preview"}
              </button>
            </div>
            {markdownPreview ? (
              <div style={{ fontSize: "14px", color: "var(--text-primary)", minHeight: "60px" }}>
                {task.description ? <ReactMarkdown>{task.description}</ReactMarkdown> : <span style={{ color: "var(--text-muted)" }}>No description</span>}
              </div>
            ) : (
              <textarea
                value={task.description ?? ""}
                onChange={e => save({ description: e.target.value })}
                placeholder="Add a description..."
                rows={4}
                style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "14px", background: "var(--bg)", color: "var(--text-primary)", resize: "vertical", outline: "none", fontFamily: "inherit" }}
              />
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

          {/* Source message banner */}
          {task.sourceMessageId && (
            <div style={{ margin: "16px 20px", padding: "10px 14px", background: "var(--ai-subtle)", border: "1px solid var(--ai)", borderRadius: "8px", fontSize: "13px", color: "var(--ai)" }}>
              Created from a message{task.sourceChannelId ? ` in #${task.sourceChannelId}` : ""}.{" "}
              <a href={`https://messaging.vb.co/channels/${task.sourceChannelId}?msg=${task.sourceMessageId}`} target="_blank" rel="noreferrer" style={{ color: "var(--ai)", fontWeight: 500 }}>
                View original message →
              </a>
            </div>
          )}

          {/* Activity feed */}
          <div style={{ padding: "16px 20px" }}>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "12px" }}>Activity</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {feed.map(item => (
                <div key={item.id} style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                  <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: "var(--accent-subtle)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 600, flexShrink: 0 }}>
                    {(item.userName ?? item.userId).slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    {item._type === "comment" ? (
                      <div style={{ background: "var(--panel-hover)", borderRadius: "8px", padding: "8px 10px", fontSize: "13px", color: "var(--text-primary)" }}>
                        {item.content}
                      </div>
                    ) : (
                      <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                        <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>{item.userName ?? item.userId.slice(0, 8)}</span>
                        {" "}{(ACTION_LABELS[item.action ?? ""] ?? (() => item.action ?? ""))({ oldValue: item.oldValue, newValue: item.newValue })}
                      </div>
                    )}
                    <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "3px" }}>
                      {formatDistanceToNow(parseISO(item.createdAt), { addSuffix: true })}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Comment input */}
            <div style={{ marginTop: "16px" }}>
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="Add a comment..."
                rows={3}
                style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "13px", background: "var(--bg)", color: "var(--text-primary)", resize: "none", outline: "none", fontFamily: "inherit" }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "6px" }}>
                <button onClick={postComment} disabled={!comment.trim()} style={{ padding: "6px 14px", background: "var(--accent)", color: "white", border: "none", borderRadius: "6px", fontSize: "13px", fontWeight: 500, cursor: "pointer", opacity: comment.trim() ? 1 : 0.5 }}>
                  Post
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
