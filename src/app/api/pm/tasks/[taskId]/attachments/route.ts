import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { taskAttachments, tasks } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { logActivity } from '@/lib/activity';
import { eq, and } from 'drizzle-orm';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const user = await requireUser();
  const { taskId } = await params;
  const attachments = await db.select().from(taskAttachments)
    .where(and(eq(taskAttachments.taskId, taskId), eq(taskAttachments.orgId, user.orgId)));
  return NextResponse.json({ attachments });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const user = await requireUser();
  const { taskId } = await params;
  const [task] = await db.select().from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.orgId, user.orgId)));
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { url, filename, fileType, fileSize } = await req.json();
  const [attachment] = await db.transaction(async (tx) => {
    const [a] = await tx.insert(taskAttachments).values({ taskId, orgId: user.orgId, userId: user.id, url, filename, fileType, fileSize }).returning();
    await logActivity({ taskId, projectId: task.projectId, orgId: user.orgId, userId: user.id, action: 'attachment_added', newValue: filename }, tx);
    return [a];
  });
  return NextResponse.json({ attachment }, { status: 201 });
}
