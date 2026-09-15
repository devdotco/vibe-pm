import { z } from "zod";

/**
 * The shape of a form, shared by the builder, the fill screen, the PDF and the
 * CSV export. Stored as jsonb on `form_templates.definition` and snapshotted
 * into `form_template_versions` on every save.
 *
 * Ids (sections, questions, options) are generated once and never reused.
 * Answers point at them, so renaming a label or reordering options can never
 * silently change what an old submission says.
 *
 * The eight question types are Jobber's, one for one, so a Jobber checklist
 * can be rebuilt here without translation.
 */
export const QUESTION_TYPES = [
  "short_text",
  "long_text",
  "dropdown",
  "checkboxes",
  "number",
  "images",
  "date",
  "signature",
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  short_text: "Short answer",
  long_text: "Long answer",
  dropdown: "Dropdown (single choice)",
  checkboxes: "Checkbox",
  number: "Numerical answer",
  images: "Upload images",
  date: "Date picker",
  signature: "Signature",
};

export const TYPES_WITH_OPTIONS: ReadonlySet<QuestionType> = new Set(["dropdown", "checkboxes"]);

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/, "invalid id");

export const FormOptionSchema = z.object({
  id,
  label: z.string().trim().min(1, "Option text is required").max(1000),
});

export const FormQuestionSchema = z
  .object({
    id,
    type: z.enum(QUESTION_TYPES),
    label: z.string().trim().min(1, "Question text is required").max(2000),
    help: z.string().max(2000).optional(),
    required: z.boolean(),
    options: z.array(FormOptionSchema).max(200).optional(),
  })
  .superRefine((q, ctx) => {
    if (TYPES_WITH_OPTIONS.has(q.type)) {
      if (!q.options || q.options.length === 0) {
        ctx.addIssue({ code: "custom", message: `"${q.label}" needs at least one option`, path: ["options"] });
      } else if (new Set(q.options.map((o) => o.id)).size !== q.options.length) {
        ctx.addIssue({ code: "custom", message: "Duplicate option ids", path: ["options"] });
      }
    }
  });

export const FormSectionSchema = z.object({
  id,
  title: z.string().trim().min(1, "Section title is required").max(500),
  questions: z.array(FormQuestionSchema).max(200),
});

export const FormDefinitionSchema = z
  .object({ sections: z.array(FormSectionSchema).max(100) })
  .superRefine((def, ctx) => {
    const seen = new Set<string>();
    for (const s of def.sections) {
      for (const q of s.questions) {
        if (seen.has(q.id)) ctx.addIssue({ code: "custom", message: `Duplicate question id ${q.id}` });
        seen.add(q.id);
      }
    }
  });

export type FormOption = z.infer<typeof FormOptionSchema>;
export type FormQuestion = z.infer<typeof FormQuestionSchema>;
export type FormSection = z.infer<typeof FormSectionSchema>;
export type FormDefinition = z.infer<typeof FormDefinitionSchema>;

export const EMPTY_DEFINITION: FormDefinition = { sections: [] };

/** Tolerant read of a stored definition: a malformed row renders as empty rather than crashing a page. */
export function readDefinition(raw: unknown): FormDefinition {
  const parsed = FormDefinitionSchema.safeParse(raw);
  return parsed.success ? parsed.data : EMPTY_DEFINITION;
}

export function allQuestions(def: FormDefinition): FormQuestion[] {
  return def.sections.flatMap((s) => s.questions);
}

/** Short random id for new sections/questions/options, safe for use as a jsonb key. */
export function newId(prefix: string): string {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  return `${prefix}_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}
