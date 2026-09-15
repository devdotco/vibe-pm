import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { formSubmissions } from "@/lib/db/schema";
import { logActivity } from "@/lib/activity";
import { pusherServer, taskChannel } from "@/lib/pusher/server";
import { apiUser, notFound } from "@/lib/forms/api";
import { definitionForSubmission, getSubmission, syncSubmissionToCrm } from "@/lib/forms/service";
import { missingRequired, type Answers } from "@/lib/forms/answers";

/**
 * Submit a form. Every required question must be answered — checked here, not
 * only in the browser. Submitting is what puts it on the CRM timeline; a CRM
 * failure is recorded on the submission and never un-submits it.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ submissionId: string }> }) {
  const { user, res } = await apiUser();
  if (res) return res;
  const { submissionId } = await params;
  const sub = await getSubmission(user.orgId, submissionId);
  if (!sub) return notFound();
  if (sub.status === "submitted") return NextResponse.json({ error: "This form has already been submitted" }, { status: 409 });

  const definition = await definitionForSubmission(sub);
  const missing = missingRequired(definition, (sub.answers ?? {}) as Answers);
  if (missing.length) {
    return NextResponse.json({
      error: `${missing.length} required question${missing.length === 1 ? " is" : "s are"} not answered`,
      missing: missing.map((q) => ({ id: q.id, label: q.label })),
    }, { status: 422 });
  }

  // Conditional on still being a draft, so a double-tap cannot submit twice.
  const [submitted] = await db.update(formSubmissions)
    .set({ status: "submitted", submittedBy: user.id, submittedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(formSubmissions.id, sub.id), eq(formSubmissions.orgId, user.orgId), eq(formSubmissions.status, "draft")))
    .returning();
  if (!submitted) return NextResponse.json({ error: "This form has already been submitted" }, { status: 409 });

  if (submitted.taskId && submitted.projectId) {
    await logActivity({
      taskId: submitted.taskId, projectId: submitted.projectId, orgId: user.orgId, userId: user.id,
      action: "form_submitted", newValue: submitted.title, metadata: { submissionId: submitted.id },
    }).catch(() => {});
    pusherServer.trigger(taskChannel(submitted.taskId), "task.updated", {}).catch(() => {});
  }

  const crm = await syncSubmissionToCrm(submitted, { email: user.email, name: user.name });
  // Re-read: the sync writes crm_synced_at / crm_sync_error, and `submitted` was
  // captured before it ran — returning that row makes a successful sync look
  // like a failed one in the UI.
  const fresh = (await getSubmission(user.orgId, sub.id)) ?? submitted;
  return NextResponse.json({ submission: fresh, crm });
}
