import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { taskWatchers, tasks } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { eq, and } from 'drizzle-orm';

async function resolveTask(taskId: string, orgId: string) {
  const [task] = await db.select({ id: tasks.id }).from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.orgId, orgId)));
  return task ?? null;
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const user = await requireUser();
  const { taskId } = await params;
  if (!await resolveTask(taskId, user.orgId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await db.insert(taskWatchers).values({ taskId, orgId: user.orgId, userId: user.id })
    .onConflictDoNothing();
  return NextResponse.json({ watching: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const user = await requireUser();
  const { taskId } = await params;
  await db.delete(taskWatchers)
    .where(and(eq(taskWatchers.taskId, taskId), eq(taskWatchers.userId, user.id)));
  return NextResponse.json({ watching: false });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const user = await requireUser();
  const { taskId } = await params;
  const [row] = await db.select({ id: taskWatchers.id }).from(taskWatchers)
    .where(and(eq(taskWatchers.taskId, taskId), eq(taskWatchers.userId, user.id)));
  return NextResponse.json({ watching: !!row });
}
