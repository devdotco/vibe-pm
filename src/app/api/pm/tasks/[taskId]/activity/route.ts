import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { taskActivity, taskComments } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { eq, and, isNull, asc } from 'drizzle-orm';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const user = await requireUser();
  const { taskId } = await params;
  const activity = await db.select().from(taskActivity)
    .where(and(eq(taskActivity.taskId, taskId), eq(taskActivity.orgId, user.orgId)))
    .orderBy(asc(taskActivity.createdAt));
  const comments = await db.select().from(taskComments)
    .where(and(eq(taskComments.taskId, taskId), eq(taskComments.orgId, user.orgId), isNull(taskComments.deletedAt)))
    .orderBy(asc(taskComments.createdAt));

  // merge and sort
  const feed = [
    ...activity.map(a => ({ ...a, _type: 'activity' as const })),
    ...comments.map(c => ({ ...c, _type: 'comment' as const })),
  ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return NextResponse.json({ feed });
}
