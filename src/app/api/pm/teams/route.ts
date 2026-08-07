import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { teams, teamMembers } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { eq, and } from 'drizzle-orm';

export async function GET() {
  const user = await requireUser();
  const rows = await db
    .select({ team: teams })
    .from(teamMembers)
    .innerJoin(teams, eq(teamMembers.teamId, teams.id))
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
