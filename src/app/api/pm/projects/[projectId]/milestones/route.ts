import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { milestones } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { eq, and, asc } from 'drizzle-orm';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await requireUser();
  const { projectId } = await params;
  const rows = await db.select().from(milestones)
    .where(and(eq(milestones.projectId, projectId), eq(milestones.orgId, user.orgId)))
    .orderBy(asc(milestones.dueDate));
  return NextResponse.json({ milestones: rows });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await requireUser();
  const { projectId } = await params;
  const { title, description, dueDate } = await req.json();
  if (!title || !dueDate) return NextResponse.json({ error: 'title and dueDate required' }, { status: 400 });
  const [milestone] = await db.insert(milestones)
    .values({ projectId, orgId: user.orgId, title, description, dueDate, createdBy: user.id })
    .returning();
  return NextResponse.json({ milestone }, { status: 201 });
}
