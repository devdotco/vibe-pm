import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { formTemplates, formTemplateVersions } from "@/lib/db/schema";
import { isOrgAdmin, forbidden } from "@/lib/auth/roles";
import { apiUser, notFound, TemplateSaveSchema, zodError } from "@/lib/forms/api";
import { checkTemplateRefs, getTemplate } from "@/lib/forms/service";
import { readDefinition } from "@/lib/forms/definition";

type Ctx = { params: Promise<{ formId: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { user, res } = await apiUser();
  if (res) return res;
  const { formId } = await params;
  const template = await getTemplate(user.orgId, formId);
  if (!template) return notFound();
  return NextResponse.json({
    form: { ...template, definition: readDefinition(template.definition) },
    canManage: isOrgAdmin(user),
  });
}

/**
 * Save the whole form. A change to the title or the questions writes a new
 * immutable version; changing only defaults or auto-attach does not, since
 * those never affect what an existing submission means.
 */
export async function PUT(req: NextRequest, { params }: Ctx) {
  const { user, res } = await apiUser();
  if (res) return res;
  if (!isOrgAdmin(user)) return forbidden("Only organization admins can edit forms");
  const { formId } = await params;
  const existing = await getTemplate(user.orgId, formId);
  if (!existing) return notFound();

  const parsed = TemplateSaveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return zodError(parsed.error);
  const input = parsed.data;
  const refError = await checkTemplateRefs(user.orgId, input);
  if (refError) return NextResponse.json({ error: refError }, { status: 400 });

  const contentChanged =
    input.title !== existing.title ||
    JSON.stringify(input.definition) !== JSON.stringify(readDefinition(existing.definition));

  const saved = await db.transaction(async (tx) => {
    // Lock the row so two admins saving at once cannot mint the same version number.
    const [locked] = await tx.select({ version: formTemplates.version }).from(formTemplates)
      .where(and(eq(formTemplates.id, formId), eq(formTemplates.orgId, user.orgId))).for("update");
    const version = contentChanged ? locked.version + 1 : locked.version;
    const [t] = await tx.update(formTemplates).set({
      title: input.title,
      description: input.description ?? null,
      definition: input.definition,
      defaultProjectId: input.defaultProjectId ?? null,
      defaultSectionId: input.defaultSectionId ?? null,
      defaultAssigneeId: input.defaultAssigneeId ?? null,
      autoAttachProjectIds: input.autoAttachProjectIds ?? [],
      version,
      updatedBy: user.id,
      updatedAt: new Date(),
    }).where(and(eq(formTemplates.id, formId), eq(formTemplates.orgId, user.orgId))).returning();
    if (contentChanged) {
      await tx.insert(formTemplateVersions).values({
        templateId: formId, orgId: user.orgId, version, title: input.title, definition: input.definition, createdBy: user.id,
      });
    }
    return t;
  });
  return NextResponse.json({ form: { ...saved, definition: readDefinition(saved.definition) }, newVersion: contentChanged });
}

const StatusSchema = z.object({ status: z.enum(["active", "archived"]) });

/** Archive or restore. Forms are never hard-deleted: submissions point at them. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { user, res } = await apiUser();
  if (res) return res;
  if (!isOrgAdmin(user)) return forbidden("Only organization admins can archive forms");
  const { formId } = await params;
  const parsed = StatusSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return zodError(parsed.error);
  const [t] = await db.update(formTemplates).set({
    status: parsed.data.status,
    archivedAt: parsed.data.status === "archived" ? new Date() : null,
    updatedBy: user.id,
    updatedAt: new Date(),
  }).where(and(eq(formTemplates.id, formId), eq(formTemplates.orgId, user.orgId))).returning();
  if (!t) return notFound();
  return NextResponse.json({ form: t });
}
