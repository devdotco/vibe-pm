import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { taskAttachments } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { storage } from '@/lib/storage';
import { eq, and } from 'drizzle-orm';

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ taskId: string; aid: string }> }) {
  const user = await requireUser();
  const { taskId, aid } = await params;
  const [deleted] = await db.delete(taskAttachments)
    .where(and(eq(taskAttachments.id, aid), eq(taskAttachments.taskId, taskId), eq(taskAttachments.orgId, user.orgId)))
    .returning();
  // The row is the source of truth; an orphaned object is harmless, a row
  // pointing at a deleted object is not. So delete the row first, best-effort after.
  if (deleted?.storageKey) {
    try { await storage().delete(deleted.storageKey); } catch (err) {
      console.warn('[attachments] object delete failed:', (err as Error).message);
    }
  }
  return NextResponse.json({ success: true });
}
