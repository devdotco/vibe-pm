import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projectMembers } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { eq, and } from 'drizzle-orm';

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ projectId: string; uid: string }> }) {
  const user = await requireUser();
  const { projectId, uid } = await params;
  await db.delete(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, uid), eq(projectMembers.orgId, user.orgId)));
  return NextResponse.json({ success: true });
}
