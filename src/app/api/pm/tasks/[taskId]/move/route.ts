import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tasks } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { logActivity } from '@/lib/activity';
import { pusherServer, projectChannel } from '@/lib/pusher/server';
import { eq, and, isNull } from 'drizzle-orm';

export async function POST(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const user = await requireUser();
  const { taskId } = await params;
  const { sectionId, position } = await req.json();
  const [existing] = await db.select().from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.orgId, user.orgId), isNull(tasks.deletedAt)));
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const [task] = await db.transaction(async (tx) => {
    const [updated] = await tx.update(tasks).set({ sectionId, position, updatedAt: new Date() })
      .where(eq(tasks.id, taskId)).returning();
    if (sectionId !== existing.sectionId) {
      await logActivity({ taskId, projectId: existing.projectId, orgId: user.orgId, userId: user.id, action: 'moved', oldValue: existing.sectionId ?? '', newValue: sectionId }, tx);
    }
    return [updated];
  });
  pusherServer.trigger(projectChannel(existing.projectId, user.orgId), 'task.moved', {
    taskId, fromSectionId: existing.sectionId, toSectionId: sectionId, position,
  }).catch(() => {});
  return NextResponse.json({ task });
}
