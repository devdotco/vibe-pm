import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tasks, pmNotifications, taskRecurrence } from '@/lib/db/schema';
import { requireCronAuth } from '@/lib/auth/service';
import { dispatchEvent } from '@/lib/webhooks/dispatcher';
import { and, isNull, notInArray, lte } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

function nextOccurrence(rec: typeof taskRecurrence.$inferSelect): string | null {
  const base = new Date(rec.nextDueDate + 'T00:00:00Z');

  if (rec.frequency === 'daily') {
    base.setUTCDate(base.getUTCDate() + rec.interval);
    return base.toISOString().slice(0, 10);
  }

  if (rec.frequency === 'biweekly') {
    base.setUTCDate(base.getUTCDate() + rec.interval * 14);
    return base.toISOString().slice(0, 10);
  }

  if (rec.frequency === 'weekly') {
    if (rec.daysOfWeek && rec.daysOfWeek.length > 0) {
      // Find the next matching day after base
      const sorted = [...rec.daysOfWeek].sort((a, b) => a - b);
      for (let i = 1; i <= 7; i++) {
        const candidate = new Date(base);
        candidate.setUTCDate(base.getUTCDate() + i);
        const dow = candidate.getUTCDay() === 0 ? 7 : candidate.getUTCDay(); // ISO: 1=Mon
        if (sorted.includes(dow)) return candidate.toISOString().slice(0, 10);
      }
    }
    base.setUTCDate(base.getUTCDate() + rec.interval * 7);
    return base.toISOString().slice(0, 10);
  }

  if (rec.frequency === 'monthly') {
    const targetDay = rec.dayOfMonth ?? base.getUTCDate();
    base.setUTCMonth(base.getUTCMonth() + rec.interval);
    // clamp to last day of month
    const maxDay = new Date(base.getUTCFullYear(), base.getUTCMonth() + 1, 0).getUTCDate();
    base.setUTCDate(Math.min(targetDay, maxDay));
    return base.toISOString().slice(0, 10);
  }

  if (rec.frequency === 'quarterly') {
    base.setUTCMonth(base.getUTCMonth() + rec.interval * 3);
    return base.toISOString().slice(0, 10);
  }

  return null;
}

export async function GET(req: NextRequest) {
  if (!requireCronAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const today = new Date().toISOString().split('T')[0]!;
  const nowTime = new Date().toTimeString().slice(0, 5);

  // ── Overdue notifications ─────────────────────────────────────────────────
  const overdueTasks = await db.select().from(tasks).where(
    and(
      isNull(tasks.deletedAt),
      sql`(
        ${tasks.dueDate} < ${today}
        OR (${tasks.dueDate} = ${today} AND ${tasks.dueTime} IS NOT NULL AND ${tasks.dueTime} < ${nowTime}::time)
      )`,
      notInArray(tasks.status, ['completed', 'blocked']),
    )
  ).limit(500);

  let processed = 0;
  for (const task of overdueTasks) {
    await dispatchEvent({ eventType: 'task.overdue', orgId: task.orgId, projectId: task.projectId, taskId: task.id, data: { title: task.title } });
    if (task.assigneeId) {
      await db.insert(pmNotifications).values({
        userId: task.assigneeId, orgId: task.orgId, type: 'task.overdue', taskId: task.id, projectId: task.projectId,
      }).onConflictDoNothing();
    }
    processed++;
  }

  // ── Recurring task generation ─────────────────────────────────────────────
  const dueRecurrences = await db.select().from(taskRecurrence)
    .where(lte(taskRecurrence.nextDueDate, today));

  let generated = 0;
  for (const rec of dueRecurrences) {
    const [base] = await db.select().from(tasks).where(sql`${tasks.id} = ${rec.taskId}`);
    if (!base) continue;

    // Create new task copying the base
    await db.insert(tasks).values({
      projectId: base.projectId,
      sectionId: base.sectionId,
      orgId: base.orgId,
      title: base.title,
      description: base.description,
      status: 'not_started',
      priority: base.priority,
      assigneeId: base.assigneeId,
      dueDate: rec.nextDueDate,
      startDate: null,
      labels: base.labels,
      estimatedMinutes: base.estimatedMinutes,
      parentTaskId: null,
      position: base.position + 0.001,
      createdBy: base.createdBy,
    });

    const newOccurrenceCount = rec.occurrenceCount + 1;
    const nextDue = nextOccurrence(rec);

    const shouldStop = !nextDue
      || (rec.maxOccurrences != null && newOccurrenceCount >= rec.maxOccurrences)
      || (rec.endDate != null && nextDue > rec.endDate);

    if (shouldStop) {
      await db.delete(taskRecurrence).where(sql`${taskRecurrence.id} = ${rec.id}`);
    } else {
      await db.update(taskRecurrence).set({
        nextDueDate: nextDue!,
        occurrenceCount: newOccurrenceCount,
      }).where(sql`${taskRecurrence.id} = ${rec.id}`);
    }

    generated++;
  }

  return NextResponse.json({ processed, generated });
}
