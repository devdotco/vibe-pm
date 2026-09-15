import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { formTemplates, formTemplateVersions } from "@/lib/db/schema";
import { isOrgAdmin, forbidden } from "@/lib/auth/roles";
import { apiUser, notFound } from "@/lib/forms/api";
import { getTemplate } from "@/lib/forms/service";
import { readDefinition } from "@/lib/forms/definition";

/**
 * Copy a form. North Bay keeps one Grease Trap report per county, identical but
 * for the jurisdiction — duplicating is how those are made. Ids are kept: they
 * are unique within a form, and each copy is its own template.
 * Auto-attach is NOT copied, or two near-identical forms would land on every task.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ formId: string }> }) {
  const { user, res } = await apiUser();
  if (res) return res;
  if (!isOrgAdmin(user)) return forbidden("Only organization admins can duplicate forms");
  const { formId } = await params;
  const source = await getTemplate(user.orgId, formId);
  if (!source) return notFound();

  const definition = readDefinition(source.definition);
  const title = `${source.title} (copy)`.slice(0, 300);
  const copy = await db.transaction(async (tx) => {
    const [t] = await tx.insert(formTemplates).values({
      orgId: user.orgId,
      title,
      description: source.description,
      definition,
      defaultProjectId: source.defaultProjectId,
      defaultSectionId: source.defaultSectionId,
      defaultAssigneeId: source.defaultAssigneeId,
      autoAttachProjectIds: [],
      createdBy: user.id,
      updatedBy: user.id,
    }).returning();
    await tx.insert(formTemplateVersions).values({ templateId: t.id, orgId: user.orgId, version: 1, title, definition, createdBy: user.id });
    return t;
  });
  return NextResponse.json({ form: copy }, { status: 201 });
}
