import { db } from "@/lib/db";
import { tasks, projects, projectMembers, users } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { eq, and, isNull, ne, lt, gte, lte, desc, asc, inArray, sql } from "drizzle-orm";
import { HomeDashboardClient } from "./home-dashboard-client";

export type TaskCard = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  projectId: string;
  projectName: string;
  projectColor: string;
};

export type ProjectCard = {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  status: string;
  dueSoonCount: number;
};

export type Collaborator = {
  id: string;
  name: string;
  email: string;
  overdue: number;
  completedThisWeek: number;
  upcoming: number;
};

export default async function HomePage() {
  const user = await requireUser();

  const now = new Date();
  const todayStr = now.toISOString().split("T")[0]!;
  const weekAgoDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const weekAheadStr = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0]!;

  // ── My Tasks (non-completed) ───────────────────────────────────────────────
  const myTaskRows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
      projectId: tasks.projectId,
      projectName: projects.name,
      projectColor: projects.color,
    })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .where(
      and(
        eq(tasks.assigneeId, user.id),
        eq(tasks.orgId, user.orgId),
        isNull(tasks.deletedAt),
        ne(tasks.status, "completed")
      )
    )
    .orderBy(asc(tasks.dueDate))
    .limit(30);

  const upcomingTasks: TaskCard[] = myTaskRows
    .filter((r) => !r.dueDate || r.dueDate >= todayStr)
    .slice(0, 6);

  const overdueTasks: TaskCard[] = myTaskRows.filter(
    (r) => r.dueDate !== null && r.dueDate < todayStr
  );

  // ── Completed tasks (for Completed tab) ───────────────────────────────────
  const completedTaskRows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
      projectId: tasks.projectId,
      projectName: projects.name,
      projectColor: projects.color,
    })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .where(
      and(
        eq(tasks.assigneeId, user.id),
        eq(tasks.orgId, user.orgId),
        isNull(tasks.deletedAt),
        eq(tasks.status, "completed")
      )
    )
    .orderBy(desc(tasks.completedAt))
    .limit(6);

  const completedTasks: TaskCard[] = completedTaskRows;

  // ── Recent Projects ────────────────────────────────────────────────────────
  const recentProjectRows = await db
    .select({ project: projects })
    .from(projectMembers)
    .innerJoin(projects, eq(projectMembers.projectId, projects.id))
    .where(
      and(
        eq(projectMembers.userId, user.id),
        eq(projectMembers.orgId, user.orgId)
      )
    )
    .orderBy(desc(projects.updatedAt))
    .limit(6);

  const projectIds = recentProjectRows.map((r) => r.project.id);

  // Task counts due soon per project
  const dueSoonByProject: Record<string, number> = {};
  if (projectIds.length > 0) {
    const dueSoonRows = await db
      .select({
        projectId: tasks.projectId,
        cnt: sql<string>`count(*)`,
      })
      .from(tasks)
      .where(
        and(
          inArray(tasks.projectId, projectIds),
          ne(tasks.status, "completed"),
          isNull(tasks.deletedAt),
          gte(tasks.dueDate, todayStr),
          lte(tasks.dueDate, weekAheadStr)
        )
      )
      .groupBy(tasks.projectId);

    for (const row of dueSoonRows) {
      dueSoonByProject[row.projectId] = Number(row.cnt);
    }
  }

  const recentProjects: ProjectCard[] = recentProjectRows.map((r) => ({
    id: r.project.id,
    name: r.project.name,
    color: r.project.color,
    icon: r.project.icon,
    status: r.project.status,
    dueSoonCount: dueSoonByProject[r.project.id] ?? 0,
  }));

  // ── Collaborators ──────────────────────────────────────────────────────────
  const collaborators: Collaborator[] = [];

  if (projectIds.length > 0) {
    const collabIdRows = await db
      .selectDistinct({ userId: projectMembers.userId })
      .from(projectMembers)
      .where(
        and(
          inArray(projectMembers.projectId, projectIds),
          ne(projectMembers.userId, user.id),
          eq(projectMembers.orgId, user.orgId)
        )
      )
      .limit(6);

    const collabIds = collabIdRows.map((r) => r.userId);

    if (collabIds.length > 0) {
      const collabUsers = await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(inArray(users.id, collabIds));

      // Overdue counts
      const overdueRows = await db
        .select({
          assigneeId: tasks.assigneeId,
          cnt: sql<string>`count(*)`,
        })
        .from(tasks)
        .where(
          and(
            inArray(tasks.assigneeId, collabIds),
            lt(tasks.dueDate, todayStr),
            ne(tasks.status, "completed"),
            isNull(tasks.deletedAt),
            eq(tasks.orgId, user.orgId)
          )
        )
        .groupBy(tasks.assigneeId);

      // Completed this week
      const completedWeekRows = await db
        .select({
          assigneeId: tasks.assigneeId,
          cnt: sql<string>`count(*)`,
        })
        .from(tasks)
        .where(
          and(
            inArray(tasks.assigneeId, collabIds),
            eq(tasks.status, "completed"),
            gte(tasks.completedAt, weekAgoDate),
            isNull(tasks.deletedAt),
            eq(tasks.orgId, user.orgId)
          )
        )
        .groupBy(tasks.assigneeId);

      // Upcoming (next 7 days)
      const upcomingRows = await db
        .select({
          assigneeId: tasks.assigneeId,
          cnt: sql<string>`count(*)`,
        })
        .from(tasks)
        .where(
          and(
            inArray(tasks.assigneeId, collabIds),
            gte(tasks.dueDate, todayStr),
            lte(tasks.dueDate, weekAheadStr),
            ne(tasks.status, "completed"),
            isNull(tasks.deletedAt),
            eq(tasks.orgId, user.orgId)
          )
        )
        .groupBy(tasks.assigneeId);

      const overdueMap: Record<string, number> = {};
      for (const r of overdueRows) {
        if (r.assigneeId) overdueMap[r.assigneeId] = Number(r.cnt);
      }
      const completedMap: Record<string, number> = {};
      for (const r of completedWeekRows) {
        if (r.assigneeId) completedMap[r.assigneeId] = Number(r.cnt);
      }
      const upcomingMap: Record<string, number> = {};
      for (const r of upcomingRows) {
        if (r.assigneeId) upcomingMap[r.assigneeId] = Number(r.cnt);
      }

      for (const u of collabUsers) {
        collaborators.push({
          id: u.id,
          name: u.name,
          email: u.email,
          overdue: overdueMap[u.id] ?? 0,
          completedThisWeek: completedMap[u.id] ?? 0,
          upcoming: upcomingMap[u.id] ?? 0,
        });
      }
    }
  }

  return (
    <HomeDashboardClient
      user={{ id: user.id, name: user.name, email: user.email }}
      upcomingTasks={upcomingTasks}
      overdueTasks={overdueTasks}
      completedTasks={completedTasks}
      recentProjects={recentProjects}
      collaborators={collaborators}
    />
  );
}
