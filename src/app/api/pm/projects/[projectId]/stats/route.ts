import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tasks } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { eq, and, isNull, count, sql } from 'drizzle-orm';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await requireUser();
  const { projectId } = await params;
  const cond = and(eq(tasks.projectId, projectId), eq(tasks.orgId, user.orgId), isNull(tasks.deletedAt));
  const [{ total }] = await db.select({ total: count() }).from(tasks).where(cond);
  const [{ completed }] = await db.select({ completed: count() }).from(tasks)
    .where(and(cond, eq(tasks.status, 'completed')));
  const today = new Date().toISOString().split('T')[0];
  const [{ overdue }] = await db.select({ overdue: count() }).from(tasks)
    .where(and(cond, sql`${tasks.dueDate} < ${today}`, sql`${tasks.status} NOT IN ('completed','blocked')`));
  return NextResponse.json({
    total: Number(total),
    completed: Number(completed),
    overdue: Number(overdue),
    completionRate: total > 0 ? Math.round((Number(completed) / Number(total)) * 100) : 0,
  });
}
