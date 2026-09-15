import { allQuestions, type FormDefinition, type FormQuestion } from "./definition";
import { answerText, type Answers } from "./answers";

/**
 * One row per submission, one column per question — Jobber's "Checklists
 * Report", minus its two failure modes: columns are keyed by question ID, so
 * two questions sharing a label do not break the export, and a submission made
 * against an older version still lands in the right column.
 *
 * Column order follows the CURRENT form; questions that exist only in older
 * versions are appended after, under their last known label.
 */
export interface CsvSubmission {
  submittedAt: Date | null;
  status: string;
  submittedByName: string | null;
  taskTitle: string | null;
  projectName: string | null;
  companyName: string | null;
  personName: string | null;
  version: number;
  answers: Answers;
  /** Absolute URL per file id, for photo/signature columns. */
  fileUrl: (fileId: string) => string;
  submissionUrl: string;
}

export function buildColumns(current: FormDefinition, older: FormDefinition[]): FormQuestion[] {
  const cols = new Map<string, FormQuestion>();
  for (const q of allQuestions(current)) cols.set(q.id, q);
  // Newest first, so a question removed later keeps its most recent label.
  for (const def of older) {
    for (const q of allQuestions(def)) if (!cols.has(q.id)) cols.set(q.id, q);
  }
  return [...cols.values()];
}

/** Resolve options against the version the answer was given in, falling back to the column's question. */
function questionFor(col: FormQuestion, versionDef: FormDefinition | undefined): FormQuestion {
  return versionDef ? allQuestions(versionDef).find((q) => q.id === col.id) ?? col : col;
}

export function toCsv(
  columns: FormQuestion[],
  rows: CsvSubmission[],
  definitionForVersion: (version: number) => FormDefinition | undefined,
): string {
  const header = ["Submitted at", "Status", "Submitted by", "Company", "Contact", "Task", "Project", "Form version", ...columns.map((c) => c.label), "Link"];
  const lines = [header.map(cell).join(",")];
  for (const r of rows) {
    const def = definitionForVersion(r.version);
    const values = columns.map((col) => {
      const q = questionFor(col, def);
      const v = r.answers[col.id];
      if ((q.type === "images" || q.type === "signature") && v) {
        const ids = Array.isArray(v) ? v : [String(v)];
        return ids.map(r.fileUrl).join(" ");
      }
      return answerText(q, v);
    });
    lines.push(
      [
        r.submittedAt ? r.submittedAt.toISOString() : "",
        r.status,
        r.submittedByName ?? "",
        r.companyName ?? "",
        r.personName ?? "",
        r.taskTitle ?? "",
        r.projectName ?? "",
        String(r.version),
        ...values,
        r.submissionUrl,
      ].map(cell).join(","),
    );
  }
  // BOM so Excel opens UTF-8 (the Spanish in North Bay's labels) correctly.
  return "﻿" + lines.join("\r\n") + "\r\n";
}

/**
 * RFC 4180 quoting, plus formula-injection defence: a cell a technician typed
 * that starts with = + - @ would otherwise execute when the office opens the
 * export in Excel.
 */
export function cell(value: string): string {
  let v = value ?? "";
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
