import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sections } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { eq, and, asc } from 'drizzle-orm';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await requireUser();
  const { projectId } = await params;
  const rows = await db.select().from(sections)
    .where(and(eq(sections.projectId, projectId), eq(sections.orgId, user.orgId), eq(sections.isArchived, false)))
    .orderBy(asc(sections.position));
  return NextResponse.json({ sections: rows });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await requireUser();
  const { projectId } = await params;
  const { name, color } = await req.json();
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });
  // place at end
  const existing = await db.select({ position: sections.position }).from(sections)
    .where(and(eq(sections.projectId, projectId), eq(sections.isArchived, false)))
    .orderBy(asc(sections.position));
  const lastPos = existing.length > 0 ? existing[existing.length - 1].position : 0;
  const [section] = await db.insert(sections)
    .values({ projectId, orgId: user.orgId, name, color, position: lastPos + 1000 })
    .returning();
  return NextResponse.json({ section }, { status: 201 });
}
