import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import type { FormSubmissionRow, User } from "@/lib/db/schema";
import { isOrgAdmin } from "@/lib/auth/roles";
import { FormDefinitionSchema } from "./definition";

/** The signed-in user, or a JSON 401 — never a thrown error surfacing as a 500. */
export async function apiUser(): Promise<{ user: User; res?: never } | { user?: never; res: NextResponse }> {
  const user = await getCurrentUser();
  if (!user) return { res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  return { user };
}

export const notFound = (what = "Not found") => NextResponse.json({ error: what }, { status: 404 });
export const badRequest = (error: string) => NextResponse.json({ error }, { status: 400 });

const uuid = z.string().uuid();

export const TemplateSaveSchema = z.object({
  title: z.string().trim().min(1, "Form title is required").max(300),
  description: z.string().max(5000).nullable().optional(),
  definition: FormDefinitionSchema,
  defaultProjectId: uuid.nullable().optional(),
  defaultSectionId: uuid.nullable().optional(),
  defaultAssigneeId: uuid.nullable().optional(),
  autoAttachProjectIds: z.array(uuid).max(200).optional(),
});

export const TemplateCreateSchema = TemplateSaveSchema.partial({ definition: true });

export const StartFormSchema = z.object({
  // Attach to an existing task…
  taskId: uuid.optional(),
  // …or create one.
  projectId: uuid.optional(),
  sectionId: uuid.nullable().optional(),
  assigneeId: uuid.nullable().optional(),
  taskTitle: z.string().trim().max(500).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  crmCompanyId: z.string().min(1).max(64).nullable().optional(),
  crmPersonId: z.string().min(1).max(64).nullable().optional(),
});

export const SubmissionPatchSchema = z.object({
  answers: z.record(z.string().max(64), z.unknown()).optional(),
  crmCompanyId: z.string().min(1).max(64).nullable().optional(),
  crmPersonId: z.string().min(1).max(64).nullable().optional(),
});

export const EmailSchema = z.object({
  to: z.string().trim().toLowerCase().email().max(320).optional(),
  message: z.string().max(5000).optional(),
});

export function zodError(err: z.ZodError): NextResponse {
  const first = err.issues[0];
  return NextResponse.json({ error: first?.message ?? "Invalid request", details: err.flatten() }, { status: 400 });
}

/**
 * Anyone in the organization may fill in a draft — a form is handed between the
 * tech on site and the office. Once submitted it is a record sent to a customer
 * or a county, so only an admin may change it.
 */
export function canEditSubmission(user: User, sub: FormSubmissionRow): boolean {
  return sub.status === "draft" || isOrgAdmin(user);
}
