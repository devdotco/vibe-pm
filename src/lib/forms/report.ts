import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { formFiles, formSubmissions, tasks, users, type FormSubmissionRow } from "@/lib/db/schema";
import { storage } from "@/lib/storage";
import { definitionForSubmission } from "./service";
import { referencedFileIds, type Answers } from "./answers";
import { renderSubmissionPdf, type PdfFile } from "./pdf";

/**
 * Build the report PDF for a submission: load the version it was answered
 * against, fetch only the images the answers actually reference, and render.
 *
 * An unreadable or missing object is drawn as a placeholder rather than
 * failing the report — a customer waiting on a compliance record would rather
 * have it with one photo missing.
 */
export async function buildSubmissionPdf(sub: FormSubmissionRow, organizationName?: string | null): Promise<{ bytes: Uint8Array; filename: string }> {
  const definition = await definitionForSubmission(sub);
  const answers = (sub.answers ?? {}) as Answers;

  const wanted = referencedFileIds(definition, answers);
  const rows = wanted.length
    ? await db.select().from(formFiles)
        .where(and(inArray(formFiles.id, wanted), eq(formFiles.submissionId, sub.id), eq(formFiles.orgId, sub.orgId)))
    : [];
  const store = storage();
  const files = new Map<string, PdfFile>();
  await Promise.all(rows.map(async (r) => {
    try {
      const bytes = await store.get(r.storageKey);
      if (bytes) files.set(r.id, { id: r.id, bytes, contentType: r.contentType });
    } catch (err) {
      console.warn("[forms] pdf image unavailable", r.id, (err as Error).message);
    }
  }));

  const [submittedBy] = sub.submittedBy
    ? await db.select({ name: users.name }).from(users).where(eq(users.id, sub.submittedBy)).limit(1)
    : [];
  const [task] = sub.taskId
    ? await db.select({ title: tasks.title }).from(tasks).where(eq(tasks.id, sub.taskId)).limit(1)
    : [];

  const bytes = await renderSubmissionPdf({
    title: sub.title,
    organizationName: organizationName ?? null,
    companyName: sub.crmCompanyName,
    personName: sub.crmPersonName,
    submittedAt: sub.submittedAt,
    submittedByName: submittedBy?.name ?? null,
    taskTitle: task?.title ?? null,
    definition,
    answers,
    files,
    timeZone: process.env.REPORT_TIME_ZONE || "America/Los_Angeles",
  });

  const stamp = (sub.submittedAt ?? new Date()).toISOString().slice(0, 10);
  const name = `${sub.title} ${sub.crmCompanyName ?? ""} ${stamp}`
    .replace(/[^a-zA-Z0-9 _.-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  return { bytes, filename: `${name || "form"}.pdf` };
}

/** Submissions of one template, newest first, for the template page and the CSV export. */
export async function listSubmissions(orgId: string, templateId: string, limit = 1000) {
  return db.select({
    id: formSubmissions.id,
    status: formSubmissions.status,
    title: formSubmissions.title,
    templateVersion: formSubmissions.templateVersion,
    answers: formSubmissions.answers,
    submittedAt: formSubmissions.submittedAt,
    submittedBy: formSubmissions.submittedBy,
    createdBy: formSubmissions.createdBy,
    crmCompanyName: formSubmissions.crmCompanyName,
    crmPersonName: formSubmissions.crmPersonName,
    crmSyncError: formSubmissions.crmSyncError,
    taskId: formSubmissions.taskId,
    projectId: formSubmissions.projectId,
    createdAt: formSubmissions.createdAt,
  }).from(formSubmissions)
    .where(and(
      eq(formSubmissions.orgId, orgId),
      eq(formSubmissions.templateId, templateId),
      isNull(formSubmissions.deletedAt),
    ))
    .orderBy(desc(formSubmissions.createdAt))
    .limit(limit);
}
