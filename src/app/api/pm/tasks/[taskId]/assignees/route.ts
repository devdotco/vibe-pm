import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { taskAssignees, tasks, users } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { logActivity } from '@/lib/activity';
import { eq, and } from 'drizzle-orm';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const user = await requireUser();
  const { taskId } = await params;
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(taskAssignees)
    .innerJoin(users, eq(taskAssignees.userId, users.id))
    .where(and(eq(taskAssignees.taskId, taskId), eq(taskAssignees.orgId, user.orgId)));
  return NextResponse.json({ assignees: rows });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const user = await requireUser();
  const { taskId } = await params;
  const [task] = await db.select().from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.orgId, user.orgId)));
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { userId } = await req.json();
  const [assignee] = await db.transaction(async (tx) => {
    const [a] = await tx.insert(taskAssignees).values({ taskId, orgId: user.orgId, userId, assignedBy: user.id }).returning();
    await logActivity({ taskId, projectId: task.projectId, orgId: user.orgId, userId: user.id, action: 'assigned', newValue: userId }, tx);
    return [a];
  });
  return NextResponse.json({ assignee }, { status: 201 });
}
