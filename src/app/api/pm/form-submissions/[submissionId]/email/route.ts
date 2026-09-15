import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import sgMail from "@sendgrid/mail";
import { db } from "@/lib/db";
import { formSubmissions } from "@/lib/db/schema";
import { logActivity } from "@/lib/activity";
import { rateLimit } from "@/lib/rate-limit";
import { apiUser, EmailSchema, notFound, zodError } from "@/lib/forms/api";
import { getSubmission, syncSubmissionToCrm } from "@/lib/forms/service";
import { buildSubmissionPdf } from "@/lib/forms/report";

function parseFrom(s: string): { email: string; name?: string } {
  const m = s.match(/^(.+?)\s*<([^>]+)>$/);
  return m ? { name: m[1].trim(), email: m[2].trim() } : { email: s.trim() };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

/**
 * Email the report to the customer, with the PDF attached.
 *
 * SendGrid's answer is CHECKED. The magic-link sender in this app ignores it
 * and reports success on a rejected send, which is how "the email never
 * arrived" became a day of debugging — a 202 here means accepted, anything
 * else is reported to the person who pressed the button.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ submissionId: string }> }) {
  const { user, res } = await apiUser();
  if (res) return res;
  const { submissionId } = await params;
  if (!rateLimit(`form-email:${user.id}`, 20, 60_000)) {
    return NextResponse.json({ error: "Too many emails. Slow down." }, { status: 429 });
  }
  const parsed = EmailSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return zodError(parsed.error);

  const sub = await getSubmission(user.orgId, submissionId);
  if (!sub) return notFound();
  if (sub.status !== "submitted") return NextResponse.json({ error: "Submit the form before sending it" }, { status: 400 });

  const to = parsed.data.to ?? sub.crmPersonEmail;
  if (!to) return NextResponse.json({ error: "No email address — choose a contact or type an address" }, { status: 400 });

  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Email is not configured on this server" }, { status: 503 });

  let pdf;
  try {
    pdf = await buildSubmissionPdf(sub);
  } catch (err) {
    console.error("[forms] pdf for email failed", sub.id, (err as Error).message);
    return NextResponse.json({ error: "The report could not be built" }, { status: 500 });
  }

  const from = parseFrom(process.env.EMAIL_FROM ?? "erp.io PM <notifications@dev.co>");
  const note = parsed.data.message?.trim();
  const greeting = sub.crmPersonName ? `Hi ${escapeHtml(sub.crmPersonName.split(" ")[0]!)},` : "Hello,";
  const html =
    `<p>${greeting}</p>` +
    `<p>Your report <strong>${escapeHtml(sub.title)}</strong>${sub.crmCompanyName ? ` for ${escapeHtml(sub.crmCompanyName)}` : ""} is attached.</p>` +
    (note ? `<p>${escapeHtml(note).replace(/\n/g, "<br>")}</p>` : "") +
    `<p style="color:#6b7280;font-size:13px">Sent by ${escapeHtml(user.name)}.</p>`;

  sgMail.setApiKey(apiKey);
  try {
    const [response] = await sgMail.send({
      from,
      to,
      replyTo: user.email,
      subject: `${sub.title}${sub.crmCompanyName ? ` — ${sub.crmCompanyName}` : ""}`,
      html,
      attachments: [{
        content: Buffer.from(pdf.bytes).toString("base64"),
        filename: pdf.filename,
        type: "application/pdf",
        disposition: "attachment",
      }],
      mailSettings: { bypassListManagement: { enable: true } },
    });
    if (response.statusCode >= 300) {
      return NextResponse.json({ error: `SendGrid refused the message (${response.statusCode})` }, { status: 502 });
    }
  } catch (err) {
    const detail = (err as { response?: { body?: { errors?: Array<{ message?: string }> } } }).response?.body?.errors?.[0]?.message;
    console.error("[forms] email send failed", sub.id, detail ?? (err as Error).message);
    return NextResponse.json({ error: detail ?? "The email was refused" }, { status: 502 });
  }

  const [updated] = await db.update(formSubmissions)
    .set({ lastEmailedAt: new Date(), lastEmailedTo: to, updatedAt: new Date() })
    .where(and(eq(formSubmissions.id, sub.id), eq(formSubmissions.orgId, user.orgId)))
    .returning();

  if (sub.taskId && sub.projectId) {
    await logActivity({
      taskId: sub.taskId, projectId: sub.projectId, orgId: user.orgId, userId: user.id,
      action: "form_emailed", newValue: to, metadata: { submissionId: sub.id },
    }).catch(() => {});
  }
  const crm = await syncSubmissionToCrm(updated, { email: user.email, name: user.name }, "emailed", to);

  return NextResponse.json({ sent: true, to, submission: updated, crm });
}
