import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { commentReactions, taskComments, tasks, pmNotifications } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { eq, and } from 'drizzle-orm';
import { pusherServer, taskChannel } from '@/lib/pusher/server';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ taskId: string; cid: string }> }) {
  const user = await requireUser();
  const { taskId, cid } = await params;

  /*
   * The task and the comment used to be fetched by id alone — taskId from
   * the URL, cid from the URL — with no check that either belonged to this
   * org, or even that the comment belonged to the task. A caller could react
   * to (and trigger a notification insert about) a comment on a completely
   * different tenant's task just by knowing its uuid; the notification's
   * projectId and the pusher trigger would then point at that foreign task.
   */
  const [task] = await db.select({ projectId: tasks.projectId })
    .from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.orgId, user.orgId))).limit(1);
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [comment] = await db.select({ userId: taskComments.userId })
    .from(taskComments)
    .where(and(eq(taskComments.id, cid), eq(taskComments.taskId, taskId), eq(taskComments.orgId, user.orgId)))
    .limit(1);
  if (!comment) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [existing] = await db.select().from(commentReactions)
    .where(and(
      eq(commentReactions.commentId, cid),
      eq(commentReactions.userId, user.id),
      eq(commentReactions.emoji, '👍'),
    ));

  if (existing) {
    await db.delete(commentReactions).where(eq(commentReactions.id, existing.id));
  } else {
    await db.insert(commentReactions).values({
      commentId: cid, userId: user.id, orgId: user.orgId, emoji: '👍',
    }).onConflictDoNothing();

    // notify the comment author (if it's not themselves)
    if (comment.userId !== user.id) {
      await db.insert(pmNotifications).values({
        userId: comment.userId, orgId: user.orgId, type: 'comment.reaction',
        taskId, projectId: task.projectId, triggeredByUserId: user.id,
      }).onConflictDoNothing();
    }
  }

  pusherServer.trigger(taskChannel(taskId), 'task.comment', { commentId: cid })
    .catch((err) => console.error('[Pusher] reaction trigger failed:', err));

  return NextResponse.json({ success: true });
}
