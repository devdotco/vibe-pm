import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tasks, projects, sections, taskComments, taskAssignees, users } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { eq, and, isNull, asc, sql, inArray, or } from 'drizzle-orm';

export async function GET() {
  const user = await requireUser();

  // Find all task IDs where user is assigned via the multi-assignee table
  const assigneeTaskRows = await db
    .select({ taskId: taskAssignees.taskId })
    .from(taskAssignees)
    .where(eq(taskAssignees.userId, user.id));
  const assigneeTaskIds = assigneeTaskRows.map(r => r.taskId);

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
        assigneeTaskIds.length > 0 ? inArray(tasks.id, assigneeTaskIds) : sql`false`,
      ),
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
