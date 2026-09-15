import { NextRequest, NextResponse } from "next/server";
import { apiUser, notFound } from "@/lib/forms/api";
import { getSubmission, syncSubmissionToCrm } from "@/lib/forms/service";

/** Retry the CRM timeline entry after an outage. Idempotent: the CRM keys on the submission id. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ submissionId: string }> }) {
  const { user, res } = await apiUser();
  if (res) return res;
  const { submissionId } = await params;
  const sub = await getSubmission(user.orgId, submissionId);
  if (!sub) return notFound();
  if (sub.status !== "submitted") return NextResponse.json({ error: "Only a submitted form is sent to the CRM" }, { status: 400 });
  const crm = await syncSubmissionToCrm(sub, { email: user.email, name: user.name });
  return NextResponse.json(crm, { status: crm.ok ? 200 : 502 });
}
