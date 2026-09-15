import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { formTemplateVersions, projects, tasks, users } from "@/lib/db/schema";
import { forbidden, isOrgAdmin } from "@/lib/auth/roles";
import { apiUser, notFound } from "@/lib/forms/api";
import { getTemplate, submissionUrl } from "@/lib/forms/service";
import { listSubmissions } from "@/lib/forms/report";
import { readDefinition, type FormDefinition } from "@/lib/forms/definition";
import { buildColumns, toCsv, type CsvSubmission } from "@/lib/forms/csv";
import { appOrigin } from "@/lib/attachments";
import { withBase } from "@/lib/base-path";
import type { Answers } from "@/lib/forms/answers";

/**
 * Every submission of one form as a spreadsheet — the report the office asks
 * for. Admin-only: one file holds every customer this form was ever filled in
 * for.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ formId: string }> }) {
  const { user, res } = await apiUser();
  if (res) return res;
  if (!isOrgAdmin(user)) return forbidden("Only organization admins can export submissions");
  const { formId } = await params;
  const template = await getTemplate(user.orgId, formId);
  if (!template) return notFound("Form not found");

  const rows = await listSubmissions(user.orgId, formId, 5000);
  const includeDrafts = req.nextUrl.searchParams.get("drafts") === "1";
  const wanted = includeDrafts ? rows : rows.filter((r) => r.status === "submitted");

  // Every version any of these submissions was answered against, so old
  // answers resolve against the options they were given.
  const versionRows = await db.select({ version: formTemplateVersions.version, definition: formTemplateVersions.definition })
    .from(formTemplateVersions)
    .where(and(eq(formTemplateVersions.templateId, formId), eq(formTemplateVersions.orgId, user.orgId)));
  const byVersion = new Map<number, FormDefinition>(versionRows.map((v) => [v.version, readDefinition(v.definition)]));
  const current = byVersion.get(template.version) ?? readDefinition(template.definition);
  const older = [...byVersion.entries()].sort((a, b) => b[0] - a[0]).filter(([v]) => v !== template.version).map(([, d]) => d);

  const peopleIds = [...new Set(wanted.flatMap((r) => [r.submittedBy, r.createdBy]).filter((x): x is string => !!x))];
  const people = peopleIds.length
    ? await db.select({ id: users.id, name: users.name }).from(users).where(and(inArray(users.id, peopleIds), eq(users.orgId, user.orgId)))
    : [];
  const taskIds = [...new Set(wanted.map((r) => r.taskId).filter((x): x is string => !!x))];
  const taskRows = taskIds.length
    ? await db.select({ id: tasks.id, title: tasks.title }).from(tasks).where(and(inArray(tasks.id, taskIds), eq(tasks.orgId, user.orgId)))
    : [];
  const projectIds = [...new Set(wanted.map((r) => r.projectId).filter((x): x is string => !!x))];
  const projectRows = projectIds.length
    ? await db.select({ id: projects.id, name: projects.name }).from(projects).where(and(inArray(projects.id, projectIds), eq(projects.orgId, user.orgId)))
    : [];

  const columns = buildColumns(current, older);
  const origin = appOrigin();
  const csvRows: CsvSubmission[] = wanted.map((r) => ({
    submittedAt: r.submittedAt,
    status: r.status,
    submittedByName: people.find((p) => p.id === (r.submittedBy ?? r.createdBy))?.name ?? null,
    taskTitle: taskRows.find((t) => t.id === r.taskId)?.title ?? null,
    projectName: projectRows.find((p) => p.id === r.projectId)?.name ?? null,
    companyName: r.crmCompanyName,
    personName: r.crmPersonName,
    version: r.templateVersion,
    answers: (r.answers ?? {}) as Answers,
    fileUrl: (fileId) => `${origin}${withBase(`/api/pm/form-submissions/${r.id}/files/${fileId}`)}`,
    submissionUrl: submissionUrl(r.id),
  }));

  const csv = toCsv(columns, csvRows, (v) => byVersion.get(v));
  const filename = `${template.title.replace(/[^a-zA-Z0-9 _.-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100) || "form"}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
