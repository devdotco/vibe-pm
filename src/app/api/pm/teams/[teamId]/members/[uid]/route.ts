import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { teamMembers } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { eq, and } from 'drizzle-orm';

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ teamId: string; uid: string }> }) {
  const user = await requireUser();
  const { teamId, uid } = await params;
  await db.delete(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, uid), eq(teamMembers.orgId, user.orgId)));
  return NextResponse.json({ success: true });
}
