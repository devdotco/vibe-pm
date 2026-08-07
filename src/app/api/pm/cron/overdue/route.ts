import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tasks, pmNotifications } from '@/lib/db/schema';
import { requireCronAuth } from '@/lib/auth/service';
import { dispatchEvent } from '@/lib/webhooks/dispatcher';
import { and, isNull, lt, notInArray } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  if (!requireCronAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const today = new Date().toISOString().split('T')[0];
  const overdueTasks = await db.select().from(tasks).where(
    and(
      isNull(tasks.deletedAt),
      sql`${tasks.dueDate} < ${today}`,
      notInArray(tasks.status, ['completed', 'blocked']),
    )
  ).limit(500);

  let processed = 0;
  for (const task of overdueTasks) {
    await dispatchEvent({ eventType: 'task.overdue', orgId: task.orgId, projectId: task.projectId, taskId: task.id, data: { title: task.title } });
    if (task.assigneeId) {
      await db.insert(pmNotifications).values({
        userId: task.assigneeId, orgId: task.orgId, type: 'task.overdue', taskId: task.id, projectId: task.projectId,
      });
    }
    processed++;
  }
  return NextResponse.json({ processed });
}
