import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { taskActivity, taskComments, commentReactions, users } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { eq, and, isNull, asc, inArray } from 'drizzle-orm';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const user = await requireUser();
  const { taskId } = await params;

  const activityRows = await db
    .select({
      id: taskActivity.id,
      taskId: taskActivity.taskId,
      projectId: taskActivity.projectId,
      orgId: taskActivity.orgId,
      userId: taskActivity.userId,
      action: taskActivity.action,
      oldValue: taskActivity.oldValue,
      newValue: taskActivity.newValue,
      metadata: taskActivity.metadata,
      createdAt: taskActivity.createdAt,
      userName: users.name,
    })
    .from(taskActivity)
    .leftJoin(users, eq(taskActivity.userId, users.id))
    .where(and(eq(taskActivity.taskId, taskId), eq(taskActivity.orgId, user.orgId)))
    .orderBy(asc(taskActivity.createdAt));

  const commentRows = await db
    .select({
      id: taskComments.id,
      taskId: taskComments.taskId,
      orgId: taskComments.orgId,
      userId: taskComments.userId,
      content: taskComments.content,
      source: taskComments.source,
      isEdited: taskComments.isEdited,
      editedAt: taskComments.editedAt,
      deletedAt: taskComments.deletedAt,
      createdAt: taskComments.createdAt,
      userName: users.name,
    })
    .from(taskComments)
    .leftJoin(users, eq(taskComments.userId, users.id))
    .where(and(eq(taskComments.taskId, taskId), eq(taskComments.orgId, user.orgId), isNull(taskComments.deletedAt)))
    .orderBy(asc(taskComments.createdAt));

  // fetch reactions for all comments in one query
  const commentIds = commentRows.map(c => c.id);
  const reactionRows = commentIds.length > 0
    ? await db.select({ commentId: commentReactions.commentId, userId: commentReactions.userId, userName: users.name })
        .from(commentReactions)
        .leftJoin(users, eq(commentReactions.userId, users.id))
        .where(inArray(commentReactions.commentId, commentIds))
    : [];

  const reactionsByComment: Record<string, Array<{ userId: string; userName: string | null }>> = {};
  for (const r of reactionRows) {
    if (!reactionsByComment[r.commentId]) reactionsByComment[r.commentId] = [];
    reactionsByComment[r.commentId]!.push({ userId: r.userId, userName: r.userName });
  }

  // merge and sort
  const feed = [
    ...activityRows.map(r => ({ ...r, _type: 'activity' as const })),
    ...commentRows.map(r => ({ ...r, _type: 'comment' as const, reactions: reactionsByComment[r.id] ?? [] })),
  ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return NextResponse.json({ feed });
}
