import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tasks } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { logActivity } from '@/lib/activity';
import { pusherServer, projectChannel } from '@/lib/pusher/server';
import { needsRebalance, rebalancePositions } from '@/lib/ordering';
import { eq, and, isNull, asc } from 'drizzle-orm';

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
      await logActivity({
        taskId, projectId: existing.projectId, orgId: user.orgId, userId: user.id,
        action: 'moved', oldValue: existing.sectionId ?? '', newValue: sectionId,
      }, tx);
    }
    return [updated];
  });

  // Rebalance positions in destination section if needed
  try {
    const sectionTasks = await db
      .select({ id: tasks.id, position: tasks.position })
      .from(tasks)
      .where(and(
        eq(tasks.projectId, existing.projectId),
        sectionId ? eq(tasks.sectionId, sectionId) : isNull(tasks.sectionId),
        isNull(tasks.deletedAt),
      ))
      .orderBy(asc(tasks.position));

    if (needsRebalance(sectionTasks.map(t => t.position))) {
      const newPositions = rebalancePositions(sectionTasks.length);
      await Promise.all(sectionTasks.map((t, i) =>
        db.update(tasks).set({ position: newPositions[i]!, updatedAt: new Date() }).where(eq(tasks.id, t.id))
      ));
    }
  } catch {
    // rebalance errors are non-fatal
  }

  pusherServer.trigger(projectChannel(existing.projectId, user.orgId), 'task.moved', {
    taskId, fromSectionId: existing.sectionId, toSectionId: sectionId, position,
  }).catch(() => {});

  return NextResponse.json({ task });
}
