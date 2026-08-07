import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tasks } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { logActivity } from '@/lib/activity';
import { pusherServer, projectChannel } from '@/lib/pusher/server';
import { eq, and, isNull } from 'drizzle-orm';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const user = await requireUser();
  const { taskId } = await params;
  const [task] = await db.select().from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.orgId, user.orgId), isNull(tasks.deletedAt)));
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ task });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const user = await requireUser();
  const { taskId } = await params;
  const body = await req.json();
  const [existing] = await db.select().from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.orgId, user.orgId), isNull(tasks.deletedAt)));
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [task] = await db.transaction(async (tx) => {
    const [updated] = await tx.update(tasks).set({ ...body, updatedAt: new Date() })
      .where(and(eq(tasks.id, taskId), eq(tasks.orgId, user.orgId))).returning();

    // log field changes
    const trackFields: Array<[keyof typeof body, string]> = [
      ['status', 'status_changed'], ['priority', 'priority_changed'],
      ['dueDate', 'due_date_changed'], ['title', 'title_changed'],
      ['assigneeId', 'assigned'],
    ];
    for (const [field, action] of trackFields) {
      if (body[field] !== undefined && body[field] !== existing[field as keyof typeof existing]) {
        await logActivity({
          taskId, projectId: existing.projectId, orgId: user.orgId, userId: user.id,
          action, oldValue: String(existing[field as keyof typeof existing] ?? ''),
          newValue: String(body[field]),
        }, tx);
      }
    }
    return [updated];
  });

  pusherServer.trigger(projectChannel(existing.projectId, user.orgId), 'task.updated', { task }).catch(() => {});
  return NextResponse.json({ task });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const user = await requireUser();
  const { taskId } = await params;
  await db.update(tasks).set({ deletedAt: new Date() })
    .where(and(eq(tasks.id, taskId), eq(tasks.orgId, user.orgId)));
  return NextResponse.json({ success: true });
}
