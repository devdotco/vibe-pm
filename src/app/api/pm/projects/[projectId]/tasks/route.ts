import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tasks, taskAssignees, users } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { eq, and, isNull, asc, inArray } from 'drizzle-orm';

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await requireUser();
  const { projectId } = await params;
  const { searchParams } = req.nextUrl;
  const status = searchParams.get('status');
  const assigneeId = searchParams.get('assigneeId');

  const conditions = [
    eq(tasks.projectId, projectId),
    eq(tasks.orgId, user.orgId),
    isNull(tasks.deletedAt),
    isNull(tasks.parentTaskId),
  ];
  if (status) conditions.push(eq(tasks.status, status));
  if (assigneeId) conditions.push(eq(tasks.assigneeId, assigneeId));

  const rows = await db.select().from(tasks)
    .where(and(...conditions))
    .orderBy(asc(tasks.position));

  if (rows.length === 0) return NextResponse.json({ tasks: [] });

  const taskIds = rows.map((r) => r.id);

  // Fetch all assignees for these tasks
  const assigneeRows = await db
    .select({ taskId: taskAssignees.taskId, userId: taskAssignees.userId, name: users.name, email: users.email })
    .from(taskAssignees)
    .innerJoin(users, eq(taskAssignees.userId, users.id))
    .where(inArray(taskAssignees.taskId, taskIds));

  const assigneesByTask: Record<string, Array<{ id: string; name: string; email: string }>> = {};
  for (const r of assigneeRows) {
    if (!assigneesByTask[r.taskId]) assigneesByTask[r.taskId] = [];
    assigneesByTask[r.taskId]!.push({ id: r.userId, name: r.name, email: r.email });
  }

  const tasksWithAssignees = rows.map((task) => ({
    ...task,
    assignees: assigneesByTask[task.id] ?? [],
  }));

  return NextResponse.json({ tasks: tasksWithAssignees });
}
