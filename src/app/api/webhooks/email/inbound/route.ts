import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/db';
import { taskComments, tasks, users } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { verifyReplyAddress, stripQuotedReply } from '@/lib/email/notifications';
import { pusherServer, taskChannel } from '@/lib/pusher/server';
import { timingSafeEqual } from '@/lib/auth/service';

export async function POST(req: NextRequest) {
  let from: string, to: string, text: string;

  const contentType = req.headers.get('content-type') ?? '';
  console.log('[pm-inbound] received', { contentType });

  if (contentType.includes('application/json')) {
    // Internal proxy call from messaging app
    const secret = req.headers.get('x-internal-secret');
    const configured = process.env.EMAIL_REPLY_SECRET;
    if (!configured || !secret || !timingSafeEqual(secret, configured)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await req.json();
    from = body.from ?? '';
    to = body.to ?? '';
    text = body.text ?? '';
  } else {
    /*
     * Direct from Mailgun (form data). This branch had NO auth check at all —
     * this route is on the proxy's public list (mail providers can't send a
     * session cookie), so anyone could POST form-data here shaped like an
     * inbound email and have it processed as one. The reply-address HMAC
     * still gated which task/project got a comment, but with EMAIL_REPLY_SECRET
     * unset (see notifications.ts) that token was forgeable too — the two
     * bugs stacked into "anyone can post as anyone, on any task."
     *
     * Mailgun signs every inbound webhook with timestamp+token+signature;
     * verifying it here is what actually proves the request came from
     * Mailgun and not an arbitrary POST. See
     * https://documentation.mailgun.com/en/latest/user_manual.html#webhooks
     */
    const form = await req.formData();
    const timestamp = form.get('timestamp') as string | null;
    const token = form.get('token') as string | null;
    const signature = form.get('signature') as string | null;
    const signingKey = process.env.MAILGUN_WEBHOOK_KEY;
    if (!signingKey || !timestamp || !token || !signature) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const expected = crypto.createHmac('sha256', signingKey).update(`${timestamp}${token}`).digest('hex');
    if (!timingSafeEqual(expected, signature)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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

    // The task first — its organization is what scopes everything below.
    const [task] = await db.select({ id: tasks.id, orgId: tasks.orgId })
      .from(tasks).where(eq(tasks.id, taskId)).limit(1);
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

    /*
     * Find the sender IN THE TASK'S ORGANIZATION. Do NOT create one.
     *
     * This looked the sender up by email alone (could return a person's
     * account in a different workspace and attribute the reply to it) and, if
     * nobody matched, INSERTED a brand-new `status: 'active'` user from
     * whatever `from` address was on the envelope — a header anyone sending
     * mail controls. That combined with the missing secret check above into a
     * free way to mint an active account, with a real seat, in any org whose
     * reply-token secret you could compute. A reply from an address with no
     * matching account in this org is dropped instead.
     */
    const [user] = await db.select().from(users)
      .where(and(eq(users.email, fromEmail), eq(users.orgId, task.orgId)))
      .limit(1);
    if (!user) {
      console.warn('[pm-inbound] no matching user for reply, dropping', { taskId, fromEmail });
      return NextResponse.json({ ok: true });
    }

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
    pusherServer.trigger(taskChannel(taskId), 'task.comment', { commentId: comment?.id }).catch(() => {});

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
