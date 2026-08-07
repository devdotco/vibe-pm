import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sections } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { eq, and } from 'drizzle-orm';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ sectionId: string }> }) {
  const user = await requireUser();
  const { sectionId } = await params;
  const body = await req.json();
  const [section] = await db.update(sections).set({ ...body, updatedAt: new Date() })
    .where(and(eq(sections.id, sectionId), eq(sections.orgId, user.orgId))).returning();
  if (!section) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ section });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ sectionId: string }> }) {
  const user = await requireUser();
  const { sectionId } = await params;
  await db.update(sections).set({ isArchived: true, updatedAt: new Date() })
    .where(and(eq(sections.id, sectionId), eq(sections.orgId, user.orgId)));
  return NextResponse.json({ success: true });
}
