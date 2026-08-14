import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { commentReactions, taskComments, tasks, pmNotifications } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { eq, and } from 'drizzle-orm';
import { pusherServer, taskChannel } from '@/lib/pusher/server';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ taskId: string; cid: string }> }) {
  const user = await requireUser();
  const { taskId, cid } = await params;

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
    const [comment] = await db.select({ userId: taskComments.userId })
      .from(taskComments).where(eq(taskComments.id, cid)).limit(1);
    if (comment && comment.userId !== user.id) {
      const [task] = await db.select({ projectId: tasks.projectId })
        .from(tasks).where(eq(tasks.id, taskId)).limit(1);
      await db.insert(pmNotifications).values({
        userId: comment.userId, orgId: user.orgId, type: 'comment.reaction',
        taskId, projectId: task?.projectId ?? null, triggeredByUserId: user.id,
      }).onConflictDoNothing();
    }
  }

  pusherServer.trigger(taskChannel(taskId), 'task.comment', { commentId: cid })
    .catch((err) => console.error('[Pusher] reaction trigger failed:', err));

  return NextResponse.json({ success: true });
}
