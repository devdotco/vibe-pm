import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { goals, goalProjectLinks, teams } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { validate, UpdateGoalSchema } from '@/lib/validate';
import { eq, and } from 'drizzle-orm';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ goalId: string }> }) {
  const user = await requireUser();
  const { goalId } = await params;
  const [goal] = await db.select().from(goals)
    .where(and(eq(goals.id, goalId), eq(goals.orgId, user.orgId)));
  if (!goal) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const links = await db.select().from(goalProjectLinks).where(eq(goalProjectLinks.goalId, goalId));
  return NextResponse.json({ goal, linkedProjects: links });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ goalId: string }> }) {
  const user = await requireUser();
  const { goalId } = await params;
  // `.set({...body})` used to write orgId/ownerId/id straight from the
  // request. ownerId isn't in the allow-list either — reassigning a goal's
  // owner isn't something this endpoint's callers do, so it's simplest to
  // leave it out rather than add a check nothing exercises.
  const parsed = validate(UpdateGoalSchema, await req.json().catch(() => null));
  if (!parsed.success) return parsed.response;
  const { teamId } = parsed.data;
  if (teamId) {
    const [team] = await db.select({ id: teams.id }).from(teams)
      .where(and(eq(teams.id, teamId), eq(teams.orgId, user.orgId))).limit(1);
    if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 400 });
  }
  const [goal] = await db.update(goals).set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(goals.id, goalId), eq(goals.orgId, user.orgId))).returning();
  if (!goal) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ goal });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ goalId: string }> }) {
  const user = await requireUser();
  const { goalId } = await params;
  await db.delete(goals).where(and(eq(goals.id, goalId), eq(goals.orgId, user.orgId)));
  return NextResponse.json({ success: true });
}
