import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tasks, projects, automations, taskAssignees, users, sections } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { logActivity } from '@/lib/activity';
import { fireProjectWebhooks } from '@/lib/webhooks';
import { pusherServer, projectChannel } from '@/lib/pusher/server';
import { eq, and, isNull } from 'drizzle-orm';
import { sendTaskAssignedEmail } from '@/lib/email/notifications';

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

  // When status changes, auto-move to the matching section on the board
  const STATUS_TO_SECTION: Record<string, string> = {
    not_started: 'To Do',
    in_progress: 'In Progress',
    blocked: 'Blocked',
    completed: 'Done',
  };
  if (body.status && body.status !== existing.status && STATUS_TO_SECTION[body.status] && !body.sectionId) {
    const projectSections = await db.select().from(sections)
      .where(and(eq(sections.projectId, existing.projectId), eq(sections.orgId, user.orgId), eq(sections.isArchived, false)));
    const match = projectSections.find(s =>
      s.name.toLowerCase() === STATUS_TO_SECTION[body.status]!.toLowerCase()
    );
    if (match) body.sectionId = match.id;
  }

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

  // email notification: assignee changed
  if (body.assigneeId !== undefined && body.assigneeId !== existing.assigneeId && body.assigneeId) {
    (async () => {
      const [proj] = await db.select({ name: projects.name }).from(projects)
        .where(eq(projects.id, existing.projectId)).limit(1);
      const [assignee] = await db.select({ email: users.email, name: users.name })
        .from(users).where(eq(users.id, body.assigneeId)).limit(1);
      if (proj && assignee && assignee.email !== user.email) {
        sendTaskAssignedEmail({
          taskId,
          taskTitle: task.title,
          projectName: proj.name,
          recipientEmail: assignee.email,
          recipientName: assignee.name,
          actorName: user.name,
        }).catch(() => {});
      }
    })().catch(() => {});
  }

  // fire cross-app webhook
  const [proj] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, existing.projectId)).limit(1);
  if (proj) {
    const webhookEvent = task.status === 'completed' ? 'task.completed' : 'task.updated';
    fireProjectWebhooks(existing.projectId, webhookEvent, {
      taskId: task.id,
      taskTitle: task.title,
      projectName: proj.name,
      projectId: existing.projectId,
      actorName: user.name,
      status: task.status,
    }).catch(() => {});
  }

  // ── Automation engine ──────────────────────────────────────────────────────
  try {
    const activeAutomations = await db.select().from(automations)
      .where(and(eq(automations.projectId, existing.projectId), eq(automations.isEnabled, true)));

    for (const auto of activeAutomations) {
      let triggered = false;

      if (auto.triggerType === 'task.completed' && task.status === 'completed' && existing.status !== 'completed') {
        triggered = true;
      } else if (auto.triggerType === 'status.changed') {
        const cond = auto.triggerConditions as { value?: string } | null;
        if (body.status !== undefined && body.status !== existing.status) {
          triggered = cond?.value === undefined || cond.value === task.status;
        }
      } else if (auto.triggerType === 'task.assigned' && body.assigneeId !== undefined && body.assigneeId !== existing.assigneeId) {
        triggered = true;
      }

      if (!triggered) continue;

      const params = auto.actionParams as Record<string, string> | null ?? {};

      if (auto.actionType === 'change_status' && params.status) {
        await db.update(tasks).set({ status: params.status, updatedAt: new Date() }).where(eq(tasks.id, taskId));
      } else if (auto.actionType === 'assign_user' && params.userId) {
        await db.insert(taskAssignees)
          .values({ taskId, userId: params.userId, orgId: user.orgId })
          .onConflictDoNothing();
      } else if (auto.actionType === 'add_label' && params.label) {
        const current = (task.labels ?? []) as string[];
        if (!current.includes(params.label)) {
          await db.update(tasks).set({ labels: [...current, params.label], updatedAt: new Date() }).where(eq(tasks.id, taskId));
        }
      } else if (auto.actionType === 'move_section' && params.sectionId) {
        await db.update(tasks).set({ sectionId: params.sectionId, updatedAt: new Date() }).where(eq(tasks.id, taskId));
      }

      // bump run count
      await db.update(automations)
        .set({ runCount: (auto.runCount ?? 0) + 1, lastRunAt: new Date() })
        .where(eq(automations.id, auto.id));
    }
  } catch {
    // automation errors must never fail the response
  }

  return NextResponse.json({ task });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const user = await requireUser();
  const { taskId } = await params;
  await db.update(tasks).set({ deletedAt: new Date() })
    .where(and(eq(tasks.id, taskId), eq(tasks.orgId, user.orgId)));
  return NextResponse.json({ success: true });
}
