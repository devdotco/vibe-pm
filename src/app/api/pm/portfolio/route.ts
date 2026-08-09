import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projects, projectMembers, tasks, taskAssignees, goals, goalProjectLinks, teams, users } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { eq, and, ne, isNull, count, sql } from 'drizzle-orm';

export async function GET() {
  const user = await requireUser();

  // Get all projects the user can see
  const memberProjects = await db
    .select({ project: projects, teamName: teams.name })
    .from(projectMembers)
    .innerJoin(projects, eq(projectMembers.projectId, projects.id))
    .leftJoin(teams, eq(projects.teamId, teams.id))
    .where(and(eq(projectMembers.userId, user.id), eq(projectMembers.orgId, user.orgId), ne(projects.status, 'archived')));

  const today = new Date().toISOString().slice(0, 10);

  const result = await Promise.all(memberProjects.map(async ({ project, teamName }) => {
    // Task counts
    const [totalRow] = await db.select({ count: count() }).from(tasks)
      .where(and(eq(tasks.projectId, project.id), isNull(tasks.deletedAt)));
    const [completedRow] = await db.select({ count: count() }).from(tasks)
      .where(and(eq(tasks.projectId, project.id), eq(tasks.status, 'completed'), isNull(tasks.deletedAt)));
    const [overdueRow] = await db.select({ count: count() }).from(tasks)
      .where(and(
        eq(tasks.projectId, project.id),
        isNull(tasks.deletedAt),
        ne(tasks.status, 'completed'),
        sql`${tasks.dueDate} IS NOT NULL AND ${tasks.dueDate} < ${today}`,
      ));

    const total = Number(totalRow?.count ?? 0);
    const completed = Number(completedRow?.count ?? 0);
    const overdue = Number(overdueRow?.count ?? 0);

    // Status
    let status: 'on_track' | 'at_risk' | 'off_track' | 'completed' = 'on_track';
    if (total > 0 && completed === total) {
      status = 'completed';
    } else if (overdue > 0 && total > 0 && overdue / total > 0.2) {
      status = 'off_track';
    } else if (overdue > 0) {
      status = 'at_risk';
    }

    // Assignees (distinct)
    const assigneeRows = await db
      .selectDistinct({ id: users.id, name: users.name, avatarUrl: users.avatarUrl })
      .from(taskAssignees)
      .innerJoin(tasks, eq(taskAssignees.taskId, tasks.id))
      .innerJoin(users, eq(taskAssignees.userId, users.id))
      .where(and(eq(tasks.projectId, project.id), isNull(tasks.deletedAt)))
      .limit(6);

    // Also add tasks with assigneeId directly
    const directAssignees = await db
      .selectDistinct({ id: users.id, name: users.name, avatarUrl: users.avatarUrl })
      .from(tasks)
      .innerJoin(users, eq(tasks.assigneeId, users.id))
      .where(and(eq(tasks.projectId, project.id), isNull(tasks.deletedAt)))
      .limit(6);

    const allAssignees = [...assigneeRows];
    for (const a of directAssignees) {
      if (!allAssignees.some(x => x.id === a.id)) allAssignees.push(a);
    }

    // Linked goal
    const [goalLink] = await db
      .select({ goalTitle: goals.title })
      .from(goalProjectLinks)
      .innerJoin(goals, eq(goalProjectLinks.goalId, goals.id))
      .where(eq(goalProjectLinks.projectId, project.id))
      .limit(1);

    return {
      id: project.id,
      name: project.name,
      color: project.color,
      teamName: teamName ?? null,
      dueDate: project.dueDate ?? null,
      status,
      total,
      completed,
      overdue,
      progress: total > 0 ? Math.round((completed / total) * 100) : 0,
      assignees: allAssignees.slice(0, 5),
      extraAssignees: Math.max(0, allAssignees.length - 5),
      linkedGoal: goalLink?.goalTitle ?? null,
    };
  }));

  // Sort: off_track first, at_risk, on_track, completed
  const ORDER = { off_track: 0, at_risk: 1, on_track: 2, completed: 3 };
  result.sort((a, b) => (ORDER[a.status] ?? 3) - (ORDER[b.status] ?? 3));

  return NextResponse.json({ projects: result });
}
