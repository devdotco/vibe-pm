import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { taskComments, tasks, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { verifyReplyAddress, stripQuotedReply } from '@/lib/email/notifications';
import { pusherServer } from '@/lib/pusher/server';

export async function POST(req: NextRequest) {
  let from: string, to: string, text: string;

  const contentType = req.headers.get('content-type') ?? '';
  console.log('[pm-inbound] received', { contentType });

  if (contentType.includes('application/json')) {
    // Internal proxy call from messaging app
    const secret = req.headers.get('x-internal-secret');
    if (!secret || secret !== (process.env.EMAIL_REPLY_SECRET ?? '')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await req.json();
    from = body.from ?? '';
    to = body.to ?? '';
    text = body.text ?? '';
  } else {
    // Direct from SendGrid or Mailgun (form data)
    const form = await req.formData();
    from = (form.get('from') as string | null) ?? '';
    const rawEnvelope = (form.get('envelope') as string | null) ?? '{}';
    const envelope = JSON.parse(rawEnvelope);
    to = (
      envelope.to?.[0] ??
      (form.get('to') as string | null) ??
      (form.get('recipient') as string | null) ?? // Mailgun
      ''
    ).trim();
    text = (
      (form.get('text') as string | null) ||
      (form.get('stripped-text') as string | null) ||   // Mailgun
      (form.get('body-plain') as string | null) ||      // Mailgun legacy
      ''
    );
  }

  // Extract sender email from "Name <email>" or bare email
  const fromEmailMatch = from.match(/<([^>]+)>/) ?? from.match(/(\S+@\S+)/);
  const fromEmail = fromEmailMatch ? fromEmailMatch[1]! : from;
  if (!fromEmail) return NextResponse.json({ error: 'Cannot determine sender email' }, { status: 400 });

  // Verify HMAC on the reply address
  console.log('[pm-inbound] verifying', { to, fromEmail });
  const parsed = verifyReplyAddress(to, fromEmail);
  if (!parsed) {
    console.error('[pm-inbound] invalid reply address', { to, fromEmail });
    return NextResponse.json({ error: 'Invalid reply address' }, { status: 400 });
  }

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
    const [comment] = await db.insert(taskComments).values({
      taskId,
      orgId: task.orgId,
      userId: user.id,
      content: replyText,
      source: 'email',
    }).returning();

    console.log('[pm-inbound] inserted comment', comment?.id);

    // Broadcast on task-specific channel so open task panels refresh in real-time
    pusherServer.trigger(`task-${taskId}`, 'task.comment', { commentId: comment?.id }).catch(() => {});

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
