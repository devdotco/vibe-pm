import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tasks, taskActivity, users, sections } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { validate, BulkActionSchema } from '@/lib/validate';
import { rateLimit } from '@/lib/rate-limit';
import { eq, and, inArray, isNull } from 'drizzle-orm';

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!rateLimit(`bulk:${user.id}`, 20, 60_000)) {
    return NextResponse.json({ error: 'Too many requests. Slow down.' }, { status: 429 });
  }

  const body = await req.json();
  const v = validate(BulkActionSchema, body);
  if (!v.success) return v.response;
  const { taskIds, action, value } = v.data;

  // verify all taskIds belong to the user's org
  const owned = await db
    .select({ id: tasks.id, projectId: tasks.projectId, labels: tasks.labels })
    .from(tasks)
    .where(and(inArray(tasks.id, taskIds), eq(tasks.orgId, user.orgId), isNull(tasks.deletedAt)));

  if (owned.length !== taskIds.length) {
    return NextResponse.json({ error: 'One or more tasks not found' }, { status: 403 });
  }

  // `value` (the assignee or section id for 'assign'/'move_section') was
  // never checked against the org — it just got written straight onto every
  // task. Not a cross-tenant read on its own (nothing here is scoped by
  // assigneeId/sectionId), but a bad id silently corrupts the task instead
  // of failing the request.
  if (action === 'assign' && value) {
    const [u] = await db.select({ id: users.id }).from(users)
      .where(and(eq(users.id, value), eq(users.orgId, user.orgId))).limit(1);
    if (!u) return NextResponse.json({ error: 'Assignee not found' }, { status: 400 });
  }
  if (action === 'move_section' && value) {
    const [s] = await db.select({ id: sections.id }).from(sections)
      .where(and(eq(sections.id, value), eq(sections.orgId, user.orgId))).limit(1);
    if (!s) return NextResponse.json({ error: 'Section not found' }, { status: 400 });
  }

  const now = new Date();
  let updated = 0;
  const updatedTasks: typeof tasks.$inferSelect[] = [];

  await db.transaction(async (tx) => {
    for (const task of owned) {
      let patch: Partial<typeof tasks.$inferInsert> = {};
      let activityAction: string = action;
      let oldValue: string | undefined;
      let newValue: string | undefined;

      switch (action) {
        case 'complete':
          patch = { status: 'completed', completedAt: now, completedBy: user.id };
          newValue = 'completed';
          break;
        case 'assign':
          if (!value) continue;
          patch = { assigneeId: value };
          newValue = value;
          activityAction = 'assigned';
          break;
        case 'change_status':
          if (!value) continue;
          patch = { status: value };
          newValue = value;
          activityAction = 'status_changed';
          break;
        case 'change_priority':
          if (!value) continue;
          patch = { priority: value };
          newValue = value;
          activityAction = 'priority_changed';
          break;
        case 'move_section':
          patch = { sectionId: value ?? null };
          newValue = value;
          activityAction = 'moved';
          break;
        case 'add_label':
          if (!value) continue;
          if (task.labels.includes(value)) continue;
          patch = { labels: [...task.labels, value] };
          newValue = value;
          activityAction = 'label_added';
          break;
        case 'remove_label':
          if (!value) continue;
          patch = { labels: task.labels.filter((l) => l !== value) };
          oldValue = value;
          activityAction = 'label_removed';
          break;
        case 'delete':
          patch = { deletedAt: now };
          activityAction = 'deleted';
          break;
      }

      const [updatedTask] = await tx
        .update(tasks)
        .set({ ...patch, updatedAt: now })
        .where(eq(tasks.id, task.id))
        .returning();

      await tx.insert(taskActivity).values({
        taskId: task.id,
        projectId: task.projectId,
        orgId: user.orgId,
        userId: user.id,
        action: activityAction,
        oldValue,
        newValue,
      });

      if (updatedTask) updatedTasks.push(updatedTask);
      updated++;
    }
  });

  return NextResponse.json({ updated, tasks: updatedTasks });
}
