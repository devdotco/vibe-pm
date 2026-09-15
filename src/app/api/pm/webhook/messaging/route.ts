import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tasks, sections, projects, users } from '@/lib/db/schema';
import { requireServiceAuth } from '@/lib/auth/service';
import { logActivity } from '@/lib/activity';
import { autoAttachForms } from '@/lib/forms/service';
import { dispatchEvent } from '@/lib/webhooks/dispatcher';
import { positionBetween } from '@/lib/ordering';
import { eq, and, isNull, asc, desc } from 'drizzle-orm';

export async function POST(req: NextRequest) {
  if (!requireServiceAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { event, orgId, data } = await req.json();

  if (event === 'claude.create_task') {
    const { title, projectId, assigneeId, dueDate, sourceMessageId, createdByUserId } = data;
    // orgId and projectId both came from the caller with nothing checking
    // they agreed — a mismatch would have inserted the task under orgId
    // while it actually lives in a different org's project.
    const [project] = await db.select({ id: projects.id }).from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.orgId, orgId))).limit(1);
    if (!project) return NextResponse.json({ error: 'projectId does not belong to orgId' }, { status: 400 });
    if (assigneeId) {
      const [u] = await db.select({ id: users.id }).from(users)
        .where(and(eq(users.id, assigneeId), eq(users.orgId, orgId))).limit(1);
      if (!u) return NextResponse.json({ error: 'assigneeId does not belong to orgId' }, { status: 400 });
    }
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
    await autoAttachForms(task);
    dispatchEvent({ eventType: 'task.created', orgId, projectId, taskId: task.id, data: { title } });
    return NextResponse.json({ task });
  }

  if (event === 'claude.complete_task') {
    const { taskId, completedByUserId } = data;
    const [existing] = await db.select().from(tasks).where(eq(tasks.id, taskId));
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    // The task's own org (not the body's orgId, which this event doesn't
    // even carry) is the source of truth; completedByUserId still needs to
    // resolve inside it.
    if (completedByUserId) {
      const [u] = await db.select({ id: users.id }).from(users)
        .where(and(eq(users.id, completedByUserId), eq(users.orgId, existing.orgId))).limit(1);
      if (!u) return NextResponse.json({ error: 'completedByUserId does not belong to this task\'s org' }, { status: 400 });
    }
    const [task] = await db.transaction(async (tx) => {
      const [t] = await tx.update(tasks).set({ status: 'completed', completedAt: new Date(), completedBy: completedByUserId }).where(eq(tasks.id, taskId)).returning();
      await logActivity({ taskId, projectId: existing.projectId, orgId: existing.orgId, userId: completedByUserId, action: 'completed', oldValue: existing.status, newValue: 'completed' }, tx);
      return [t];
    });
    dispatchEvent({ eventType: 'task.completed', orgId: existing.orgId, projectId: existing.projectId, taskId, data: { title: existing.title } });
    return NextResponse.json({ task });
  }

  if (event === 'claude.list_tasks') {
    // One canonical org id — the top-level `orgId` — not two possible
    // sources for the same fact. `data.orgId ?? orgId` meant a caller could
    // put one org in the envelope and a different one in `data` and get
    // whichever the `??` picked, which is exactly the kind of ambiguity that
    // makes "which org is this request actually for" the wrong question to
    // let the request answer twice.
    if (!orgId) return NextResponse.json({ error: 'orgId required' }, { status: 400 });
    const { projectId, status, assigneeId } = data;
    const conditions = [eq(tasks.orgId, orgId), isNull(tasks.deletedAt)];
    if (projectId) conditions.push(eq(tasks.projectId, projectId));
    if (status) conditions.push(eq(tasks.status, status));
    if (assigneeId) conditions.push(eq(tasks.assigneeId, assigneeId));
    const rows = await db.select().from(tasks).where(and(...conditions)).limit(50);
    return NextResponse.json({ tasks: rows });
  }

  return NextResponse.json({ error: 'Unknown event' }, { status: 400 });
}
