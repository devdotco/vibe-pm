import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { taskDependencies, tasks } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { eq, and, isNull } from 'drizzle-orm';

export async function POST(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const user = await requireUser();
  const { taskId } = await params;
  const { dependsOnTaskId, type } = await req.json();
  // Neither id was checked against the org before — a dependency row could
  // be created against a foreign task (either end) while carrying this org.
  const [task] = await db.select({ id: tasks.id }).from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.orgId, user.orgId), isNull(tasks.deletedAt))).limit(1);
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  if (!dependsOnTaskId) return NextResponse.json({ error: 'dependsOnTaskId required' }, { status: 400 });
  const [dependsOn] = await db.select({ id: tasks.id }).from(tasks)
    .where(and(eq(tasks.id, dependsOnTaskId), eq(tasks.orgId, user.orgId), isNull(tasks.deletedAt))).limit(1);
  if (!dependsOn) return NextResponse.json({ error: 'dependsOnTaskId not found' }, { status: 400 });
  const [dep] = await db.insert(taskDependencies).values({
    taskId, dependsOnTaskId, orgId: user.orgId, type: type ?? 'finish_to_start',
  }).returning();
  return NextResponse.json({ dependency: dep }, { status: 201 });
}
