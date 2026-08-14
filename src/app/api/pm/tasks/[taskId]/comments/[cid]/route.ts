import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { taskComments } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { eq, and } from 'drizzle-orm';
import { pusherServer, taskChannel } from '@/lib/pusher/server';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ taskId: string; cid: string }> }) {
  const user = await requireUser();
  const { taskId, cid } = await params;
  const { content } = await req.json();
  const [comment] = await db.update(taskComments).set({ content, isEdited: true, editedAt: new Date() })
    .where(and(eq(taskComments.id, cid), eq(taskComments.userId, user.id), eq(taskComments.orgId, user.orgId)))
    .returning();
  pusherServer.trigger(taskChannel(taskId), 'task.comment', { commentId: cid }).catch((err) => console.error('[Pusher] PATCH comment trigger failed:', err));
  return NextResponse.json({ comment });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ taskId: string; cid: string }> }) {
  const user = await requireUser();
  const { taskId, cid } = await params;
  await db.update(taskComments).set({ deletedAt: new Date() })
    .where(and(eq(taskComments.id, cid), eq(taskComments.userId, user.id), eq(taskComments.orgId, user.orgId)));
  pusherServer.trigger(taskChannel(taskId), 'task.comment', { commentId: cid }).catch((err) => console.error('[Pusher] DELETE comment trigger failed:', err));
  return NextResponse.json({ success: true });
}
