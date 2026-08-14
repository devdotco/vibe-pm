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
    .leftJoin(tasks, eq(pmNotifications.taskId, tasks.id))
    .where(and(eq(pmNotifications.userId, user.id), eq(pmNotifications.orgId, user.orgId)))
    .orderBy(desc(pmNotifications.createdAt))
    .limit(100);
  return NextResponse.json({ notifications: notifs });
}
