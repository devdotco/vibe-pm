"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow, isToday, isYesterday, parseISO } from "date-fns";

interface Notification {
  id: string; type: string; taskId: string | null; projectId: string | null;
  isRead: boolean; createdAt: string; triggeredByUserId: string | null;
  taskTitle: string | null;
}

const TYPE_ICONS: Record<string, string> = {
  "task.created": "✓", "task.completed": "✅", "task.overdue": "⚠️",
  "task.assigned": "👤", "milestone.reached": "🏆", "comment.reaction": "👍",
  "comment.mention": "@", default: "🔔",
};
const TYPE_LABELS: Record<string, string> = {
  "task.created": "A task was created", "task.completed": "A task was completed",
  "task.overdue": "A task is overdue", "task.assigned": "You were assigned a task",
  "milestone.reached": "A milestone was reached", "comment.reaction": "Someone liked your comment",
  "comment.mention": "You were mentioned in a comment",
};

export default function InboxPage() {
  const router = useRouter();
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/pm/notifications").then(r => r.json()).then(d => {
      setNotifs(d.notifications ?? []);
      setLoading(false);
    });
  }, []);

  const markRead = async (id: string) => {
    await fetch(`/api/pm/notifications/${id}/read`, { method: "PATCH" });
    setNotifs(n => n.map(x => x.id === id ? { ...x, isRead: true } : x));
  };

  const markAllRead = async () => {
    await fetch("/api/pm/notifications/read-all", { method: "PATCH" });
    setNotifs(n => n.map(x => ({ ...x, isRead: true })));
  };

  const handleClick = async (n: Notification) => {
    if (!n.isRead) await markRead(n.id);
    if (n.taskId) router.push(`/tasks/${n.taskId}`);
  };

  if (loading) return <div style={{ padding: "32px", color: "var(--text-muted)" }}>Loading...</div>;

  const groups = {
    Today: notifs.filter(n => isToday(parseISO(n.createdAt))),
    Yesterday: notifs.filter(n => isYesterday(parseISO(n.createdAt))),
    Earlier: notifs.filter(n => !isToday(parseISO(n.createdAt)) && !isYesterday(parseISO(n.createdAt))),
  };
  const unreadCount = notifs.filter(n => !n.isRead).length;

  return (
    <div style={{ maxWidth: "680px", margin: "0 auto", padding: "32px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
        <div>
          <h2 style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-primary)" }}>Inbox</h2>
          {unreadCount > 0 && <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{unreadCount} unread</span>}
        </div>
        {unreadCount > 0 && (
          <button onClick={markAllRead} style={{ padding: "6px 12px", border: "1px solid var(--border)", borderRadius: "6px", background: "var(--bg)", color: "var(--text-secondary)", fontSize: "13px", cursor: "pointer" }}>
            Mark all read
          </button>
        )}
      </div>
      {Object.entries(groups).map(([group, items]) => {
        if (!items.length) return null;
        return (
          <div key={group} style={{ marginBottom: "20px" }}>
            <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", padding: "0 4px 8px" }}>{group}</div>
            <div style={{ background: "var(--bg-elevated)", borderRadius: "8px", border: "1px solid var(--border)", overflow: "hidden" }}>
              {items.map((n, i) => (
                <div key={n.id} onClick={() => handleClick(n)} style={{
                  display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px",
                  borderBottom: i < items.length - 1 ? "1px solid var(--border)" : "none",
                  background: n.isRead ? "transparent" : "var(--accent-subtle)",
                  cursor: n.taskId ? "pointer" : "default",
                }}>
                  <span style={{
                    fontSize: n.type === "comment.mention" ? "14px" : "18px",
                    fontWeight: n.type === "comment.mention" ? 700 : 400,
                    color: n.type === "comment.mention" ? "var(--accent)" : "inherit",
                    flexShrink: 0,
                    width: "24px",
                    textAlign: "center",
                  }}>
                    {TYPE_ICONS[n.type] ?? TYPE_ICONS.default}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "14px", color: "var(--text-primary)", fontWeight: n.isRead ? 400 : 500 }}>
                      {TYPE_LABELS[n.type] ?? n.type}
                    </div>
                    {n.taskTitle && (
                      <div style={{ fontSize: "12px", color: n.taskId ? "var(--accent)" : "var(--text-muted)", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {n.taskTitle}
                      </div>
                    )}
                    {!n.taskTitle && n.projectId && (
                      <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Project activity</div>
                    )}
                  </div>
                  <span style={{ fontSize: "12px", color: "var(--text-muted)", flexShrink: 0 }}>
                    {formatDistanceToNow(parseISO(n.createdAt), { addSuffix: true })}
                  </span>
                  {!n.isRead && <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--accent)", flexShrink: 0 }} />}
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {notifs.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)" }}>
          <div style={{ fontSize: "40px", marginBottom: "12px" }}>🔔</div>
          <div style={{ fontSize: "15px" }}>No notifications yet</div>
        </div>
      )}
    </div>
  );
}
