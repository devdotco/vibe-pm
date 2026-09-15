"use client";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ClipboardList } from "lucide-react";
import { apiFetch, withBase } from "@/lib/base-path";
import { StartFormDialog } from "./StartFormDialog";

interface TaskForm {
  id: string;
  templateId: string;
  title: string;
  status: string;
  submittedAt: string | null;
  submittedByName: string | null;
  companyName: string | null;
  crmSyncError: string | null;
  progress: { requiredAnswered: number; requiredTotal: number; answered: number; total: number };
}

interface FormOption { id: string; title: string; status: string }

/**
 * The forms on this task, inside the task drawer.
 *
 * `onOpenCount` reports how many are still unsubmitted so the drawer can warn
 * before the task is completed — Jobber's "incomplete job forms", which is the
 * whole point of attaching a checklist to a job.
 */
export function TaskFormsPanel({ taskId, onOpenCount }: { taskId: string; onOpenCount?: (n: number) => void }) {
  const [forms, setForms] = useState<TaskForm[]>([]);
  const [options, setOptions] = useState<FormOption[]>([]);
  const [attaching, setAttaching] = useState<FormOption | null>(null);
  const [picking, setPicking] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(() => {
    apiFetch(`/api/pm/tasks/${taskId}/forms`)
      .then((r) => r.json())
      .then((d) => {
        const list: TaskForm[] = d.forms ?? [];
        setForms(list);
        onOpenCount?.(list.filter((f) => f.status !== "submitted").length);
      })
      .finally(() => setLoaded(true));
  }, [taskId, onOpenCount]);

  useEffect(load, [load]);

  const openPicker = () => {
    setPicking(true);
    if (!options.length) {
      apiFetch("/api/pm/forms").then((r) => r.json()).then((d) => setOptions(d.forms ?? []));
    }
  };

  if (!loaded && forms.length === 0) return null;

  return (
    <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 6 }}>
          <ClipboardList size={14} style={{ color: "var(--text-muted)" }} />
          Forms
          {forms.length > 0 && (
            <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>
              ({forms.filter((f) => f.status === "submitted").length}/{forms.length})
            </span>
          )}
        </div>
        <button onClick={openPicker} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent)", fontSize: 13 }}>+ Add</button>
      </div>

      {forms.length === 0 && (
        <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>No forms on this task.</div>
      )}

      {forms.map((f) => (
        <a
          key={f.id}
          href={withBase(`/forms/submissions/${f.id}`)}
          style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", textDecoration: "none", borderTop: "1px solid var(--border)" }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.title}</div>
            <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 1 }}>
              {f.status === "submitted"
                ? `Submitted${f.submittedByName ? ` by ${f.submittedByName}` : ""}`
                : `${f.progress.requiredAnswered}/${f.progress.requiredTotal} required answered`}
            </div>
          </div>
          {f.crmSyncError && <AlertTriangle size={13} style={{ color: "#b45309" }} />}
          <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: f.status === "submitted" ? "#22c55e20" : "var(--border)", color: f.status === "submitted" ? "#16a34a" : "var(--text-muted)" }}>
            {f.status === "submitted" ? "Done" : "Draft"}
          </span>
        </a>
      ))}

      {picking && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100, padding: 16 }} onClick={() => setPicking(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 12, width: "100%", maxWidth: 380, maxHeight: "70vh", overflowY: "auto", padding: 16 }}>
            <h3 style={{ fontSize: 15.5, fontWeight: 650, color: "var(--text-primary)", marginBottom: 10 }}>Add a form</h3>
            {options.filter((o) => o.status === "active").length === 0 && (
              <div style={{ fontSize: 13, color: "var(--text-muted)", padding: "8px 0" }}>No forms have been built yet.</div>
            )}
            {options.filter((o) => o.status === "active").map((o) => (
              <button
                key={o.id}
                onClick={() => { setPicking(false); setAttaching(o); }}
                style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 8px", background: "none", border: "none", borderRadius: 6, fontSize: 13.5, color: "var(--text-primary)", cursor: "pointer" }}
              >
                {o.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {attaching && (
        <StartFormDialog
          form={{ id: attaching.id, title: attaching.title }}
          taskId={taskId}
          onClose={() => setAttaching(null)}
          onStarted={(submissionId) => { window.location.href = withBase(`/forms/submissions/${submissionId}`); }}
        />
      )}
    </div>
  );
}
