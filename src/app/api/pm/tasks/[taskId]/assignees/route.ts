import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { taskAssignees, tasks, users, projects } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { logActivity } from '@/lib/activity';
import { eq, and } from 'drizzle-orm';
import { sendTaskAssignedEmail } from '@/lib/email/notifications';
import { pusherServer, taskChannel } from '@/lib/pusher/server';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const user = await requireUser();
  const { taskId } = await params;
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(taskAssignees)
    .innerJoin(users, eq(taskAssignees.userId, users.id))
    .where(and(eq(taskAssignees.taskId, taskId), eq(taskAssignees.orgId, user.orgId), eq(users.orgId, user.orgId)));
  return NextResponse.json({ assignees: rows });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const user = await requireUser();
  const { taskId } = await params;
  const [task] = await db.select().from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.orgId, user.orgId)));
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { userId } = (await req.json().catch(() => ({}))) as { userId?: unknown };
  // The assignee must be a member of THIS organization. Unchecked, any user id
  // could be attached, and GET's join then returned that person's name and
  // email — another tenant's directory, one guessed id at a time.
  if (typeof userId !== 'string') return NextResponse.json({ error: 'userId required' }, { status: 400 });
  const [member] = await db.select({ id: users.id }).from(users)
    .where(and(eq(users.id, userId), eq(users.orgId, user.orgId))).limit(1);
  if (!member) return NextResponse.json({ error: 'User not found' }, { status: 400 });
  const [assignee] = await db.transaction(async (tx) => {
    const [a] = await tx.insert(taskAssignees).values({ taskId, orgId: user.orgId, userId, assignedBy: user.id }).returning();
    await logActivity({ taskId, projectId: task.projectId, orgId: user.orgId, userId: user.id, action: 'assigned', newValue: userId }, tx);
    return [a];
  });

  // Send email notification to the assignee (fire and forget)
  if (userId !== user.id) {
    db.select({ id: users.id, name: users.name, email: users.email })
      .from(users).where(eq(users.id, userId)).limit(1)
      .then(async ([assigneeUser]) => {
        if (!assigneeUser?.email) return;
        const [project] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, task.projectId)).limit(1);
        sendTaskAssignedEmail({
          taskId,
          taskTitle: task.title,
          projectName: project?.name ?? 'erp.io PM',
          taskUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.erp.io/pm'}/projects/${task.projectId}?task=${taskId}`,
          recipientEmail: assigneeUser.email,
          recipientName: assigneeUser.name,
          actorName: user.name,
        }).catch(() => {});
      }).catch(() => {});
  }

  pusherServer.trigger(taskChannel(taskId), 'task.updated', {}).catch(() => {});
  return NextResponse.json({ assignee }, { status: 201 });
}
