import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { teams, teamMembers } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { eq, and } from 'drizzle-orm';

export async function GET() {
  const user = await requireUser();
  // teamMembers.orgId matching the caller isn't enough — a membership row's
  // teamId could point at a team in a different org (see the ownership
  // check added to the members POST route). Join on teams.orgId too.
  const rows = await db
    .select({ team: teams })
    .from(teamMembers)
    .innerJoin(teams, and(eq(teamMembers.teamId, teams.id), eq(teams.orgId, user.orgId)))
    .where(and(eq(teamMembers.userId, user.id), eq(teamMembers.orgId, user.orgId)));
  return NextResponse.json({ teams: rows.map(r => r.team) });
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  const { name, description, icon } = await req.json();
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });
  const [team] = await db.insert(teams).values({
    orgId: user.orgId, name, description, icon, createdBy: user.id,
  }).returning();
  await db.insert(teamMembers).values({ teamId: team.id, orgId: user.orgId, userId: user.id, role: 'owner' });
  return NextResponse.json({ team }, { status: 201 });
}
