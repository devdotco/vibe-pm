import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tasks, projects, sections, taskComments, taskAssignees, users } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { eq, and, isNull, asc, sql, inArray, or, ne, gte } from 'drizzle-orm';
import { parseCompletedScope, RECENT_COMPLETED_DAYS } from '@/lib/pm/completed-scope';

export async function GET(req: NextRequest) {
  const user = await requireUser();
  /*
   * Same `completed` scope as a project's task list (lib/pm/completed-scope).
   * Without it this returned every task ever assigned — 9,741 rows for one
   * person with 86 open, by Oct 2026 — and My Tasks drew all of them.
   */
  const completed = parseCompletedScope(req.nextUrl.searchParams.get('completed'));
  const completedCondition =
    completed === 'none' ? ne(tasks.status, 'completed')
    : completed === 'recent'
      ? or(ne(tasks.status, 'completed'), gte(tasks.completedAt, new Date(Date.now() - RECENT_COMPLETED_DAYS * 24 * 60 * 60 * 1000)))
      : undefined;

  // Task IDs where user is assigned via the multi-assignee table — a subquery
  // rather than a list fetched first: for the busiest people that list ran to
  // thousands of ids, every one of them sent back as a bind parameter.
  const assigneeTaskIds = db
    .select({ taskId: taskAssignees.taskId })
    .from(taskAssignees)
    .where(eq(taskAssignees.userId, user.id));

  // Tasks where user is assignee (legacy single-assignee OR multi-assignee table)
  const rows = await db
    .select({
      task: tasks,
      projectName: projects.name,
      projectColor: projects.color,
      sectionName: sections.name,
    })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .leftJoin(sections, eq(tasks.sectionId, sections.id))
    .where(and(
      eq(tasks.orgId, user.orgId),
      isNull(tasks.deletedAt),
      or(
        eq(tasks.assigneeId, user.id),
        inArray(tasks.id, assigneeTaskIds),
      ),
      completedCondition,
    ))
    .orderBy(asc(tasks.dueDate));

  if (rows.length === 0) return NextResponse.json({ tasks: [] });

  const taskIds = rows.map((r) => r.task.id);

  // Comment counts
  const commentCountRows = await db
    .select({
      taskId: taskComments.taskId,
      cnt: sql<string>`count(*)`,
    })
    .from(taskComments)
    .where(and(inArray(taskComments.taskId, taskIds), isNull(taskComments.deletedAt)))
    .groupBy(taskComments.taskId);

  const commentCountMap: Record<string, number> = {};
  for (const r of commentCountRows) {
    commentCountMap[r.taskId] = Number(r.cnt);
  }

  // Subtask counts
  const subtaskCountRows = await db
    .select({
      parentTaskId: tasks.parentTaskId,
      cnt: sql<string>`count(*)`,
    })
    .from(tasks)
    .where(
      and(
        inArray(tasks.parentTaskId, taskIds),
        isNull(tasks.deletedAt)
      )
    )
    .groupBy(tasks.parentTaskId);

  const subtaskCountMap: Record<string, number> = {};
  for (const r of subtaskCountRows) {
    if (r.parentTaskId) subtaskCountMap[r.parentTaskId] = Number(r.cnt);
  }

  // Assignees per task (all, not just current user)
  const assigneeRows = await db
    .select({
      taskId: taskAssignees.taskId,
      userId: taskAssignees.userId,
      name: users.name,
    })
    .from(taskAssignees)
    .innerJoin(users, eq(taskAssignees.userId, users.id))
    .where(inArray(taskAssignees.taskId, taskIds));

  const assigneesMap: Record<string, Array<{ id: string; name: string }>> = {};
  for (const r of assigneeRows) {
    if (!assigneesMap[r.taskId]) assigneesMap[r.taskId] = [];
    assigneesMap[r.taskId]!.push({ id: r.userId, name: r.name });
  }

  const result = rows.map((r) => ({
    task: r.task,
    projectName: r.projectName,
    projectColor: r.projectColor,
    sectionName: r.sectionName,
    commentCount: commentCountMap[r.task.id] ?? 0,
    subtaskCount: subtaskCountMap[r.task.id] ?? 0,
    assignees: assigneesMap[r.task.id] ?? [],
  }));

  return NextResponse.json({ tasks: result });
}
