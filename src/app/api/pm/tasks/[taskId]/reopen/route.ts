import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tasks } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { logActivity } from '@/lib/activity';
import { eq, and, isNull } from 'drizzle-orm';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const user = await requireUser();
  const { taskId } = await params;
  const [existing] = await db.select().from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.orgId, user.orgId), isNull(tasks.deletedAt)));
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const [task] = await db.transaction(async (tx) => {
    const [updated] = await tx.update(tasks).set({
      status: 'not_started', completedAt: null, completedBy: null, updatedAt: new Date(),
    }).where(eq(tasks.id, taskId)).returning();
    await logActivity({ taskId, projectId: existing.projectId, orgId: user.orgId, userId: user.id, action: 'reopened', oldValue: 'completed', newValue: 'not_started' }, tx);
    return [updated];
  });
  return NextResponse.json({ task });
}
