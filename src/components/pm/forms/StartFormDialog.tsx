"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/base-path";
import { CrmPicker, type CrmRecord } from "./CrmPicker";

interface ProjectOption { id: string; name: string }
interface MemberOption { id: string; name: string }

/**
 * Start a form. From the Forms list this creates the task; from a task
 * (`taskId` given) it attaches to that one. The form's own defaults fill the
 * project, section and assignee, so the usual case is: pick the customer, go.
 */
export function StartFormDialog({
  form,
  taskId,
  onClose,
  onStarted,
}: {
  form: { id: string; title: string; defaultProject?: { id: string; name: string } | null };
  taskId?: string;
  onClose: () => void;
  onStarted: (submissionId: string) => void;
}) {
  const [company, setCompany] = useState<CrmRecord | null>(null);
  const [person, setPerson] = useState<CrmRecord | null>(null);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [projectId, setProjectId] = useState<string>(form.defaultProject?.id ?? "");
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [dueDate, setDueDate] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (taskId) return;
    apiFetch("/api/pm/projects").then((r) => r.json()).then((d) => setProjects(d.projects ?? []));
    apiFetch("/api/pm/admin/users").then((r) => r.json()).then((d) => setMembers((d.users ?? []).filter((u: { status: string }) => u.status === "active")));
  }, [taskId]);

  const start = async () => {
    setBusy(true);
    setError("");
    const res = await apiFetch(`/api/pm/forms/${form.id}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(taskId ? { taskId } : {}),
        ...(projectId && !taskId ? { projectId } : {}),
        ...(assigneeId && !taskId ? { assigneeId } : {}),
        ...(dueDate && !taskId ? { dueDate } : {}),
        ...(company ? { crmCompanyId: company.id } : {}),
        ...(person ? { crmPersonId: person.id } : {}),
      }),
    });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(d.error ?? "Could not start this form");
      return;
    }
    onStarted(d.submission.id);
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 12, padding: 22, width: "100%", maxWidth: 440, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.25)" }}
      >
        <h3 style={{ fontSize: 17, fontWeight: 650, color: "var(--text-primary)" }}>{form.title}</h3>
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "4px 0 18px" }}>
          {taskId ? "Attach this form to the task." : "This creates a task and opens the form."}
        </p>

        <div style={{ display: "grid", gap: 14 }}>
          <CrmPicker type="company" label="Customer" value={company} onChange={(r) => { setCompany(r); if (person && r?.id !== person.companyId) setPerson(null); }} />
          <CrmPicker type="person" label="Contact" companyId={company?.id ?? null} value={person} onChange={(r) => { setPerson(r); if (r?.companyId && !company) setCompany({ type: "company", id: r.companyId, name: r.companyName ?? "", subtitle: null }); }} />

          {!taskId && (
            <>
              <Field label="Project">
                <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={selectStyle}>
                  <option value="">{form.defaultProject ? `${form.defaultProject.name} (form default)` : "Choose a project…"}</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Assign to">
                  <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} style={selectStyle}>
                    <option value="">Form default</option>
                    {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </Field>
                <Field label="Due date">
                  <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={selectStyle} />
                </Field>
              </div>
            </>
          )}
        </div>

        {error && <div style={{ color: "#ef4444", fontSize: 13, marginTop: 14 }}>{error}</div>}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
          <button onClick={onClose} style={{ padding: "9px 16px", border: "1px solid var(--border)", borderRadius: 6, background: "transparent", color: "var(--text-secondary)", fontSize: 14, cursor: "pointer" }}>Cancel</button>
          <button
            onClick={start}
            disabled={busy}
            style={{ padding: "9px 18px", background: "var(--accent)", color: "white", border: "none", borderRadius: 6, fontSize: 14, fontWeight: 500, cursor: busy ? "wait" : "pointer", opacity: busy ? 0.7 : 1 }}
          >
            {busy ? "Starting…" : taskId ? "Attach form" : "Start form"}
          </button>
        </div>
      </div>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px", border: "1px solid var(--border)", borderRadius: 8,
  fontSize: 14, background: "var(--bg)", color: "var(--text-primary)", outline: "none",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  );
}
