import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { formSubmissions, formTemplateVersions, tasks, users } from "@/lib/db/schema";
import { apiUser, notFound } from "@/lib/forms/api";
import { readDefinition, type FormDefinition } from "@/lib/forms/definition";
import { progress, type Answers } from "@/lib/forms/answers";
import { isOrgAdmin } from "@/lib/auth/roles";

/**
 * The forms on one task: what the task drawer shows, and what "this job still
 * has an unfinished checklist" is read from.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const { user, res } = await apiUser();
  if (res) return res;
  const { taskId } = await params;
  const [task] = await db.select({ id: tasks.id }).from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.orgId, user.orgId), isNull(tasks.deletedAt))).limit(1);
  if (!task) return notFound("Task not found");

  const rows = await db.select().from(formSubmissions)
    .where(and(eq(formSubmissions.taskId, taskId), eq(formSubmissions.orgId, user.orgId), isNull(formSubmissions.deletedAt)))
    .orderBy(desc(formSubmissions.createdAt));
  if (!rows.length) return NextResponse.json({ forms: [], canManage: isOrgAdmin(user) });

  // Each submission is measured against ITS OWN version.
  const versions = await db.select({ templateId: formTemplateVersions.templateId, version: formTemplateVersions.version, definition: formTemplateVersions.definition })
    .from(formTemplateVersions)
    .where(and(
      inArray(formTemplateVersions.templateId, [...new Set(rows.map((r) => r.templateId))]),
      eq(formTemplateVersions.orgId, user.orgId),
    ));
  const defOf = new Map<string, FormDefinition>(versions.map((v) => [`${v.templateId}:${v.version}`, readDefinition(v.definition)]));

  const peopleIds = [...new Set(rows.flatMap((r) => [r.submittedBy, r.createdBy]).filter((x): x is string => !!x))];
  const people = peopleIds.length
    ? await db.select({ id: users.id, name: users.name }).from(users).where(and(inArray(users.id, peopleIds), eq(users.orgId, user.orgId)))
    : [];

  return NextResponse.json({
    canManage: isOrgAdmin(user),
    forms: rows.map((r) => ({
      id: r.id,
      templateId: r.templateId,
      title: r.title,
      status: r.status,
      submittedAt: r.submittedAt,
      submittedByName: people.find((p) => p.id === (r.submittedBy ?? r.createdBy))?.name ?? null,
      companyName: r.crmCompanyName,
      personName: r.crmPersonName,
      crmSyncError: r.crmSyncError,
      progress: progress(defOf.get(`${r.templateId}:${r.templateVersion}`) ?? { sections: [] }, (r.answers ?? {}) as Answers),
    })),
  });
}
