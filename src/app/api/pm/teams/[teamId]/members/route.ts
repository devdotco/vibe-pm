import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { teamMembers, teams, users } from '@/lib/db/schema';
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

  /*
   * teamId came from the URL and userId from the body with neither checked
   * against this org — a caller could self-grant membership on any team id,
   * or add any user id as a "member," while the row itself carried their own
   * orgId. That row then fed the unscoped teams/route.ts join (fixed
   * alongside this), leaking the foreign team's name into the caller's own
   * team list.
   */
  const [team] = await db.select({ id: teams.id }).from(teams)
    .where(and(eq(teams.id, teamId), eq(teams.orgId, user.orgId))).limit(1);
  if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 });

  const [targetUser] = await db.select({ id: users.id }).from(users)
    .where(and(eq(users.id, userId), eq(users.orgId, user.orgId))).limit(1);
  if (!targetUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const [member] = await db.insert(teamMembers)
    .values({ teamId, orgId: user.orgId, userId, role: role ?? 'member' })
    .returning();
  return NextResponse.json({ member }, { status: 201 });
}
