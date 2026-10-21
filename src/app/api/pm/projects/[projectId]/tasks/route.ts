import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tasks, taskAssignees, users, taskComments, taskAttachments } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { eq, and, isNull, asc, inArray, sql, ne, or, gte } from 'drizzle-orm';
import { parseCompletedScope, RECENT_COMPLETED_DAYS } from '@/lib/pm/completed-scope';

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await requireUser();
  const { projectId } = await params;
  const { searchParams } = req.nextUrl;
  const status = searchParams.get('status');
  const assigneeId = searchParams.get('assigneeId');
  const parentTaskId = searchParams.get('parentTaskId');
  // One row, in the same shape as the list, so the board can refresh the task
  // just edited instead of re-reading every task in the project. Top-level or
  // not: the caller decides where a subtask's row belongs.
  const taskId = searchParams.get('taskId');
  /*
   * Which completed tasks to include: none, the last RECENT_COMPLETED_DAYS, or
   * all of them (the default, so callers that never asked keep what they got).
   *
   * The board asks for `recent`. Imported projects are almost entirely history
   * — Top Tier Team Orders was 8,128 top-level tasks with ONE open — and
   * shipping all of it made every board open a ~9 MB download and an
   * 8,000-row render. Open is `status <> 'completed'`, not `completed_at IS
   * NULL`: a handful of imported rows are completed with no timestamp.
   */
  const completed = parseCompletedScope(searchParams.get('completed'));

  const conditions = [
    eq(tasks.projectId, projectId),
    eq(tasks.orgId, user.orgId),
    isNull(tasks.deletedAt),
  ];

  // If parentTaskId is specified, fetch subtasks; otherwise fetch top-level tasks
  if (taskId) {
    conditions.push(eq(tasks.id, taskId));
  } else if (parentTaskId) {
    conditions.push(eq(tasks.parentTaskId, parentTaskId));
  } else {
    conditions.push(isNull(tasks.parentTaskId));
  }

  if (status) conditions.push(eq(tasks.status, status));
  if (!taskId && completed === 'none') {
    conditions.push(ne(tasks.status, 'completed'));
  } else if (!taskId && completed === 'recent') {
    const since = new Date(Date.now() - RECENT_COMPLETED_DAYS * 24 * 60 * 60 * 1000);
    conditions.push(or(ne(tasks.status, 'completed'), gte(tasks.completedAt, since))!);
  }
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
  const subtaskCounts = parentTaskId && !taskId ? [] : await db
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
