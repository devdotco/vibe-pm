import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { formSubmissions, formTemplates, formTemplateVersions, projects } from "@/lib/db/schema";
import { isOrgAdmin, forbidden } from "@/lib/auth/roles";
import { apiUser, TemplateCreateSchema, zodError } from "@/lib/forms/api";
import { checkTemplateRefs } from "@/lib/forms/service";
import { EMPTY_DEFINITION, allQuestions, readDefinition } from "@/lib/forms/definition";

/** Every form in the organization. Anyone can see and start them; only admins build them. */
export async function GET(req: NextRequest) {
  const { user, res } = await apiUser();
  if (res) return res;
  const status = req.nextUrl.searchParams.get("status") === "archived" ? "archived" : "active";

  const rows = await db.select().from(formTemplates)
    .where(and(eq(formTemplates.orgId, user.orgId), eq(formTemplates.status, status)))
    .orderBy(formTemplates.title);

  const ids = rows.map((r) => r.id);
  const counts = ids.length
    ? await db.select({
        templateId: formSubmissions.templateId,
        submitted: sql<number>`count(*) filter (where ${formSubmissions.status} = 'submitted')`.mapWith(Number),
        drafts: sql<number>`count(*) filter (where ${formSubmissions.status} = 'draft')`.mapWith(Number),
      }).from(formSubmissions)
        .where(and(inArray(formSubmissions.templateId, ids), eq(formSubmissions.orgId, user.orgId), isNull(formSubmissions.deletedAt)))
        .groupBy(formSubmissions.templateId)
    : [];
  const countBy = new Map(counts.map((c) => [c.templateId, c]));

  const projectIds = [...new Set(rows.flatMap((r) => [...r.autoAttachProjectIds, ...(r.defaultProjectId ? [r.defaultProjectId] : [])]))];
  const projectRows = projectIds.length
    ? await db.select({ id: projects.id, name: projects.name, color: projects.color }).from(projects)
        .where(and(inArray(projects.id, projectIds), eq(projects.orgId, user.orgId)))
    : [];
  const projectBy = new Map(projectRows.map((p) => [p.id, p]));

  return NextResponse.json({
    canManage: isOrgAdmin(user),
    forms: rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      status: r.status,
      version: r.version,
      questionCount: allQuestions(readDefinition(r.definition)).length,
      defaultProject: r.defaultProjectId ? projectBy.get(r.defaultProjectId) ?? null : null,
      autoAttachProjects: r.autoAttachProjectIds.map((id) => projectBy.get(id)).filter(Boolean),
      submittedCount: countBy.get(r.id)?.submitted ?? 0,
      draftCount: countBy.get(r.id)?.drafts ?? 0,
      updatedAt: r.updatedAt,
    })),
  });
}

export async function POST(req: NextRequest) {
  const { user, res } = await apiUser();
  if (res) return res;
  if (!isOrgAdmin(user)) return forbidden("Only organization admins can create forms");

  const parsed = TemplateCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return zodError(parsed.error);
  const input = parsed.data;
  const refError = await checkTemplateRefs(user.orgId, input);
  if (refError) return NextResponse.json({ error: refError }, { status: 400 });

  const definition = input.definition ?? EMPTY_DEFINITION;
  const template = await db.transaction(async (tx) => {
    const [t] = await tx.insert(formTemplates).values({
      orgId: user.orgId,
      title: input.title,
      description: input.description ?? null,
      definition,
      defaultProjectId: input.defaultProjectId ?? null,
      defaultSectionId: input.defaultSectionId ?? null,
      defaultAssigneeId: input.defaultAssigneeId ?? null,
      autoAttachProjectIds: input.autoAttachProjectIds ?? [],
      createdBy: user.id,
      updatedBy: user.id,
    }).returning();
    await tx.insert(formTemplateVersions).values({
      templateId: t.id, orgId: user.orgId, version: 1, title: t.title, definition, createdBy: user.id,
    });
    return t;
  });
  return NextResponse.json({ form: template }, { status: 201 });
}
