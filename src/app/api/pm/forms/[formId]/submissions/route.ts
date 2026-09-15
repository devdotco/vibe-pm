import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { apiUser, notFound } from "@/lib/forms/api";
import { getTemplate } from "@/lib/forms/service";
import { listSubmissions } from "@/lib/forms/report";
import { readDefinition } from "@/lib/forms/definition";
import { progress, type Answers } from "@/lib/forms/answers";
import { isOrgAdmin } from "@/lib/auth/roles";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ formId: string }> }) {
  const { user, res } = await apiUser();
  if (res) return res;
  const { formId } = await params;
  const template = await getTemplate(user.orgId, formId);
  if (!template) return notFound("Form not found");

  const rows = await listSubmissions(user.orgId, formId);
  const peopleIds = [...new Set(rows.flatMap((r) => [r.submittedBy, r.createdBy]).filter((x): x is string => !!x))];
  const people = peopleIds.length
    ? await db.select({ id: users.id, name: users.name }).from(users)
        .where(and(inArray(users.id, peopleIds), eq(users.orgId, user.orgId)))
    : [];
  const nameOf = (id: string | null) => people.find((p) => p.id === id)?.name ?? null;
  const definition = readDefinition(template.definition);

  return NextResponse.json({
    form: { id: template.id, title: template.title, status: template.status, version: template.version },
    canManage: isOrgAdmin(user),
    submissions: rows.map((r) => ({
      id: r.id,
      status: r.status,
      submittedAt: r.submittedAt,
      createdAt: r.createdAt,
      submittedByName: nameOf(r.submittedBy) ?? nameOf(r.createdBy),
      companyName: r.crmCompanyName,
      personName: r.crmPersonName,
      taskId: r.taskId,
      projectId: r.projectId,
      crmSyncError: r.crmSyncError,
      // Drafts are measured against the CURRENT form, which is what the list is sorted and filtered by.
      progress: progress(definition, (r.answers ?? {}) as Answers),
    })),
  });
}
