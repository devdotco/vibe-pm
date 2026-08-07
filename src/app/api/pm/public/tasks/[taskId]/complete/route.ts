import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tasks } from '@/lib/db/schema';
import { requireServiceAuth } from '@/lib/auth/service';
import { logActivity } from '@/lib/activity';
import { dispatchEvent } from '@/lib/webhooks/dispatcher';
import { eq, isNull } from 'drizzle-orm';

export async function POST(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  if (!requireServiceAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { taskId } = await params;
  const { completedByUserId } = await req.json();
  const [existing] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const [task] = await db.transaction(async (tx) => {
    const [t] = await tx.update(tasks).set({ status: 'completed', completedAt: new Date(), completedBy: completedByUserId }).where(eq(tasks.id, taskId)).returning();
    await logActivity({ taskId, projectId: existing.projectId, orgId: existing.orgId, userId: completedByUserId, action: 'completed', oldValue: existing.status, newValue: 'completed' }, tx);
    return [t];
  });
  dispatchEvent({ eventType: 'task.completed', orgId: existing.orgId, projectId: existing.projectId, taskId, triggeredBy: completedByUserId, data: { title: existing.title } });
  return NextResponse.json({ success: true, task });
}
