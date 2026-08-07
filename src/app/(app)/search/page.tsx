"use client";
import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { PriorityDot } from "@/components/pm/PriorityBadge";
import { StatusBadge } from "@/components/pm/StatusBadge";

export default function SearchPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [type, setType] = useState<"tasks" | "projects" | "comments">("tasks");
  const [results, setResults] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!q || q.length < 2) { setResults([]); return; }
    setLoading(true);
    fetch(`/api/pm/search?q=${encodeURIComponent(q)}&type=${type}`)
      .then(r => r.json())
      .then(d => { setResults(d.results ?? []); setLoading(false); });
  }, [q, type]);

  return (
    <div style={{ maxWidth: "720px", margin: "0 auto", padding: "32px 24px" }}>
      <input
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="Search tasks, projects, comments..."
        autoFocus
        style={{ width: "100%", padding: "10px 16px", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "15px", background: "var(--bg-elevated)", color: "var(--text-primary)", outline: "none", marginBottom: "16px" }}
      />
      <div style={{ display: "flex", gap: "4px", marginBottom: "20px" }}>
        {(["tasks", "projects", "comments"] as const).map(t => (
          <button key={t} onClick={() => setType(t)} style={{
            padding: "6px 14px", border: "1px solid " + (type === t ? "var(--accent)" : "var(--border)"), background: type === t ? "var(--accent)" : "var(--bg-elevated)",
            color: type === t ? "white" : "var(--text-secondary)", borderRadius: "6px", fontSize: "13px",
            fontWeight: type === t ? 600 : 400, cursor: "pointer", textTransform: "capitalize",
          }}>
            {t}
          </button>
        ))}
      </div>
      {loading && <div style={{ color: "var(--text-muted)", padding: "20px 0" }}>Searching...</div>}
      {!loading && results.length === 0 && q.length >= 2 && (
        <div style={{ color: "var(--text-muted)", textAlign: "center", padding: "40px 0" }}>No results for &ldquo;{q}&rdquo;</div>
      )}
      {!loading && results.length === 0 && q.length < 2 && (
        <div style={{ color: "var(--text-muted)", textAlign: "center", padding: "40px 0" }}>Type at least 2 characters to search</div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {type === "tasks" && (results as Array<{ task: { id: string; title: string; status: string; priority: string }; projectName: string }>).map(r => (
          <a key={r.task.id} href={`/projects/${r.task.id}`} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "8px", textDecoration: "none" }}>
            <PriorityDot priority={r.task.priority} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "14px", color: "var(--text-primary)", fontWeight: 500 }}>{r.task.title}</div>
              <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>{r.projectName}</div>
            </div>
            <StatusBadge status={r.task.status} />
          </a>
        ))}
        {type === "projects" && (results as Array<{ id: string; name: string; color: string; status: string }>).map(p => (
          <a key={p.id} href={`/projects/${p.id}`} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "8px", textDecoration: "none" }}>
            <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: p.color, flexShrink: 0 }} />
            <span style={{ fontSize: "14px", color: "var(--text-primary)", flex: 1 }}>{p.name}</span>
          </a>
        ))}
        {type === "comments" && (results as Array<{ id: string; content: string; taskId: string }>).map(c => (
          <div key={c.id} style={{ padding: "12px 16px", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "8px" }}>
            <div style={{ fontSize: "13px", color: "var(--text-primary)" }}>{c.content.slice(0, 200)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
