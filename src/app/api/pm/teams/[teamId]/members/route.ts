import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { teamMembers } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { eq, and } from 'drizzle-orm';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ teamId: string }> }) {
  const user = await requireUser();
  const { teamId } = await params;
  const members = await db.select().from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.orgId, user.orgId)));
  return NextResponse.json({ members });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ teamId: string }> }) {
  const user = await requireUser();
  const { teamId } = await params;
  const { userId, role } = await req.json();
  const [member] = await db.insert(teamMembers)
    .values({ teamId, orgId: user.orgId, userId, role: role ?? 'member' })
    .returning();
  return NextResponse.json({ member }, { status: 201 });
}
