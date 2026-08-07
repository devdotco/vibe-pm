import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tasks, sections } from '@/lib/db/schema';
import { requireServiceAuth } from '@/lib/auth/service';
import { logActivity } from '@/lib/activity';
import { dispatchEvent } from '@/lib/webhooks/dispatcher';
import { positionBetween } from '@/lib/ordering';
import { eq, and, isNull, desc, asc } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  if (!requireServiceAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = req.nextUrl;
  const orgId = searchParams.get('orgId');
  const projectId = searchParams.get('projectId');
  const status = searchParams.get('status');
  const assigneeId = searchParams.get('assigneeId');
  if (!orgId) return NextResponse.json({ error: 'orgId required' }, { status: 400 });
  const conditions = [eq(tasks.orgId, orgId), isNull(tasks.deletedAt)];
  if (projectId) conditions.push(eq(tasks.projectId, projectId));
  if (status) conditions.push(eq(tasks.status, status));
  if (assigneeId) conditions.push(eq(tasks.assigneeId, assigneeId));
  const rows = await db.select().from(tasks).where(and(...conditions)).limit(100);
  return NextResponse.json({ tasks: rows });
}

export async function POST(req: NextRequest) {
  if (!requireServiceAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const { orgId, projectId, title, description, assigneeId, dueDate, priority, sourceMessageId, sourceChannelId, createdByUserId } = body;
  if (!orgId || !projectId || !title || !createdByUserId) {
    return NextResponse.json({ error: 'orgId, projectId, title, createdByUserId required' }, { status: 400 });
  }

  // find first non-archived section
  const [firstSection] = await db.select().from(sections)
    .where(and(eq(sections.projectId, projectId), eq(sections.isArchived, false)))
    .orderBy(asc(sections.position)).limit(1);

  const existing = await db.select({ position: tasks.position }).from(tasks)
    .where(and(eq(tasks.projectId, projectId), firstSection ? eq(tasks.sectionId, firstSection.id) : isNull(tasks.sectionId), isNull(tasks.deletedAt)))
    .orderBy(desc(tasks.position)).limit(1);
  const position = positionBetween(existing[0]?.position ?? null, null);

  const [task] = await db.transaction(async (tx) => {
    const [t] = await tx.insert(tasks).values({
      projectId, sectionId: firstSection?.id, orgId, title, description,
      priority: priority ?? 'none', assigneeId, dueDate, position,
      sourceMessageId, sourceChannelId, createdBy: createdByUserId,
    }).returning();
    await logActivity({ taskId: t.id, projectId, orgId, userId: createdByUserId, action: 'created' }, tx);
    return [t];
  });

  dispatchEvent({ eventType: 'task.created', orgId, projectId, taskId: task.id, triggeredBy: createdByUserId, data: { title } });
  return NextResponse.json({ success: true, task }, { status: 201 });
}
