import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { taskComments, tasks, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import { verifyReplyAddress, stripQuotedReply } from '@/lib/email/notifications';

/**
 * Verify a Mailgun inbound webhook signature.
 * Mailgun signs requests with: HMAC-SHA256(MAILGUN_WEBHOOK_KEY, timestamp + token)
 * The hex digest must equal the `signature` field.
 */
function verifyMailgunSignature(
  webhookKey: string,
  timestamp: string,
  token: string,
  signature: string
): boolean {
  const digest = crypto
    .createHmac('sha256', webhookKey)
    .update(timestamp + token)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

export async function POST(req: NextRequest) {
  const MAILGUN_WEBHOOK_KEY = process.env.MAILGUN_WEBHOOK_KEY;

  // Parse Mailgun's form-encoded payload
  const form = await req.formData();

  const timestamp = (form.get('timestamp') as string | null) ?? '';
  const token = (form.get('token') as string | null) ?? '';
  const signature = (form.get('signature') as string | null) ?? '';

  // Verify Mailgun signature (skip only in dev when key is not set)
  if (MAILGUN_WEBHOOK_KEY) {
    if (!timestamp || !token || !signature) {
      return NextResponse.json({ error: 'Missing Mailgun signature fields' }, { status: 401 });
    }
    if (!verifyMailgunSignature(MAILGUN_WEBHOOK_KEY, timestamp, token, signature)) {
      return NextResponse.json({ error: 'Invalid Mailgun signature' }, { status: 401 });
    }
  }

  // Extract fields from Mailgun's form payload
  const from = (form.get('from') as string | null) ?? (form.get('sender') as string | null) ?? '';
  const to = ((form.get('recipient') as string | null) ?? '').split(',')[0].trim();
  const text = (form.get('body-plain') as string | null) ?? '';

  // Extract sender email from "Name <email>" or bare email
  const fromEmailMatch = from.match(/<([^>]+)>/) ?? from.match(/(\S+@\S+)/);
  const fromEmail = fromEmailMatch ? fromEmailMatch[1]! : from;
  if (!fromEmail) return NextResponse.json({ error: 'Cannot determine sender email' }, { status: 400 });

  // Verify HMAC on the reply address
  const parsed = verifyReplyAddress(to, fromEmail);
  if (!parsed) return NextResponse.json({ error: 'Invalid reply address' }, { status: 400 });

  const { type, entityId } = parsed;
  const replyText = stripQuotedReply(text);
  if (!replyText || replyText.length < 2) return NextResponse.json({ ok: true }); // ignore empty replies

  if (type === 'task') {
    const taskId = entityId;

    // Find or create a user record for this email sender
    let [user] = await db.select().from(users).where(eq(users.email, fromEmail)).limit(1);
    if (!user) {
      const name = from.replace(/<[^>]+>/, '').trim() || fromEmail.split('@')[0]!;
      const [created] = await db.insert(users).values({
        orgId: 'platform_default',
        email: fromEmail,
        name,
        status: 'active',
      }).returning();
      user = created!;
    }

    // Verify the task exists
    const [task] = await db.select({ id: tasks.id, orgId: tasks.orgId })
      .from(tasks).where(eq(tasks.id, taskId)).limit(1);
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

    // Insert comment sourced from email
    await db.insert(taskComments).values({
      taskId,
      orgId: task.orgId,
      userId: user.id,
      content: replyText,
      source: 'email',
    });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
