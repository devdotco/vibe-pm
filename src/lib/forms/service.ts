import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  formSubmissions, formTemplates, formTemplateVersions, projects, sections, taskAssignees, tasks, users,
  type FormSubmissionRow, type FormTemplateRow, type User,
} from "@/lib/db/schema";
import { logActivity } from "@/lib/activity";
import { autoWatch } from "@/lib/watchers";
import { positionBetween } from "@/lib/ordering";
import { withBase } from "@/lib/base-path";
import { appOrigin } from "@/lib/attachments";
import { readDefinition, type FormDefinition } from "./definition";
import { crmConfigured, CrmError, postFormEvent } from "@/lib/crm/client";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbOrTx = typeof db | Tx;

export async function getTemplate(orgId: string, templateId: string): Promise<FormTemplateRow | null> {
  const [t] = await db.select().from(formTemplates)
    .where(and(eq(formTemplates.id, templateId), eq(formTemplates.orgId, orgId))).limit(1);
  return t ?? null;
}

export async function getSubmission(orgId: string, submissionId: string): Promise<FormSubmissionRow | null> {
  const [s] = await db.select().from(formSubmissions)
    .where(and(eq(formSubmissions.id, submissionId), eq(formSubmissions.orgId, orgId), isNull(formSubmissions.deletedAt))).limit(1);
  return s ?? null;
}

/** The definition a submission was started against — never the template's current one. */
export async function definitionForSubmission(sub: Pick<FormSubmissionRow, "templateId" | "templateVersion" | "orgId">): Promise<FormDefinition> {
  const [v] = await db.select({ definition: formTemplateVersions.definition }).from(formTemplateVersions)
    .where(and(
      eq(formTemplateVersions.templateId, sub.templateId),
      eq(formTemplateVersions.version, sub.templateVersion),
      eq(formTemplateVersions.orgId, sub.orgId),
    )).limit(1);
  return readDefinition(v?.definition);
}

/**
 * Check every project/section/user id a template names belongs to the org.
 * Returns an error message, or null when everything checks out.
 */
export async function checkTemplateRefs(orgId: string, refs: {
  defaultProjectId?: string | null; defaultSectionId?: string | null; defaultAssigneeId?: string | null; autoAttachProjectIds?: string[];
}): Promise<string | null> {
  const projectIds = [...new Set([refs.defaultProjectId, ...(refs.autoAttachProjectIds ?? [])].filter((x): x is string => !!x))];
  if (projectIds.length) {
    const found = await db.select({ id: projects.id }).from(projects)
      .where(and(inArray(projects.id, projectIds), eq(projects.orgId, orgId)));
    if (found.length !== projectIds.length) return "A selected project was not found";
  }
  if (refs.defaultSectionId) {
    if (!refs.defaultProjectId) return "A default section needs a default project";
    const [s] = await db.select({ id: sections.id }).from(sections)
      .where(and(eq(sections.id, refs.defaultSectionId), eq(sections.projectId, refs.defaultProjectId), eq(sections.orgId, orgId))).limit(1);
    if (!s) return "The default section is not in the default project";
  }
  if (refs.defaultAssigneeId) {
    const [u] = await db.select({ id: users.id }).from(users)
      .where(and(eq(users.id, refs.defaultAssigneeId), eq(users.orgId, orgId))).limit(1);
    if (!u) return "The default assignee was not found";
  }
  return null;
}

/** Insert a new draft submission pinned to the template's current version. */
export async function createDraftSubmission(tx: DbOrTx, input: {
  template: FormTemplateRow; userId: string; taskId: string | null; projectId: string | null;
  crm?: { companyId?: string | null; companyName?: string | null; personId?: string | null; personName?: string | null; personEmail?: string | null };
}): Promise<FormSubmissionRow> {
  const [row] = await tx.insert(formSubmissions).values({
    orgId: input.template.orgId,
    templateId: input.template.id,
    templateVersion: input.template.version,
    title: input.template.title,
    taskId: input.taskId,
    projectId: input.projectId,
    crmCompanyId: input.crm?.companyId ?? null,
    crmCompanyName: input.crm?.companyName ?? null,
    crmPersonId: input.crm?.personId ?? null,
    crmPersonName: input.crm?.personName ?? null,
    crmPersonEmail: input.crm?.personEmail ?? null,
    createdBy: input.userId,
  }).returning();
  return row;
}

/**
 * Attach every form set to auto-attach in a task's project.
 *
 * Call it from EVERY place a task is born (the task API, CSV import,
 * subtasks, the public/service API, message webhooks, recurrence): a form
 * that attaches only when a task is created from one screen is a checklist
 * people learn not to trust. Best-effort — a failure here must never fail the
 * task creation — and idempotent per (task, template).
 */
