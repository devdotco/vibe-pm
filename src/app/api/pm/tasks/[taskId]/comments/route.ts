import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { taskComments, tasks } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { logActivity } from '@/lib/activity';
import { eq, and, isNull, asc } from 'drizzle-orm';

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
  const { taskId } = await params;
  const [task] = await db.select().from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.orgId, user.orgId)));
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { content } = await req.json();
  const [comment] = await db.transaction(async (tx) => {
    const [c] = await tx.insert(taskComments).values({ taskId, orgId: user.orgId, userId: user.id, content }).returning();
    await logActivity({ taskId, projectId: task.projectId, orgId: user.orgId, userId: user.id, action: 'commented', newValue: c.id }, tx);
    return [c];
  });
  return NextResponse.json({ comment }, { status: 201 });
}
