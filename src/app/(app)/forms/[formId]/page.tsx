"use client";
import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Download, Pencil, Plus } from "lucide-react";
import { apiFetch, withBase } from "@/lib/base-path";
import { StartFormDialog } from "@/components/pm/forms/StartFormDialog";

interface SubmissionRow {
  id: string;
  status: string;
  submittedAt: string | null;
  createdAt: string;
  submittedByName: string | null;
  companyName: string | null;
  personName: string | null;
  taskId: string | null;
  projectId: string | null;
  crmSyncError: string | null;
  progress: { answered: number; total: number; requiredAnswered: number; requiredTotal: number };
}

export default function FormDetailPage({ params }: { params: Promise<{ formId: string }> }) {
  const { formId } = use(params);
  const router = useRouter();
  const [form, setForm] = useState<{ id: string; title: string; status: string; version: number } | null>(null);
  const [rows, setRows] = useState<SubmissionRow[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  const load = useCallback(() => {
    apiFetch(`/api/pm/forms/${formId}/submissions`)
      .then((r) => r.json())
      .then((d) => {
        setForm(d.form ?? null);
        setRows(d.submissions ?? []);
        setCanManage(!!d.canManage);
      })
      .finally(() => setLoading(false));
  }, [formId]);
  useEffect(load, [load]);

  if (loading) return <div style={{ padding: 40, color: "var(--text-muted)" }}>Loading…</div>;
  if (!form) return <div style={{ padding: 40, color: "var(--text-muted)" }}>This form was not found.</div>;

  return (
    <div style={{ maxWidth: 940, margin: "0 auto", padding: "26px 24px 80px" }}>
      <a href={withBase("/forms")} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-muted)", textDecoration: "none", marginBottom: 14 }}>
        <ArrowLeft size={14} /> Forms
      </a>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)" }}>{form.title}</h1>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 3 }}>
            {rows.length} submission{rows.length === 1 ? "" : "s"} · version {form.version}
            {form.status === "archived" && " · archived"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {form.status === "active" && (
            <button onClick={() => setStarting(true)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", background: "var(--accent)", color: "white", border: "none", borderRadius: 6, fontSize: 14, fontWeight: 500, cursor: "pointer" }}>
              <Plus size={16} /> Start form
            </button>
          )}
          {canManage && (
            <>
              <a href={withBase(`/forms/${formId}/edit`)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text-primary)", fontSize: 14, textDecoration: "none" }}>
                <Pencil size={15} /> Edit
              </a>
              <a href={withBase(`/api/pm/forms/${formId}/export`)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text-primary)", fontSize: 14, textDecoration: "none" }}>
                <Download size={15} /> Export CSV
              </a>
            </>
          )}
        </div>
      </div>

      <div style={{ marginTop: 22, border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", background: "var(--bg-elevated)" }}>
        {rows.length === 0 && (
          <div style={{ padding: "44px 24px", textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>
            Nobody has filled this form in yet.
          </div>
        )}
        {rows.map((r, i) => (
          <button
            key={r.id}
            onClick={() => router.push(`/forms/submissions/${r.id}`)}
            style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", textAlign: "left", padding: "13px 16px", background: "none", border: "none", borderBottom: i < rows.length - 1 ? "1px solid var(--border)" : "none", cursor: "pointer" }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, color: "var(--text-primary)", fontWeight: 550, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.companyName ?? r.personName ?? "No customer"}
              </div>
              <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 2 }}>
                {r.submittedAt
                  ? `Submitted ${new Date(r.submittedAt).toLocaleDateString()} by ${r.submittedByName ?? "someone"}`
                  : `Started ${new Date(r.createdAt).toLocaleDateString()} · ${r.progress.requiredAnswered}/${r.progress.requiredTotal} required answered`}
              </div>
            </div>
            {r.crmSyncError && (
              <span title={`Not on the CRM timeline: ${r.crmSyncError}`} style={{ color: "#b45309", display: "flex" }}>
                <AlertTriangle size={15} />
              </span>
            )}
            <span style={{ fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 20, background: r.status === "submitted" ? "#22c55e20" : "var(--border)", color: r.status === "submitted" ? "#16a34a" : "var(--text-muted)" }}>
              {r.status === "submitted" ? "Submitted" : "Draft"}
            </span>
          </button>
        ))}
      </div>

      {starting && (
        <StartFormDialog
          form={{ id: form.id, title: form.title }}
          onClose={() => setStarting(false)}
          onStarted={(submissionId) => router.push(`/forms/submissions/${submissionId}`)}
        />
      )}
    </div>
  );
}
