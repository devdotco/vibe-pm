"use client";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Check, Cloud, FileText, Mail, RefreshCw } from "lucide-react";
import { apiFetch, withBase } from "@/lib/base-path";
import type { FormDefinition } from "@/lib/forms/definition";
import type { AnswerValue } from "@/lib/forms/answers";
import { QuestionField, type UploadedFile } from "@/components/pm/forms/QuestionField";

interface SubmissionData {
  id: string;
  title: string;
  status: string;
  answers: Record<string, AnswerValue>;
  crmCompanyName: string | null;
  crmPersonName: string | null;
  crmPersonEmail: string | null;
  crmSyncError: string | null;
  submittedAt: string | null;
  submittedByName: string | null;
  lastEmailedAt: string | null;
  lastEmailedTo: string | null;
}

/**
 * Fill in a form. Built for a phone held in one hand on a customer's floor:
 * one column, big targets, answers saved as they are given so a dropped
 * connection or a locked screen never loses the visit.
 */
export default function SubmissionPage({ params }: { params: Promise<{ submissionId: string }> }) {
  const { submissionId } = use(params);
  const [data, setData] = useState<SubmissionData | null>(null);
  const [definition, setDefinition] = useState<FormDefinition>({ sections: [] });
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [task, setTask] = useState<{ id: string; title: string; projectId: string } | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [missing, setMissing] = useState<string[]>([]);
  const [banner, setBanner] = useState<{ kind: "error" | "ok"; text: string } | null>(null);
  const [emailing, setEmailing] = useState(false);
  const [loading, setLoading] = useState(true);

  const pending = useRef<Record<string, AnswerValue>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(() => {
    apiFetch(`/api/pm/form-submissions/${submissionId}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.submission) { setBanner({ kind: "error", text: d.error ?? "This form was not found." }); return; }
        setData(d.submission);
        setDefinition(d.definition);
        setFiles(d.files ?? []);
        setTask(d.task);
        setCanEdit(!!d.canEdit);
        setAnswers(d.submission.answers ?? {});
      })
      .finally(() => setLoading(false));
  }, [submissionId]);
  useEffect(load, [load]);

  /** Flush queued answers. Only the questions that changed are sent, so two people never overwrite each other's work. */
  const flush = useCallback(async () => {
    const batch = pending.current;
    pending.current = {};
    if (!Object.keys(batch).length) return;
    setSaveState("saving");
    const res = await apiFetch(`/api/pm/form-submissions/${submissionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: batch }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      setSaveState("error");
      setBanner({ kind: "error", text: d?.error ?? "Your last answer did not save." });
      return;
    }
    setSaveState("saved");
  }, [submissionId]);

  const setAnswer = (questionId: string, value: AnswerValue) => {
    setAnswers((a) => ({ ...a, [questionId]: value }));
    pending.current[questionId] = value;
    setSaveState("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 700);
  };

  // Save on the way out — closing the tab mid-visit must not lose the last answer.
  useEffect(() => {
    const onHide = () => { if (Object.keys(pending.current).length) void flush(); };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [flush]);

  const submit = async () => {
    if (timer.current) clearTimeout(timer.current);
    await flush();
    setBanner(null);
    const res = await apiFetch(`/api/pm/form-submissions/${submissionId}/submit`, { method: "POST" });
    const d = await res.json();
    if (!res.ok) {
      setMissing((d.missing ?? []).map((m: { id: string }) => m.id));
      setBanner({ kind: "error", text: d.error ?? "This form could not be submitted." });
      const first = document.getElementById(`q-${(d.missing ?? [])[0]?.id}`);
      first?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setMissing([]);
    setBanner(d.crm?.ok === false
      ? { kind: "error", text: "Submitted. It is not on the CRM timeline yet — retry below." }
      : { kind: "ok", text: "Submitted." });
    load();
  };

  const email = async () => {
    setEmailing(true);
    const res = await apiFetch(`/api/pm/form-submissions/${submissionId}/email`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
    });
    const d = await res.json();
    setEmailing(false);
    setBanner(res.ok ? { kind: "ok", text: `Report emailed to ${d.to}.` } : { kind: "error", text: d.error ?? "The email was not sent." });
    if (res.ok) load();
  };

  const retrySync = async () => {
    const res = await apiFetch(`/api/pm/form-submissions/${submissionId}/sync`, { method: "POST" });
    const d = await res.json();
    setBanner(res.ok ? { kind: "ok", text: "Added to the CRM timeline." } : { kind: "error", text: d.error ?? "The CRM could not be reached." });
    load();
  };

  if (loading) return <div style={{ padding: 40, color: "var(--text-muted)" }}>Loading…</div>;
  if (!data) return <div style={{ padding: 40, color: "var(--text-muted)" }}>{banner?.text ?? "Not found."}</div>;

  const submitted = data.status === "submitted";
  const readOnly = !canEdit;

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "20px 16px 140px" }}>
      <a href={withBase(task ? `/projects/${task.projectId}?task=${task.id}` : "/forms")} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-muted)", textDecoration: "none" }}>
        <ArrowLeft size={14} /> {task ? "Back to task" : "Forms"}
      </a>

      <h1 style={{ fontSize: 21, fontWeight: 700, color: "var(--text-primary)", marginTop: 12, lineHeight: 1.3 }}>{data.title}</h1>
      <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
        {[data.crmCompanyName, data.crmPersonName].filter(Boolean).join(" · ") || "No customer linked"}
      </div>
      {submitted && (
        <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 3 }}>
          Submitted {data.submittedAt ? new Date(data.submittedAt).toLocaleString() : ""}{data.submittedByName ? ` by ${data.submittedByName}` : ""}
          {data.lastEmailedAt && ` · emailed to ${data.lastEmailedTo}`}
        </div>
      )}

      {banner && (
        <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: 8, fontSize: 13.5, background: banner.kind === "ok" ? "#dcfce7" : "#fef2f2", color: banner.kind === "ok" ? "#166534" : "#b91c1c" }}>
          {banner.text}
        </div>
      )}

      {submitted && data.crmSyncError && (
        <button onClick={retrySync} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, padding: "10px 12px", width: "100%", border: "1px solid #fcd34d", background: "#fffbeb", color: "#92400e", borderRadius: 8, fontSize: 13, cursor: "pointer", textAlign: "left" }}>
          <AlertTriangle size={15} />
          <span style={{ flex: 1 }}>Not on the CRM timeline: {data.crmSyncError}</span>
          <RefreshCw size={14} />
        </button>
      )}

      <div style={{ marginTop: 22 }}>
        {definition.sections.map((section) => (
          <section key={section.id} style={{ marginBottom: 26, border: "1px solid var(--border)", borderRadius: 12, background: "var(--bg-elevated)", padding: "18px 18px 4px" }}>
            <h2 style={{ fontSize: 15.5, fontWeight: 700, color: "var(--text-primary)", marginBottom: 16, lineHeight: 1.35 }}>{section.title}</h2>
            {section.questions.map((q) => (
              <div key={q.id} id={`q-${q.id}`} style={{ scrollMarginTop: 80, borderLeft: missing.includes(q.id) ? "3px solid #ef4444" : "3px solid transparent", paddingLeft: 10, marginLeft: -13 }}>
                <QuestionField
                  question={q}
                  value={answers[q.id]}
                  files={files}
                  disabled={readOnly}
                  submissionId={submissionId}
                  onChange={(v) => setAnswer(q.id, v)}
                  onUploaded={(f) => setFiles((prev) => [...prev, f])}
                />
              </div>
            ))}
          </section>
        ))}
      </div>

      {/* Action bar: fixed on a phone, where the page is long and thumbs are at the bottom. */}
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, background: "var(--bg-elevated)", borderTop: "1px solid var(--border)", padding: "10px 16px", display: "flex", alignItems: "center", gap: 10, zIndex: 30 }}>
        <div style={{ flex: 1, fontSize: 12.5, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 6 }}>
          {!submitted && saveState === "saving" && <><Cloud size={14} /> Saving…</>}
          {!submitted && saveState === "saved" && <><Check size={14} /> Saved</>}
          {!submitted && saveState === "error" && <span style={{ color: "#b91c1c" }}>Not saved</span>}
          {submitted && <>Submitted</>}
        </div>

        {submitted && (
          <>
            <a href={withBase(`/api/pm/form-submissions/${submissionId}/pdf`)} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 14px", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-primary)", fontSize: 13.5, textDecoration: "none" }}>
              <FileText size={15} /> PDF
            </a>
            <button onClick={email} disabled={emailing} style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 14px", border: "1px solid var(--border)", borderRadius: 8, background: "transparent", color: "var(--text-primary)", fontSize: 13.5, cursor: emailing ? "wait" : "pointer" }}>
              <Mail size={15} /> {emailing ? "Sending…" : data.crmPersonEmail ? "Email report" : "Email"}
            </button>
          </>
        )}

        {!submitted && canEdit && (
          <button onClick={submit} style={{ padding: "11px 22px", background: "var(--accent)", color: "white", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
            Submit
          </button>
        )}
      </div>
    </div>
  );
}
