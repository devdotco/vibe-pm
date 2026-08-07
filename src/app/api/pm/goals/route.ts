import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { goals, goalProjectLinks, projects } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { eq, and } from 'drizzle-orm';

export async function GET() {
  const user = await requireUser();
  const rows = await db.select().from(goals).where(eq(goals.orgId, user.orgId));
  return NextResponse.json({ goals: rows });
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  const { title, description, dueDate, teamId, progressType, targetValue } = await req.json();
  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 });
  const [goal] = await db.insert(goals).values({
    orgId: user.orgId, title, description, dueDate, teamId,
    ownerId: user.id, progressType: progressType ?? 'percent', targetValue: targetValue ?? '100',
  }).returning();
  return NextResponse.json({ goal }, { status: 201 });
}
