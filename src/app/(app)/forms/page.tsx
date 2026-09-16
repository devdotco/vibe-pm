"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, MoreHorizontal, Plus, Search } from "lucide-react";
import { apiFetch, withBase } from "@/lib/base-path";
import { StartFormDialog } from "@/components/pm/forms/StartFormDialog";
import { AnchoredMenu, MenuItem } from "@/components/pm/forms/AnchoredMenu";

export interface FormListItem {
  id: string;
  title: string;
  description: string | null;
  status: string;
  version: number;
  questionCount: number;
  defaultProject: { id: string; name: string; color: string } | null;
  autoAttachProjects: Array<{ id: string; name: string; color: string }>;
  submittedCount: number;
  draftCount: number;
  updatedAt: string;
}

/**
 * Every form in the workspace — Jobber's Checklists screen. Anyone can search
 * and start one; only an organization admin sees New form and the ⋯ menu.
 */
export default function FormsPage() {
  const router = useRouter();
  const [forms, setForms] = useState<FormListItem[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [menu, setMenu] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  const [starting, setStarting] = useState<FormListItem | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch(`/api/pm/forms${showArchived ? "?status=archived" : ""}`)
      .then((r) => r.json())
      .then((d) => {
        setForms(d.forms ?? []);
        setCanManage(!!d.canManage);
      })
      .finally(() => setLoading(false));
  }, [showArchived]);

  useEffect(load, [load]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? forms.filter((f) => f.title.toLowerCase().includes(q)) : forms;
  }, [forms, query]);

  const create = async () => {
    setBusy(true);
    const res = await apiFetch("/api/pm/forms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Untitled form" }),
    });
    const d = await res.json();
    setBusy(false);
    if (d.form) router.push(`/forms/${d.form.id}/edit`);
  };

  const duplicate = async (id: string) => {
    const res = await apiFetch(`/api/pm/forms/${id}/duplicate`, { method: "POST" });
    const d = await res.json();
    if (d.form) router.push(`/forms/${d.form.id}/edit`);
  };

  const setStatus = async (id: string, status: "active" | "archived") => {
    await apiFetch(`/api/pm/forms/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  };

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "32px 24px 80px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--text-primary)" }}>Forms</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4, maxWidth: 620 }}>
            Job forms your team fills in on site. Starting one creates a task; submitting it files the report
            against the customer in the CRM.
          </p>
        </div>
        {canManage && (
          <button
            onClick={create}
            disabled={busy}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", background: "var(--accent)", color: "white", border: "none", borderRadius: 6, fontSize: 14, fontWeight: 500, cursor: busy ? "wait" : "pointer" }}
          >
            <Plus size={16} /> New form
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", margin: "22px 0 14px", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 260px", maxWidth: 340 }}>
          <Search size={15} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search forms..."
            style={{ width: "100%", padding: "9px 12px 9px 32px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 14, background: "var(--bg)", color: "var(--text-primary)", outline: "none" }}
          />
        </div>
        <button
          onClick={() => setShowArchived((v) => !v)}
          style={{ padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 8, background: showArchived ? "var(--bg-elevated)" : "transparent", color: "var(--text-secondary)", fontSize: 13, cursor: "pointer" }}
        >
          {showArchived ? "Showing archived" : "Show archived"}
        </button>
      </div>

      <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", background: "var(--bg-elevated)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,2.2fr) minmax(0,1.4fr) 120px 44px", gap: 12, padding: "10px 16px", borderBottom: "1px solid var(--border)", fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>
          <div>Name</div>
          <div className="pm-forms-hide-sm">Auto attach</div>
          <div className="pm-forms-hide-sm">Submissions</div>
          <div />
        </div>

        {loading && <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>Loading…</div>}

        {!loading && visible.length === 0 && (
          <div style={{ padding: "48px 24px", textAlign: "center" }}>
            <ClipboardList size={28} style={{ color: "var(--text-muted)" }} />
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginTop: 10 }}>
              {query ? "No forms match that search" : showArchived ? "No archived forms" : "No forms yet"}
            </div>
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
              {canManage ? "Create one, then it can be started from here or from any task." : "An organization admin can create the first one."}
            </div>
          </div>
        )}

        {!loading && visible.map((f, i) => (
          <div
            key={f.id}
            style={{ display: "grid", gridTemplateColumns: "minmax(0,2.2fr) minmax(0,1.4fr) 120px 44px", gap: 12, padding: "14px 16px", borderBottom: i < visible.length - 1 ? "1px solid var(--border)" : "none", alignItems: "center" }}
          >
            <div style={{ minWidth: 0 }}>
              <a
                href={withBase(`/forms/${f.id}`)}
                style={{ fontSize: 14.5, fontWeight: 600, color: "var(--text-primary)", textDecoration: "none", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              >
                {f.title}
              </a>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                {f.questionCount} question{f.questionCount === 1 ? "" : "s"}
                {f.defaultProject ? ` · ${f.defaultProject.name}` : ""}
              </div>
            </div>
            <div className="pm-forms-hide-sm" style={{ fontSize: 13, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {f.autoAttachProjects.length
                ? f.autoAttachProjects.map((p) => p.name).join(", ")
                : <span style={{ color: "var(--text-muted)" }}>—</span>}
            </div>
            <div className="pm-forms-hide-sm" style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              {f.submittedCount}
              {f.draftCount > 0 && <span style={{ color: "var(--text-muted)" }}> · {f.draftCount} draft</span>}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, position: "relative" }}>
              {f.status === "active" && (
                <button
                  onClick={() => setStarting(f)}
                  style={{ padding: "6px 12px", border: "1px solid var(--border)", borderRadius: 6, background: "transparent", color: "var(--text-primary)", fontSize: 13, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap" }}
                >
                  Start
                </button>
              )}
              {canManage && (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); setMenu(menu?.id === f.id ? null : { id: f.id, anchor: e.currentTarget }); }}
                    aria-label="More"
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 4 }}
                  >
                    <MoreHorizontal size={18} />
                  </button>
                  {menu?.id === f.id && (
                    <AnchoredMenu anchor={menu.anchor} onClose={() => setMenu(null)}>
                      <MenuItem onClick={() => { setMenu(null); router.push(`/forms/${f.id}/edit`); }}>Edit</MenuItem>
                      <MenuItem onClick={() => { setMenu(null); duplicate(f.id); }}>Duplicate</MenuItem>
                      <MenuItem onClick={() => { setMenu(null); window.location.href = withBase(`/api/pm/forms/${f.id}/export`); }}>Export CSV</MenuItem>
                      {f.status === "active"
                        ? <MenuItem danger onClick={() => { setMenu(null); setStatus(f.id, "archived"); }}>Archive</MenuItem>
                        : <MenuItem onClick={() => { setMenu(null); setStatus(f.id, "active"); }}>Restore</MenuItem>}
                    </AnchoredMenu>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {starting && (
        <StartFormDialog
          form={{ id: starting.id, title: starting.title, defaultProject: starting.defaultProject }}
          onClose={() => setStarting(null)}
          onStarted={(submissionId) => router.push(`/forms/submissions/${submissionId}`)}
        />
      )}

      <style>{`@media (max-width: 720px) { .pm-forms-hide-sm { display: none; } }`}</style>
    </div>
  );
}
