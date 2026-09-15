"use client";
import { useRef, useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import { withBase } from "@/lib/base-path";
import type { FormQuestion } from "@/lib/forms/definition";
import type { AnswerValue } from "@/lib/forms/answers";
import { SignaturePad } from "./SignaturePad";

export interface UploadedFile { id: string; questionId: string; kind: string; filename: string; contentType: string }

/**
 * One question, as the person filling it in sees it. Shared by the fill screen
 * and the builder's Preview, so what an admin previews is literally the widget
 * a technician gets.
 *
 * Sized for a phone first: 44px+ targets, inputs at 16px so iOS does not zoom
 * the page when one is focused.
 */
export function QuestionField({
  question,
  value,
  files,
  disabled,
  submissionId,
  onChange,
  onUploaded,
  onRemoveFile,
}: {
  question: FormQuestion;
  value: AnswerValue | undefined;
  files: UploadedFile[];
  disabled?: boolean;
  submissionId?: string;
  onChange: (value: AnswerValue) => void;
  onUploaded?: (file: UploadedFile) => void;
  onRemoveFile?: (fileId: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [signing, setSigning] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const upload = async (blob: Blob, filename: string): Promise<UploadedFile | null> => {
    if (!submissionId) return null;
    const body = new FormData();
    body.append("file", blob, filename);
    const res = await fetch(withBase(`/api/pm/form-submissions/${submissionId}/files?questionId=${encodeURIComponent(question.id)}`), { method: "POST", body });
    const d = await res.json().catch(() => null);
    if (!res.ok || !d?.file) {
      setError(d?.error ?? "Upload failed");
      return null;
    }
    onUploaded?.(d.file);
    return d.file as UploadedFile;
  };

  const pickFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    setError("");
    const current = Array.isArray(value) ? [...(value as string[])] : [];
    for (const file of Array.from(list)) {
      const prepared = await shrinkImage(file).catch(() => file);
      const uploaded = await upload(prepared, renameToJpeg(file.name, prepared.type));
      if (uploaded) current.push(uploaded.id);
    }
    onChange(current);
    setBusy(false);
    if (fileInput.current) fileInput.current.value = "";
  };

  const label = (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.45 }}>
        {question.label}
        {question.required && <span style={{ color: "#ef4444", marginLeft: 4 }}>*</span>}
      </div>
      {question.help && <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 2 }}>{question.help}</div>}
    </div>
  );

  const answeredFiles = (Array.isArray(value) ? (value as string[]) : value ? [String(value)] : [])
    .map((id) => files.find((f) => f.id === id))
    .filter((f): f is UploadedFile => !!f);

  return (
    <div style={{ marginBottom: 22 }}>
      {label}

      {question.type === "short_text" && (
        <input
          value={(value as string) ?? ""}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          style={inputStyle}
        />
      )}

      {question.type === "long_text" && (
        <textarea
          value={(value as string) ?? ""}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          style={{ ...inputStyle, resize: "vertical", minHeight: 96 }}
        />
      )}

      {question.type === "number" && (
        <input
          type="number"
          inputMode="decimal"
          value={value === null || value === undefined ? "" : String(value)}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          style={inputStyle}
        />
      )}

      {question.type === "date" && (
        <input
          type="date"
          value={(value as string) ?? ""}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value || null)}
          style={inputStyle}
        />
      )}

      {question.type === "dropdown" && (
        <select
          value={(value as string) ?? ""}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value || null)}
          style={inputStyle}
        >
          <option value="">Choose an option</option>
          {(question.options ?? []).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      )}

      {question.type === "checkboxes" && (
        <div style={{ display: "grid", gap: 2 }}>
          {(question.options ?? []).map((o) => {
            const picked = Array.isArray(value) && (value as string[]).includes(o.id);
            return (
              <label key={o.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "9px 4px", cursor: disabled ? "default" : "pointer", minHeight: 24 }}>
                <input
                  type="checkbox"
                  checked={picked}
                  disabled={disabled}
                  onChange={(e) => {
                    const set = new Set(Array.isArray(value) ? (value as string[]) : []);
                    if (e.target.checked) set.add(o.id); else set.delete(o.id);
                    onChange([...set]);
                  }}
                  style={{ width: 18, height: 18, marginTop: 1, flexShrink: 0, accentColor: "var(--accent)" }}
                />
                <span style={{ fontSize: 14, color: "var(--text-primary)", lineHeight: 1.4 }}>{o.label}</span>
              </label>
            );
          })}
        </div>
      )}

      {question.type === "images" && (
        <div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: answeredFiles.length ? 10 : 0 }}>
            {answeredFiles.map((f) => (
              <div key={f.id} style={{ position: "relative" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={withBase(`/api/pm/form-submissions/${submissionId}/files/${f.id}`)}
                  alt={f.filename}
                  style={{ width: 104, height: 104, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)" }}
                />
                {!disabled && (
                  <button
                    onClick={() => {
                      onChange((Array.isArray(value) ? (value as string[]) : []).filter((id) => id !== f.id));
                      onRemoveFile?.(f.id);
                    }}
                    aria-label="Remove photo"
                    style={{ position: "absolute", top: -7, right: -7, width: 24, height: 24, borderRadius: "50%", border: "none", background: "rgba(17,24,39,0.85)", color: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
          {!disabled && (
            <>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                multiple
                capture="environment"
                onChange={(e) => pickFiles(e.target.files)}
                style={{ display: "none" }}
              />
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={busy || !submissionId}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", minHeight: 52, border: "1px dashed var(--border)", borderRadius: 8, background: "var(--bg)", color: "var(--accent)", fontSize: 14, fontWeight: 500, cursor: busy ? "wait" : "pointer" }}
              >
                <Camera size={17} /> {busy ? "Uploading…" : "Add photos"}
              </button>
            </>
          )}
        </div>
      )}

      {question.type === "signature" && (
        <div>
          {answeredFiles[0] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={withBase(`/api/pm/form-submissions/${submissionId}/files/${answeredFiles[0].id}`)}
              alt="Signature"
              style={{ maxWidth: 280, width: "100%", border: "1px solid var(--border)", borderRadius: 8, background: "white" }}
            />
          )}
          {!disabled && !signing && (
            <button
              type="button"
              onClick={() => setSigning(true)}
              disabled={!submissionId}
              style={{ display: "block", marginTop: answeredFiles[0] ? 8 : 0, minHeight: 48, width: "100%", border: "1px dashed var(--border)", borderRadius: 8, background: "var(--bg)", color: "var(--accent)", fontSize: 14, fontWeight: 500, cursor: "pointer" }}
            >
              {answeredFiles[0] ? "Sign again" : "Sign here"}
            </button>
          )}
          {signing && !disabled && (
            <div style={{ marginTop: 8 }}>
              <SignaturePad
                busy={busy}
                onCancel={() => setSigning(false)}
                onDone={async (png) => {
                  setBusy(true);
                  const uploaded = await upload(png, "signature.png");
                  setBusy(false);
                  if (uploaded) {
                    onChange(uploaded.id);
                    setSigning(false);
                  }
                }}
              />
            </div>
          )}
        </div>
      )}

      {error && <div style={{ color: "#ef4444", fontSize: 12.5, marginTop: 6 }}>{error}</div>}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "11px 12px",
  border: "1px solid var(--border)",
  borderRadius: 8,
  // 16px: anything smaller makes iOS Safari zoom the page when the field is focused.
  fontSize: 16,
  background: "var(--bg)",
  color: "var(--text-primary)",
  outline: "none",
};

function renameToJpeg(name: string, type: string): string {
  if (type !== "image/jpeg") return name;
  return name.replace(/\.[a-z0-9]+$/i, "") + ".jpg";
}

/**
 * Shrink a photo in the browser before it is uploaded.
 *
 * A modern phone camera produces 4–12MB per shot and a tech may add a dozen.
 * Drawing through a canvas also converts HEIC (which Safari can decode but
 * neither the PDF nor most browsers can display) into JPEG. If anything here
 * fails, the original file is uploaded instead.
 */
export async function shrinkImage(file: File, maxEdge = 2000, quality = 0.82): Promise<Blob> {
  if (!file.type.startsWith("image/")) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.type === "image/jpeg") { bitmap.close(); return file; }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) { bitmap.close(); return file; }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  return blob ?? file;
}
