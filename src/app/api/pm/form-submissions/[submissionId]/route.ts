import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { formFiles, formSubmissions, projects, tasks, users } from "@/lib/db/schema";
import { isOrgAdmin, forbidden } from "@/lib/auth/roles";
import { logActivity } from "@/lib/activity";
import { pusherServer, taskChannel } from "@/lib/pusher/server";
import { apiUser, canEditSubmission, notFound, SubmissionPatchSchema, zodError } from "@/lib/forms/api";
import { definitionForSubmission, getSubmission } from "@/lib/forms/service";
import { allQuestions } from "@/lib/forms/definition";
import { progress, referencedFileIds, sanitizeAnswer, type Answers } from "@/lib/forms/answers";
import { resolveCrmRefs } from "@/lib/forms/crm-refs";

type Ctx = { params: Promise<{ submissionId: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { user, res } = await apiUser();
  if (res) return res;
  const { submissionId } = await params;
  const sub = await getSubmission(user.orgId, submissionId);
  if (!sub) return notFound();

  const definition = await definitionForSubmission(sub);
  const answers = (sub.answers ?? {}) as Answers;
  const files = await db.select({
    id: formFiles.id, questionId: formFiles.questionId, kind: formFiles.kind, filename: formFiles.filename,
    contentType: formFiles.contentType, sizeBytes: formFiles.sizeBytes, createdAt: formFiles.createdAt,
  }).from(formFiles).where(and(eq(formFiles.submissionId, sub.id), eq(formFiles.orgId, user.orgId)));

  const [task] = sub.taskId
    ? await db.select({ id: tasks.id, title: tasks.title, projectId: tasks.projectId, status: tasks.status }).from(tasks)
        .where(and(eq(tasks.id, sub.taskId), eq(tasks.orgId, user.orgId))).limit(1)
    : [];
  const [project] = sub.projectId
    ? await db.select({ id: projects.id, name: projects.name, color: projects.color }).from(projects)
        .where(and(eq(projects.id, sub.projectId), eq(projects.orgId, user.orgId))).limit(1)
    : [];
  const peopleIds = [sub.createdBy, sub.submittedBy].filter((x): x is string => !!x);
  const people = peopleIds.length
    ? await db.select({ id: users.id, name: users.name }).from(users).where(and(inArray(users.id, peopleIds), eq(users.orgId, user.orgId)))
    : [];
  const nameOf = (id: string | null) => people.find((p) => p.id === id)?.name ?? null;

  return NextResponse.json({
    submission: { ...sub, answers, createdByName: nameOf(sub.createdBy), submittedByName: nameOf(sub.submittedBy) },
    definition,
    files,
    task: task ?? null,
    project: project ?? null,
    progress: progress(definition, answers),
    canEdit: canEditSubmission(user, sub),
    canManage: isOrgAdmin(user),
  });
}

/**
 * Autosave. Answers MERGE per question — the fill screen sends only what
 * changed, so two people on one form overwrite each other only on the same
 * question, never the whole form.
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { user, res } = await apiUser();
  if (res) return res;
  const { submissionId } = await params;
  const parsed = SubmissionPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return zodError(parsed.error);

  const sub = await getSubmission(user.orgId, submissionId);
  if (!sub) return notFound();
  if (!canEditSubmission(user, sub)) return forbidden("This form has been submitted; only an admin can change it");

  const definition = await definitionForSubmission(sub);
  const questions = new Map(allQuestions(definition).map((q) => [q.id, q]));
  const patch: Answers = {};
  for (const [qid, raw] of Object.entries(parsed.data.answers ?? {})) {
    const q = questions.get(qid);
    if (!q) return NextResponse.json({ error: `Unknown question ${qid}` }, { status: 400 });
    const value = sanitizeAnswer(q, raw);
    if (value === undefined) return NextResponse.json({ error: `Invalid answer for "${q.label}"` }, { status: 400 });
    patch[qid] = value;
  }

  // A photo or signature answer may only reference files uploaded to THIS submission.
  const fileIds = referencedFileIds(definition, patch);
  if (fileIds.length) {
    const owned = await db.select({ id: formFiles.id, questionId: formFiles.questionId }).from(formFiles)
      .where(and(inArray(formFiles.id, fileIds), eq(formFiles.submissionId, sub.id), eq(formFiles.orgId, user.orgId)));
    if (owned.length !== new Set(fileIds).size) return NextResponse.json({ error: "A photo does not belong to this form" }, { status: 400 });
  }

  const crmChanged = parsed.data.crmCompanyId !== undefined || parsed.data.crmPersonId !== undefined;
  let crmSet = {};
  if (crmChanged) {
    const crm = await resolveCrmRefs(
      user.orgId,
      parsed.data.crmCompanyId === undefined ? sub.crmCompanyId : parsed.data.crmCompanyId,
      parsed.data.crmPersonId === undefined ? sub.crmPersonId : parsed.data.crmPersonId,
    );
    if (!crm.ok) return crm.response;
    crmSet = {
      crmCompanyId: crm.refs.companyId, crmCompanyName: crm.refs.companyName,
      crmPersonId: crm.refs.personId, crmPersonName: crm.refs.personName, crmPersonEmail: crm.refs.personEmail,
    };
  }

  const [updated] = await db.transaction(async (tx) => {
    // Merge inside the database under a row lock, so concurrent autosaves of
    // different questions both land.
    const [locked] = await tx.select({ answers: formSubmissions.answers }).from(formSubmissions)
      .where(eq(formSubmissions.id, sub.id)).for("update");
    const merged = { ...((locked?.answers ?? {}) as Answers), ...patch };
    return tx.update(formSubmissions)
      .set({ answers: merged, ...crmSet, updatedAt: new Date() })
      .where(and(eq(formSubmissions.id, sub.id), eq(formSubmissions.orgId, user.orgId)))
      .returning();
  });

  return NextResponse.json({
    submission: { ...updated, answers: updated.answers as Answers },
    progress: progress(definition, updated.answers as Answers),
  });
}

/** Remove a form from its task. A draft can be removed by anyone who could fill it; a submitted one only by an admin. */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { user, res } = await apiUser();
  if (res) return res;
  const { submissionId } = await params;
  const sub = await getSubmission(user.orgId, submissionId);
  if (!sub) return notFound();
  if (!canEditSubmission(user, sub)) return forbidden("Only an admin can delete a submitted form");
  await db.update(formSubmissions).set({ deletedAt: new Date() })
    .where(and(eq(formSubmissions.id, sub.id), eq(formSubmissions.orgId, user.orgId)));
  if (sub.taskId && sub.projectId) {
    await logActivity({ taskId: sub.taskId, projectId: sub.projectId, orgId: user.orgId, userId: user.id, action: "form_removed", newValue: sub.title }).catch(() => {});
    pusherServer.trigger(taskChannel(sub.taskId), "task.updated", {}).catch(() => {});
  }
  return NextResponse.json({ success: true });
}
