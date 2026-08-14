import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { taskComments, tasks, taskAssignees, users, projects, pmNotifications } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { logActivity } from '@/lib/activity';
import { eq, and, isNull, asc, inArray } from 'drizzle-orm';
import { sendTaskCommentEmail, sendTaskMentionEmail } from '@/lib/email/notifications';
import { validate, CommentSchema } from '@/lib/validate';
import { rateLimit } from '@/lib/rate-limit';
import { autoWatch } from '@/lib/watchers';
import { pusherServer, taskChannel } from '@/lib/pusher/server';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const user = await requireUser();
  const { taskId } = await params;
  const comments = await db.select().from(taskComments)
    .where(and(eq(taskComments.taskId, taskId), eq(taskComments.orgId, user.orgId), isNull(taskComments.deletedAt)))
    .orderBy(asc(taskComments.createdAt));
  return NextResponse.json({ comments });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const user = await requireUser();
  if (!rateLimit(`comments:${user.id}`, 30, 60_000)) {
    return NextResponse.json({ error: 'Too many requests. Slow down.' }, { status: 429 });
  }
  const { taskId } = await params;
  const [task] = await db.select().from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.orgId, user.orgId)));
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = await req.json();
  const v = validate(CommentSchema, body);
  if (!v.success) return v.response;
  const { content } = v.data;
  const [comment] = await db.transaction(async (tx) => {
    const [c] = await tx.insert(taskComments).values({ taskId, orgId: user.orgId, userId: user.id, content, source: 'app' }).returning();
    await logActivity({ taskId, projectId: task.projectId, orgId: user.orgId, userId: user.id, action: 'commented', newValue: c.id }, tx);
    // auto-watch: commenter becomes a watcher
    await autoWatch(taskId, user.orgId, user.id, tx);
    return [c];
  });

  pusherServer.trigger(taskChannel(taskId), 'task.comment', { commentId: comment.id }).catch((err) => console.error('[Pusher] POST comment trigger failed:', err));

  // fire-and-forget email notifications
  (async () => {
    // gather recipient user IDs: task.assigneeId + all taskAssignees + task.createdBy
    const recipientIds = new Set<string>();
    if (task.assigneeId) recipientIds.add(task.assigneeId);
    if (task.createdBy) recipientIds.add(task.createdBy);
    const multiAssignees = await db.select({ userId: taskAssignees.userId })
      .from(taskAssignees).where(eq(taskAssignees.taskId, taskId));
    for (const a of multiAssignees) recipientIds.add(a.userId);
    // exclude the commenter
    recipientIds.delete(user.id);
    if (recipientIds.size === 0) return;

    const recipientUsers = await db.select({ id: users.id, email: users.email, name: users.name })
      .from(users).where(inArray(users.id, [...recipientIds]));

    const [proj] = await db.select({ name: projects.name }).from(projects)
      .where(eq(projects.id, task.projectId)).limit(1);
    if (!proj) return;

    // detect @mentions: match @word patterns against recipient names
    const mentionPattern = /@([\w.-]+)/g;
    const mentionedNames = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = mentionPattern.exec(content)) !== null) {
      mentionedNames.add(m[1]!.toLowerCase());
    }

    for (const recipient of recipientUsers) {
      if (!recipient.email) continue;
      const nameLower = recipient.name.toLowerCase().replace(/\s+/g, '');
      const firstNameLower = recipient.name.split(' ')[0]!.toLowerCase();
      const isMentioned = mentionedNames.size > 0 && (
        mentionedNames.has(nameLower) ||
        mentionedNames.has(firstNameLower) ||
        [...mentionedNames].some(mn => nameLower.includes(mn))
      );
      const data = {
        taskId,
        taskTitle: task.title,
        projectName: proj.name,
        recipientEmail: recipient.email,
        recipientName: recipient.name,
        actorName: user.name,
        commentText: content,
      };
      if (isMentioned) {
        await sendTaskMentionEmail(data).catch(() => {});
        await db.insert(pmNotifications).values({
          userId: recipient.id,
          orgId: user.orgId,
          type: 'comment.mention',
          taskId,
          projectId: task.projectId,
          triggeredByUserId: user.id,
        }).catch(() => {});
      } else {
        await sendTaskCommentEmail(data).catch(() => {});
      }
    }
  })().catch(() => {});

  return NextResponse.json({ comment }, { status: 201 });
}