export async function autoAttachForms(task: { id: string; projectId: string; orgId: string; createdBy: string; parentTaskId?: string | null }): Promise<number> {
  // Subtasks inherit nothing: attaching the visit checklist to every
  // "bring extra hose" subtask would bury the real one.
  if (task.parentTaskId) return 0;
  try {
    const templates = await db.select().from(formTemplates).where(and(
      eq(formTemplates.orgId, task.orgId),
      eq(formTemplates.status, "active"),
      sql`${task.projectId}::uuid = ANY(${formTemplates.autoAttachProjectIds})`,
    ));
    if (!templates.length) return 0;
    const existing = await db.select({ templateId: formSubmissions.templateId }).from(formSubmissions)
      .where(and(eq(formSubmissions.taskId, task.id), isNull(formSubmissions.deletedAt)));
    const have = new Set(existing.map((e) => e.templateId));
    let n = 0;
    for (const template of templates) {
      if (have.has(template.id)) continue;
      await createDraftSubmission(db, { template, userId: task.createdBy, taskId: task.id, projectId: task.projectId });
      n++;
    }
    return n;
  } catch (err) {
    console.warn("[forms] auto-attach failed for task", task.id, (err as Error).message);
    return 0;
  }
}

/** Create the task a form starts, the way POST /api/pm/tasks does, plus the task_assignees row the UI actually reads. */
export async function createTaskForForm(tx: Tx, input: {
  user: User; projectId: string; sectionId: string | null; assigneeId: string | null; title: string;
  description: string | null; dueDate: string | null;
}): Promise<typeof tasks.$inferSelect> {
  const [first] = await tx.select({ position: tasks.position }).from(tasks)
    .where(and(
      eq(tasks.projectId, input.projectId),
      input.sectionId ? eq(tasks.sectionId, input.sectionId) : isNull(tasks.sectionId),
      isNull(tasks.deletedAt),
    ))
    .orderBy(asc(tasks.position)).limit(1);
  const [task] = await tx.insert(tasks).values({
    projectId: input.projectId,
    sectionId: input.sectionId,
    orgId: input.user.orgId,
    title: input.title,
    description: input.description,
    assigneeId: input.assigneeId,
    dueDate: input.dueDate,
    position: positionBetween(null, first?.position ?? null),
    createdBy: input.user.id,
  }).returning();
  await logActivity({ taskId: task.id, projectId: input.projectId, orgId: input.user.orgId, userId: input.user.id, action: "created" }, tx);
  await autoWatch(task.id, input.user.orgId, input.user.id, tx);
  if (input.assigneeId) {
    // My Tasks and the project views read task_assignees, not tasks.assignee_id.
    await tx.insert(taskAssignees).values({ taskId: task.id, orgId: input.user.orgId, userId: input.assigneeId, assignedBy: input.user.id }).onConflictDoNothing();
    if (input.assigneeId !== input.user.id) await autoWatch(task.id, input.user.orgId, input.assigneeId, tx);
  }
  return task;
}

export function submissionUrl(submissionId: string): string {
  return `${appOrigin()}${withBase(`/forms/submissions/${submissionId}`)}`;
}

/**
 * Tell the CRM a form was submitted (or emailed), recording the outcome on the
 * submission. Never throws: the CRM is a projection of the form, not a
 * prerequisite for it. A failed sync keeps `crm_sync_error` and is retried by
 * the next sync attempt (re-submit, email, or the Retry button).
 */
export async function syncSubmissionToCrm(
  sub: FormSubmissionRow,
  actor: { email: string; name: string },
  event: "submitted" | "emailed" = "submitted",
  emailedTo?: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!sub.crmCompanyId && !sub.crmPersonId) return { ok: true };
  if (!crmConfigured()) {
    await db.update(formSubmissions).set({ crmSyncError: "CRM link is not configured on this server" }).where(eq(formSubmissions.id, sub.id));
    return { ok: false, error: "not_configured" };
  }
  let taskTitle: string | null = null;
  if (sub.taskId) {
    const [t] = await db.select({ title: tasks.title }).from(tasks).where(eq(tasks.id, sub.taskId)).limit(1);
    taskTitle = t?.title ?? null;
  }
  try {
    await postFormEvent(sub.orgId, {
      event,
      submissionId: sub.id,
      templateId: sub.templateId,
      templateTitle: sub.title,
      companyId: sub.crmCompanyId,
      personId: sub.crmPersonId,
      taskTitle,
      url: submissionUrl(sub.id),
      actorEmail: actor.email,
      actorName: actor.name,
      occurredAt: (event === "emailed" ? new Date() : sub.submittedAt ?? new Date()).toISOString(),
      ...(emailedTo ? { emailedTo } : {}),
    });
    if (event === "submitted") {
      await db.update(formSubmissions).set({ crmSyncedAt: new Date(), crmSyncError: null }).where(eq(formSubmissions.id, sub.id));
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof CrmError && err.code === "no_linked_crm_workspace"
      ? "This organization has no CRM workspace yet"
      : (err as Error).message;
    console.warn("[forms] CRM sync failed", sub.id, message);
    await db.update(formSubmissions).set({ crmSyncError: message.slice(0, 500) }).where(eq(formSubmissions.id, sub.id));
    return { ok: false, error: message };
  }
}
