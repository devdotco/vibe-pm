"use client";
import { useState, useEffect, use } from "react";

interface Stats { total: number; completed: number; overdue: number; completionRate: number; }

export default function StatsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch(`/api/pm/projects/${projectId}/stats`).then(r => r.json()).then(setStats);
  }, [projectId]);

  if (!stats) return <div style={{ padding: "32px", color: "var(--text-muted)" }}>Loading...</div>;

  const cards = [
    { label: "Completion Rate", value: `${stats.completionRate}%`, color: "var(--positive)" },
    { label: "Total Tasks", value: stats.total, color: "var(--accent)" },
    { label: "Completed", value: stats.completed, color: "var(--positive)" },
    { label: "Overdue", value: stats.overdue, color: "var(--negative)" },
  ];

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto", padding: "32px 24px" }}>
      <h2 style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "24px" }}>Project Stats</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "32px" }}>
        {cards.map(card => (
          <div key={card.label} style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "10px", padding: "20px" }}>
            <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>{card.label}</div>
            <div style={{ fontSize: "28px", fontWeight: 700, color: card.color }}>{card.value}</div>
          </div>
        ))}
      </div>
      {/* Completion bar */}
      <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "10px", padding: "24px" }}>
        <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "16px" }}>Progress</div>
        <div style={{ height: "12px", background: "var(--border)", borderRadius: "6px", overflow: "hidden" }}>
          <div style={{ width: `${stats.completionRate}%`, height: "100%", background: "var(--positive)", borderRadius: "6px", transition: "width 0.4s" }} />
        </div>
        <div style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "8px" }}>
          {stats.completed} of {stats.total} tasks completed
        </div>
      </div>
    </div>
  );
}
