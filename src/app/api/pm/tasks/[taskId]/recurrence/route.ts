import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { taskRecurrence, tasks } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { validate } from '@/lib/validate';

const RecurrenceSchema = z.object({
  frequency: z.enum(['daily', 'weekly', 'biweekly', 'monthly', 'quarterly']),
  interval: z.number().int().min(1).max(52).default(1),
  daysOfWeek: z.array(z.number().int().min(1).max(7)).optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  maxOccurrences: z.number().int().min(1).max(1000).optional(),
  nextDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const user = await requireUser();
  const { taskId } = await params;
  const [row] = await db.select().from(taskRecurrence)
    .where(and(eq(taskRecurrence.taskId, taskId), eq(taskRecurrence.orgId, user.orgId)));
  return NextResponse.json({ recurrence: row ?? null });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const user = await requireUser();
  const { taskId } = await params;

  const [task] = await db.select({ id: tasks.id }).from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.orgId, user.orgId)));
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const v = validate(RecurrenceSchema, await req.json());
  if (!v.success) return v.response;
  const { frequency, interval, daysOfWeek, dayOfMonth, endDate, maxOccurrences, nextDueDate } = v.data;

  const [row] = await db.insert(taskRecurrence).values({
    taskId, orgId: user.orgId, frequency, interval, daysOfWeek, dayOfMonth,
    endDate, maxOccurrences, nextDueDate,
  }).onConflictDoUpdate({
    target: taskRecurrence.taskId,
    set: { frequency, interval, daysOfWeek, dayOfMonth, endDate, maxOccurrences, nextDueDate },
  }).returning();

  return NextResponse.json({ recurrence: row }, { status: 201 });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const user = await requireUser();
  const { taskId } = await params;
  await db.delete(taskRecurrence)
    .where(and(eq(taskRecurrence.taskId, taskId), eq(taskRecurrence.orgId, user.orgId)));
  return NextResponse.json({ deleted: true });
}
