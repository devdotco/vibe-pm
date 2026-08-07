import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { taskActivity, taskComments, users } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { eq, and, isNull, asc } from 'drizzle-orm';

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

  // merge and sort
  const feed = [
    ...activityRows.map(r => ({ ...r, _type: 'activity' as const })),
    ...commentRows.map(r => ({ ...r, _type: 'comment' as const })),
  ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return NextResponse.json({ feed });
}
