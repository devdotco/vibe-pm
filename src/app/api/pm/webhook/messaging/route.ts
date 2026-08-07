import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tasks, sections } from '@/lib/db/schema';
import { requireServiceAuth } from '@/lib/auth/service';
import { logActivity } from '@/lib/activity';
import { dispatchEvent } from '@/lib/webhooks/dispatcher';
import { positionBetween } from '@/lib/ordering';
import { eq, and, isNull, asc, desc } from 'drizzle-orm';

export async function POST(req: NextRequest) {
  if (!requireServiceAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { event, orgId, data } = await req.json();

  if (event === 'claude.create_task') {
    const { title, projectId, assigneeId, dueDate, sourceMessageId, createdByUserId } = data;
    const [firstSection] = await db.select().from(sections)
      .where(and(eq(sections.projectId, projectId), eq(sections.isArchived, false)))
      .orderBy(asc(sections.position)).limit(1);
    const existing = await db.select({ position: tasks.position }).from(tasks)
      .where(and(eq(tasks.projectId, projectId), isNull(tasks.deletedAt)))
      .orderBy(desc(tasks.position)).limit(1);
    const position = positionBetween(existing[0]?.position ?? null, null);
    const [task] = await db.transaction(async (tx) => {
      const [t] = await tx.insert(tasks).values({
        projectId, sectionId: firstSection?.id, orgId, title,
        assigneeId, dueDate, sourceMessageId, position, createdBy: createdByUserId ?? orgId,
      }).returning();
      await logActivity({ taskId: t.id, projectId, orgId, userId: createdByUserId ?? orgId, action: 'created' }, tx);
      return [t];
    });
    dispatchEvent({ eventType: 'task.created', orgId, projectId, taskId: task.id, data: { title } });
    return NextResponse.json({ task });
  }

  if (event === 'claude.complete_task') {
    const { taskId, completedByUserId } = data;
    const [existing] = await db.select().from(tasks).where(eq(tasks.id, taskId));
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const [task] = await db.transaction(async (tx) => {
      const [t] = await tx.update(tasks).set({ status: 'completed', completedAt: new Date(), completedBy: completedByUserId }).where(eq(tasks.id, taskId)).returning();
      await logActivity({ taskId, projectId: existing.projectId, orgId: existing.orgId, userId: completedByUserId, action: 'completed', oldValue: existing.status, newValue: 'completed' }, tx);
      return [t];
    });
    dispatchEvent({ eventType: 'task.completed', orgId: existing.orgId, projectId: existing.projectId, taskId, data: { title: existing.title } });
    return NextResponse.json({ task });
  }

  if (event === 'claude.list_tasks') {
    const { orgId: oid, projectId, status, assigneeId } = data;
    const conditions = [eq(tasks.orgId, oid ?? orgId), isNull(tasks.deletedAt)];
    if (projectId) conditions.push(eq(tasks.projectId, projectId));
    if (status) conditions.push(eq(tasks.status, status));
    if (assigneeId) conditions.push(eq(tasks.assigneeId, assigneeId));
    const rows = await db.select().from(tasks).where(and(...conditions)).limit(50);
    return NextResponse.json({ tasks: rows });
  }

  return NextResponse.json({ error: 'Unknown event' }, { status: 400 });
}
