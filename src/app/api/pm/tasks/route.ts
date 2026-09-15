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
import { validate, CreateTaskSchema } from '@/lib/validate';
import { rateLimit } from '@/lib/rate-limit';
import { autoWatch } from '@/lib/watchers';

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
  if (!rateLimit(`tasks:${user.id}`, 60, 60_000)) {
    return NextResponse.json({ error: 'Too many requests. Slow down.' }, { status: 429 });
  }
  const body = await req.json();
  const v = validate(CreateTaskSchema, body);
  if (!v.success) return v.response;
  const { projectId, sectionId, title, description, priority, assigneeId, dueDate, dueTime, startDate, labels, parentTaskId, estimatedMinutes } = v.data;

  // The project, and every id hanging off it, must be in the caller's
  // organization. Without this a task could be created — carrying the caller's
  // org_id — inside another tenant's project, where project-scoped views show it.
  const [project] = await db.select({ id: projects.id }).from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.orgId, user.orgId))).limit(1);
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  if (sectionId) {
    const [s] = await db.select({ id: sections.id }).from(sections)
      .where(and(eq(sections.id, sectionId), eq(sections.projectId, projectId), eq(sections.orgId, user.orgId))).limit(1);
    if (!s) return NextResponse.json({ error: 'Section not found' }, { status: 400 });
  }
  if (assigneeId) {
    const [u] = await db.select({ id: users.id }).from(users)
      .where(and(eq(users.id, assigneeId), eq(users.orgId, user.orgId))).limit(1);
    if (!u) return NextResponse.json({ error: 'Assignee not found' }, { status: 400 });
  }
  if (parentTaskId) {
    const [pt] = await db.select({ id: tasks.id }).from(tasks)
      .where(and(eq(tasks.id, parentTaskId), eq(tasks.orgId, user.orgId), isNull(tasks.deletedAt))).limit(1);
    if (!pt) return NextResponse.json({ error: 'Parent task not found' }, { status: 400 });
  }

  // get first position in section so new tasks land at the top
  const existing = await db.select({ position: tasks.position }).from(tasks)
    .where(and(eq(tasks.projectId, projectId), sectionId ? eq(tasks.sectionId, sectionId) : isNull(tasks.sectionId), isNull(tasks.deletedAt)))
    .orderBy(asc(tasks.position)).limit(1);
  const position = positionBetween(null, existing[0]?.position ?? null);

  const [task] = await db.transaction(async (tx) => {
    const [task] = await tx.insert(tasks).values({
      projectId, sectionId, orgId: user.orgId, title, description,
      priority: priority ?? 'none', assigneeId, dueDate, dueTime, startDate,
      labels: labels ?? [], parentTaskId, estimatedMinutes, position, createdBy: user.id,
    }).returning();
    await logActivity({ taskId: task.id, projectId, orgId: user.orgId, userId: user.id, action: 'created' }, tx);
    // auto-watch: creator
    await autoWatch(task.id, user.orgId, user.id, tx);
    // auto-watch: assignee (if set)
    if (assigneeId && assigneeId !== user.id) await autoWatch(task.id, user.orgId, assigneeId, tx);
    return [task];
  });

  // async: fire webhook + pusher
  dispatchEvent({ eventType: 'task.created', orgId: user.orgId, projectId, taskId: task.id, triggeredBy: user.id, data: { title } });
  pusherServer.trigger(projectChannel(projectId, user.orgId), 'task.created', { task }).catch(() => {});

  // fire cross-app webhook
  const [proj] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, projectId)).limit(1);
  if (proj) {
    fireProjectWebhooks(user.orgId, projectId, 'task.created', {
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
