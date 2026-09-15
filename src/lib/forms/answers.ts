import { allQuestions, type FormDefinition, type FormQuestion } from "./definition";

/**
 * Answers are a map of question id → value. The value's shape depends on the
 * question type:
 *
 *   short_text, long_text   string
 *   dropdown                option id
 *   checkboxes              option id[]
 *   number                  number
 *   date                    "YYYY-MM-DD"
 *   images                  form_files id[]
 *   signature               form_files id
 *
 * Everything that enters `form_submissions.answers` goes through
 * `sanitizeAnswer`, so a stored answer always has the right shape for its
 * question — the PDF, CSV and fill screen never have to guess.
 */
export type AnswerValue = string | number | string[] | null;
export type Answers = Record<string, AnswerValue>;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TEXT = 20_000;

/**
 * Coerce one incoming value to the stored shape for its question, or null to
 * clear it. Returns `undefined` when the value is invalid for the type, so the
 * caller can reject rather than silently drop it.
 */
export function sanitizeAnswer(q: FormQuestion, value: unknown): AnswerValue | undefined {
  if (value === null || value === undefined || value === "") return null;
  switch (q.type) {
    case "short_text":
    case "long_text":
      return typeof value === "string" ? value.slice(0, MAX_TEXT) : undefined;
    case "dropdown":
      return typeof value === "string" && (q.options ?? []).some((o) => o.id === value) ? value : undefined;
    case "checkboxes": {
      if (!Array.isArray(value)) return undefined;
      const valid = new Set((q.options ?? []).map((o) => o.id));
      const picked = [...new Set(value.filter((v): v is string => typeof v === "string"))];
      if (picked.some((v) => !valid.has(v))) return undefined;
      // Keep the template's order, not click order, so exports line up.
      return (q.options ?? []).map((o) => o.id).filter((oid) => picked.includes(oid));
    }
    case "number": {
      const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
      return Number.isFinite(n) ? n : undefined;
    }
    case "date":
      return typeof value === "string" && DATE.test(value) && !Number.isNaN(Date.parse(value)) ? value : undefined;
    case "images":
      return Array.isArray(value) && value.every((v) => typeof v === "string") ? [...new Set(value as string[])] : undefined;
    case "signature":
      return typeof value === "string" ? value : undefined;
  }
}

export function isAnswered(q: FormQuestion, value: AnswerValue | undefined): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

/** Required questions with no answer, in form order. Empty = ready to submit. */
export function missingRequired(def: FormDefinition, answers: Answers): FormQuestion[] {
  return allQuestions(def).filter((q) => q.required && !isAnswered(q, answers[q.id]));
}

export function progress(def: FormDefinition, answers: Answers): { answered: number; total: number; requiredAnswered: number; requiredTotal: number } {
  const qs = allQuestions(def);
  const required = qs.filter((q) => q.required);
  return {
    answered: qs.filter((q) => isAnswered(q, answers[q.id])).length,
    total: qs.length,
    requiredAnswered: required.filter((q) => isAnswered(q, answers[q.id])).length,
    requiredTotal: required.length,
  };
}

/** File ids an answer set references — used to refuse attaching another submission's files. */
export function referencedFileIds(def: FormDefinition, answers: Answers): string[] {
  const out: string[] = [];
  for (const q of allQuestions(def)) {
    const v = answers[q.id];
    if (q.type === "images" && Array.isArray(v)) out.push(...v);
    if (q.type === "signature" && typeof v === "string") out.push(v);
  }
  return out;
}

/** Human-readable text for one answer (PDF, CSV, email). Files render as a count; callers that can show images do so themselves. */
export function answerText(q: FormQuestion, value: AnswerValue | undefined): string {
  if (!isAnswered(q, value)) return "";
  const label = (oid: string) => q.options?.find((o) => o.id === oid)?.label ?? "(removed option)";
  switch (q.type) {
    case "dropdown":
      return label(String(value));
    case "checkboxes":
      return (value as string[]).map(label).join("; ");
    case "images":
      return `${(value as string[]).length} photo${(value as string[]).length === 1 ? "" : "s"}`;
    case "signature":
      return "Signed";
    case "date": {
      const [y, m, d] = String(value).split("-").map(Number);
      return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { timeZone: "UTC", year: "numeric", month: "short", day: "numeric" });
    }
    default:
      return String(value);
  }
}
