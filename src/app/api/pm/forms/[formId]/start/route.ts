import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects, sections, tasks, users } from "@/lib/db/schema";
import { logActivity } from "@/lib/activity";
import { dispatchEvent } from "@/lib/webhooks/dispatcher";
import { pusherServer, projectChannel, taskChannel } from "@/lib/pusher/server";
import { rateLimit } from "@/lib/rate-limit";
import { apiUser, badRequest, notFound, StartFormSchema, zodError } from "@/lib/forms/api";
import { createDraftSubmission, createTaskForForm, getTemplate } from "@/lib/forms/service";
import { resolveCrmRefs } from "@/lib/forms/crm-refs";

/**
 * Start a form: from the Forms menu this creates the task the form belongs to;
 * from a task it attaches to that task. Either way the result is a draft
 * submission pinned to the form's current version, opened for filling in.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ formId: string }> }) {
  const { user, res } = await apiUser();
  if (res) return res;
  if (!rateLimit(`forms-start:${user.id}`, 30, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Slow down." }, { status: 429 });
  }
  const { formId } = await params;
  const template = await getTemplate(user.orgId, formId);
  if (!template || template.status !== "active") return notFound("Form not found");

  const parsed = StartFormSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return zodError(parsed.error);
  const input = parsed.data;

  const crm = await resolveCrmRefs(user.orgId, input.crmCompanyId ?? null, input.crmPersonId ?? null);
  if (!crm.ok) return crm.response;

  // ── Existing task ────────────────────────────────────────────────────────────
  if (input.taskId) {
    const [task] = await db.select().from(tasks)
      .where(and(eq(tasks.id, input.taskId), eq(tasks.orgId, user.orgId), isNull(tasks.deletedAt))).limit(1);
    if (!task) return notFound("Task not found");
    const submission = await db.transaction(async (tx) => {
      const s = await createDraftSubmission(tx, { template, userId: user.id, taskId: task.id, projectId: task.projectId, crm: crm.refs });
      await logActivity({ taskId: task.id, projectId: task.projectId, orgId: user.orgId, userId: user.id, action: "form_attached", newValue: template.title, metadata: { submissionId: s.id } }, tx);
      return s;
    });
    pusherServer.trigger(taskChannel(task.id), "task.updated", {}).catch(() => {});
    return NextResponse.json({ submission, task }, { status: 201 });
  }

  // ── New task ────────────────────────────────────────────────────────────────
  const projectId = input.projectId ?? template.defaultProjectId;
  if (!projectId) return badRequest("Choose a project for this form's task");
  const [project] = await db.select({ id: projects.id, name: projects.name }).from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.orgId, user.orgId))).limit(1);
  if (!project) return notFound("Project not found");

  // An explicit null means "no section"; undefined means "use the form's default if it is in this project".
  let sectionId: string | null = input.sectionId === undefined
    ? (projectId === template.defaultProjectId ? template.defaultSectionId : null)
    : input.sectionId;
  if (sectionId) {
    const [s] = await db.select({ id: sections.id }).from(sections)
      .where(and(eq(sections.id, sectionId), eq(sections.projectId, projectId), eq(sections.orgId, user.orgId))).limit(1);
    if (!s) {
      if (input.sectionId) return badRequest("Section not found in that project");
      sectionId = null;
    }
  }

  const assigneeId = input.assigneeId === undefined ? template.defaultAssigneeId ?? user.id : input.assigneeId;
  if (assigneeId) {
    const [u] = await db.select({ id: users.id }).from(users)
      .where(and(eq(users.id, assigneeId), eq(users.orgId, user.orgId), eq(users.status, "active"))).limit(1);
    if (!u) return badRequest("Assignee not found");
  }

  const customer = crm.refs.companyName ?? crm.refs.personName;
  const title = input.taskTitle || (customer ? `${template.title} — ${customer}` : template.title);

  const { task, submission } = await db.transaction(async (tx) => {
    const task = await createTaskForForm(tx, {
      user, projectId, sectionId, assigneeId, title: title.slice(0, 500), description: null, dueDate: input.dueDate ?? null,
    });
    const submission = await createDraftSubmission(tx, { template, userId: user.id, taskId: task.id, projectId, crm: crm.refs });
    await logActivity({ taskId: task.id, projectId, orgId: user.orgId, userId: user.id, action: "form_attached", newValue: template.title, metadata: { submissionId: submission.id } }, tx);
    return { task, submission };
  });

  // The same side effects POST /api/pm/tasks has, so a form's task is an ordinary task everywhere.
  // Auto-attach is deliberately not run: this task was created FOR a form.
  dispatchEvent({ eventType: "task.created", orgId: user.orgId, projectId, taskId: task.id, triggeredBy: user.id, data: { title: task.title } });
  pusherServer.trigger(projectChannel(projectId, user.orgId), "task.created", { task }).catch(() => {});

  return NextResponse.json({ submission, task }, { status: 201 });
}
