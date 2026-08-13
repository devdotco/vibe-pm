import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tasks, sections } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { logActivity } from '@/lib/activity';
import { dispatchEvent } from '@/lib/webhooks/dispatcher';
import { pusherServer, projectChannel, taskChannel } from '@/lib/pusher/server';
import { eq, and, isNull } from 'drizzle-orm';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const user = await requireUser();
  const { taskId } = await params;
  const [existing] = await db.select().from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.orgId, user.orgId), isNull(tasks.deletedAt)));
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Auto-move to "Done" section if one exists
  const projectSections = await db.select().from(sections)
    .where(and(eq(sections.projectId, existing.projectId), eq(sections.orgId, user.orgId), eq(sections.isArchived, false)));
  const doneSection = projectSections.find(s => s.name.toLowerCase() === 'done');

  const [task] = await db.transaction(async (tx) => {
    const [updated] = await tx.update(tasks).set({
      status: 'completed',
      completedAt: new Date(),
      completedBy: user.id,
      updatedAt: new Date(),
      ...(doneSection ? { sectionId: doneSection.id } : {}),
    }).where(eq(tasks.id, taskId)).returning();
    await logActivity({
      taskId, projectId: existing.projectId, orgId: user.orgId, userId: user.id,
      action: 'completed', oldValue: existing.status, newValue: 'completed',
    }, tx);
    return [updated];
  });

  dispatchEvent({ eventType: 'task.completed', orgId: user.orgId, projectId: existing.projectId, taskId, triggeredBy: user.id, data: { title: existing.title } });
  pusherServer.trigger(projectChannel(existing.projectId, user.orgId), 'task.updated', { task }).catch(() => {});
  pusherServer.trigger(taskChannel(taskId), 'task.updated', { task }).catch(() => {});
  return NextResponse.json({ task });
}
