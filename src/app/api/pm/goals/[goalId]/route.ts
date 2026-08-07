import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { goals, goalProjectLinks } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
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
  const body = await req.json();
  const [goal] = await db.update(goals).set({ ...body, updatedAt: new Date() })
    .where(and(eq(goals.id, goalId), eq(goals.orgId, user.orgId))).returning();
  return NextResponse.json({ goal });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ goalId: string }> }) {
  const user = await requireUser();
  const { goalId } = await params;
  await db.delete(goals).where(and(eq(goals.id, goalId), eq(goals.orgId, user.orgId)));
  return NextResponse.json({ success: true });
}
