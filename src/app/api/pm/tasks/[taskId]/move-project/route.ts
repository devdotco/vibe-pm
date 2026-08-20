import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tasks, projects, projectMembers, sections } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { logActivity } from '@/lib/activity';
import { pusherServer, projectChannel } from '@/lib/pusher/server';
import { eq, and, isNull, asc } from 'drizzle-orm';

export async function POST(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const user = await requireUser();
  const { taskId } = await params;
  const { projectId: targetProjectId, sectionId: targetSectionId } = await req.json();

  if (!targetProjectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

  const [existing] = await db.select().from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.orgId, user.orgId), isNull(tasks.deletedAt)));
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (existing.projectId === targetProjectId) {
    return NextResponse.json({ error: 'Task is already in this project' }, { status: 400 });
  }

  const [membership] = await db.select({ id: projectMembers.userId }).from(projectMembers)
    .where(and(
      eq(projectMembers.projectId, targetProjectId),
      eq(projectMembers.userId, user.id),
      eq(projectMembers.orgId, user.orgId),
    ));
  if (!membership) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const [targetProject] = await db.select({ name: projects.name }).from(projects)
    .where(eq(projects.id, targetProjectId));
  if (!targetProject) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  // Use provided sectionId or fall back to the first section of the target project
  let resolvedSectionId: string | null = targetSectionId ?? null;
  if (!resolvedSectionId) {
    const [firstSection] = await db.select({ id: sections.id }).from(sections)
      .where(and(
        eq(sections.projectId, targetProjectId),
        eq(sections.orgId, user.orgId),
        eq(sections.isArchived, false),
      ))
      .orderBy(asc(sections.position))
      .limit(1);
    resolvedSectionId = firstSection?.id ?? null;
  }

  const [task] = await db.transaction(async (tx) => {
    const [updated] = await tx.update(tasks)
      .set({ projectId: targetProjectId, sectionId: resolvedSectionId, updatedAt: new Date() })
      .where(and(eq(tasks.id, taskId), eq(tasks.orgId, user.orgId)))
      .returning();
    await logActivity({
      taskId,
      projectId: existing.projectId,
      orgId: user.orgId,
      userId: user.id,
      action: 'moved',
      newValue: targetProject.name,
    }, tx);
    return [updated];
  });

  // Notify old project (task removed) and new project (task arrived)
  pusherServer.trigger(projectChannel(existing.projectId, user.orgId), 'task.deleted', { taskId }).catch(() => {});
  pusherServer.trigger(projectChannel(targetProjectId, user.orgId), 'task.created', { task }).catch(() => {});

  return NextResponse.json({ task });
}
