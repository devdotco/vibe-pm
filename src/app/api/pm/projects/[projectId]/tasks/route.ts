import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tasks, taskAssignees, users, taskComments, taskAttachments } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { eq, and, isNull, asc, inArray, sql } from 'drizzle-orm';

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await requireUser();
  const { projectId } = await params;
  const { searchParams } = req.nextUrl;
  const status = searchParams.get('status');
  const assigneeId = searchParams.get('assigneeId');
  const parentTaskId = searchParams.get('parentTaskId');

  const conditions = [
    eq(tasks.projectId, projectId),
    eq(tasks.orgId, user.orgId),
    isNull(tasks.deletedAt),
  ];

  // If parentTaskId is specified, fetch subtasks; otherwise fetch top-level tasks
  if (parentTaskId) {
    conditions.push(eq(tasks.parentTaskId, parentTaskId));
  } else {
    conditions.push(isNull(tasks.parentTaskId));
  }

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

  // Count subtasks per task
  const subtaskCounts = parentTaskId ? [] : await db
    .select({
      parentTaskId: tasks.parentTaskId,
      count: sql<number>`COUNT(*)`.mapWith(Number),
    })
    .from(tasks)
    .where(and(
      eq(tasks.projectId, projectId),
      eq(tasks.orgId, user.orgId),
      isNull(tasks.deletedAt),
      inArray(tasks.parentTaskId, taskIds),
    ))
    .groupBy(tasks.parentTaskId);

  const subtaskCountMap: Record<string, number> = {};
  for (const r of subtaskCounts) {
    if (r.parentTaskId) subtaskCountMap[r.parentTaskId] = r.count;
  }

  // Count comments per task
  const commentCountRows = await db
    .select({
      taskId: taskComments.taskId,
      count: sql<number>`COUNT(*)`.mapWith(Number),
    })
    .from(taskComments)
    .where(and(
      inArray(taskComments.taskId, taskIds),
      isNull(taskComments.deletedAt),
    ))
    .groupBy(taskComments.taskId);

  const commentCountMap: Record<string, number> = {};
  for (const r of commentCountRows) {
    commentCountMap[r.taskId] = r.count;
  }

  // Count attachments per task
  const attachmentCountRows = await db
    .select({
      taskId: taskAttachments.taskId,
      count: sql<number>`COUNT(*)`.mapWith(Number),
    })
    .from(taskAttachments)
    .where(inArray(taskAttachments.taskId, taskIds))
    .groupBy(taskAttachments.taskId);

  const attachmentCountMap: Record<string, number> = {};
  for (const r of attachmentCountRows) {
    attachmentCountMap[r.taskId] = r.count;
  }

  const tasksWithAssignees = rows.map((task) => ({
    ...task,
    assignees: assigneesByTask[task.id] ?? [],
    subtaskCount: subtaskCountMap[task.id] ?? 0,
    commentCount: commentCountMap[task.id] ?? 0,
    attachmentCount: attachmentCountMap[task.id] ?? 0,
  }));

  return NextResponse.json({ tasks: tasksWithAssignees });
}
