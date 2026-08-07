import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { taskAttachments } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { eq, and } from 'drizzle-orm';

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ taskId: string; aid: string }> }) {
  const user = await requireUser();
  const { aid } = await params;
  await db.delete(taskAttachments)
    .where(and(eq(taskAttachments.id, aid), eq(taskAttachments.orgId, user.orgId)));
  return NextResponse.json({ success: true });
}
