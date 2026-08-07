import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { milestones } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { eq, and } from 'drizzle-orm';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ milestoneId: string }> }) {
  const user = await requireUser();
  const { milestoneId } = await params;
  const body = await req.json();
  const [milestone] = await db.update(milestones).set({ ...body, updatedAt: new Date() })
    .where(and(eq(milestones.id, milestoneId), eq(milestones.orgId, user.orgId))).returning();
  return NextResponse.json({ milestone });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ milestoneId: string }> }) {
  const user = await requireUser();
  const { milestoneId } = await params;
  await db.delete(milestones).where(and(eq(milestones.id, milestoneId), eq(milestones.orgId, user.orgId)));
  return NextResponse.json({ success: true });
}
