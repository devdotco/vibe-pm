import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { taskAssignees, tasks } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { logActivity } from '@/lib/activity';
import { pusherServer, taskChannel } from '@/lib/pusher/server';
import { eq, and } from 'drizzle-orm';

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ taskId: string; uid: string }> }) {
  const user = await requireUser();
  const { taskId, uid } = await params;
  const [task] = await db.select().from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.orgId, user.orgId)));
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await db.transaction(async (tx) => {
    await tx.delete(taskAssignees).where(and(eq(taskAssignees.taskId, taskId), eq(taskAssignees.userId, uid)));
    await logActivity({ taskId, projectId: task.projectId, orgId: user.orgId, userId: user.id, action: 'unassigned', oldValue: uid }, tx);
  });
  pusherServer.trigger(taskChannel(taskId), 'task.updated', {}).catch(() => {});
  return NextResponse.json({ success: true });
}
