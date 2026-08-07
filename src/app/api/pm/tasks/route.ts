import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tasks, sections, projects, users } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { logActivity } from '@/lib/activity';
import { dispatchEvent } from '@/lib/webhooks/dispatcher';
import { fireProjectWebhooks } from '@/lib/webhooks';
import { pusherServer, projectChannel } from '@/lib/pusher/server';
import { positionBetween } from '@/lib/ordering';
import { eq, and, isNull, asc, desc } from 'drizzle-orm';
import { sendTaskAssignedEmail } from '@/lib/email/notifications';

export async function GET(req: NextRequest) {
  const user = await requireUser();
  const { searchParams } = req.nextUrl;
  const projectId = searchParams.get('projectId');
  const conditions = [eq(tasks.assigneeId, user.id), eq(tasks.orgId, user.orgId), isNull(tasks.deletedAt)];
  if (projectId) conditions.push(eq(tasks.projectId, projectId));
  const rows = await db.select().from(tasks).where(and(...conditions)).orderBy(asc(tasks.dueDate));
  return NextResponse.json({ tasks: rows });
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  const body = await req.json();
  const { projectId, sectionId, title, description, priority, assigneeId, dueDate, startDate, labels, parentTaskId } = body;
  if (!projectId || !title) return NextResponse.json({ error: 'projectId and title required' }, { status: 400 });

  // get last position in section
  const existing = await db.select({ position: tasks.position }).from(tasks)
    .where(and(eq(tasks.projectId, projectId), sectionId ? eq(tasks.sectionId, sectionId) : isNull(tasks.sectionId), isNull(tasks.deletedAt)))
    .orderBy(desc(tasks.position)).limit(1);
  const position = positionBetween(existing[0]?.position ?? null, null);

  const [task] = await db.transaction(async (tx) => {
    const [task] = await tx.insert(tasks).values({
      projectId, sectionId, orgId: user.orgId, title, description,
      priority: priority ?? 'none', assigneeId, dueDate, startDate,
      labels: labels ?? [], parentTaskId, position, createdBy: user.id,
    }).returning();
    await logActivity({ taskId: task.id, projectId, orgId: user.orgId, userId: user.id, action: 'created' }, tx);
    return [task];
  });

  // async: fire webhook + pusher
  dispatchEvent({ eventType: 'task.created', orgId: user.orgId, projectId, taskId: task.id, triggeredBy: user.id, data: { title } });
  pusherServer.trigger(projectChannel(projectId, user.orgId), 'task.created', { task }).catch(() => {});

  // fire cross-app webhook
  const [proj] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, projectId)).limit(1);
  if (proj) {
    fireProjectWebhooks(projectId, 'task.created', {
      taskId: task.id,
      taskTitle: task.title,
      projectName: proj.name,
      projectId,
      actorName: user.name,
      priority: task.priority,
    }).catch(() => {});
  }

  // email notification: task assigned on creation
  if (assigneeId && proj) {
    const [assignee] = await db.select({ email: users.email, name: users.name })
      .from(users).where(eq(users.id, assigneeId)).limit(1);
    if (assignee && assignee.email !== user.email) {
      sendTaskAssignedEmail({
        taskId: task.id,
        taskTitle: task.title,
        projectName: proj.name,
        recipientEmail: assignee.email,
        recipientName: assignee.name,
        actorName: user.name,
        commentText: undefined,
      }).catch(() => {});
    }
  }

  return NextResponse.json({ task }, { status: 201 });
}
