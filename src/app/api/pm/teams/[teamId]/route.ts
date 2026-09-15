import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { teams, teamMembers } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { validate, UpdateTeamSchema } from '@/lib/validate';
import { eq, and } from 'drizzle-orm';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ teamId: string }> }) {
  const user = await requireUser();
  const { teamId } = await params;
  const [team] = await db.select().from(teams)
    .where(and(eq(teams.id, teamId), eq(teams.orgId, user.orgId)));
  if (!team) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ team });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ teamId: string }> }) {
  const user = await requireUser();
  const { teamId } = await params;
  const parsed = validate(UpdateTeamSchema, await req.json().catch(() => null));
  if (!parsed.success) return parsed.response;
  const [team] = await db.update(teams)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(teams.id, teamId), eq(teams.orgId, user.orgId)))
    .returning();
  if (!team) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ team });
}
