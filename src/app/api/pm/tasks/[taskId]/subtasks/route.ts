import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tasks } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { logActivity } from '@/lib/activity';
import { eq, and, isNull, asc } from 'drizzle-orm';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const user = await requireUser();
  const { taskId } = await params;
  const subtasks = await db.select().from(tasks)
    .where(and(eq(tasks.parentTaskId, taskId), eq(tasks.orgId, user.orgId), isNull(tasks.deletedAt)))
    .orderBy(asc(tasks.position));
  return NextResponse.json({ subtasks });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const user = await requireUser();
  const { taskId } = await params;
  const [parent] = await db.select().from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.orgId, user.orgId), isNull(tasks.deletedAt)));
  if (!parent) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { title, assigneeId, dueDate } = await req.json();
  const [subtask] = await db.transaction(async (tx) => {
    const [s] = await tx.insert(tasks).values({
      projectId: parent.projectId, sectionId: parent.sectionId, orgId: user.orgId,
      title, assigneeId, dueDate, parentTaskId: taskId, position: Date.now(), createdBy: user.id,
    }).returning();
    await logActivity({ taskId: s.id, projectId: parent.projectId, orgId: user.orgId, userId: user.id, action: 'created' }, tx);
    return [s];
  });
  return NextResponse.json({ subtask }, { status: 201 });
}
