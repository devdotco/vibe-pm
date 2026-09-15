import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { pmNotifications, tasks } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { eq, and, desc } from 'drizzle-orm';

export async function GET() {
  const user = await requireUser();
  const notifs = await db
    .select({
      id: pmNotifications.id,
      type: pmNotifications.type,
      taskId: pmNotifications.taskId,
      projectId: pmNotifications.projectId,
      triggeredByUserId: pmNotifications.triggeredByUserId,
      isRead: pmNotifications.isRead,
      createdAt: pmNotifications.createdAt,
      taskTitle: tasks.title,
    })
    .from(pmNotifications)
    // Org-scoped on the join, not just on pmNotifications below: a
    // notification row naming a taskId outside this org (see the reactions
    // route fix, which used to be able to write exactly that) would
    // otherwise still surface that foreign task's title here.
    .leftJoin(tasks, and(eq(pmNotifications.taskId, tasks.id), eq(tasks.orgId, user.orgId)))
    .where(and(eq(pmNotifications.userId, user.id), eq(pmNotifications.orgId, user.orgId)))
    .orderBy(desc(pmNotifications.createdAt))
    .limit(100);
  return NextResponse.json({ notifications: notifs });
}
