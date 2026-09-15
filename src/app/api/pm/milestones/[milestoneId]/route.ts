import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { milestones } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { validate, UpdateMilestoneSchema } from '@/lib/validate';
import { eq, and } from 'drizzle-orm';

// status/reachedAt are deliberately not in UpdateMilestoneSchema — those
// belong to POST/DELETE .../reach, which also fires the milestone.reached
// webhook. Letting this generic PATCH set them let a caller flip a milestone
// to "reached" without going through that route, and `.set({...body})` also
// let it write orgId/projectId/id/createdBy.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ milestoneId: string }> }) {
  const user = await requireUser();
  const { milestoneId } = await params;
  const parsed = validate(UpdateMilestoneSchema, await req.json().catch(() => null));
  if (!parsed.success) return parsed.response;
  const [milestone] = await db.update(milestones).set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(milestones.id, milestoneId), eq(milestones.orgId, user.orgId))).returning();
  if (!milestone) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ milestone });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ milestoneId: string }> }) {
  const user = await requireUser();
  const { milestoneId } = await params;
  await db.delete(milestones).where(and(eq(milestones.id, milestoneId), eq(milestones.orgId, user.orgId)));
  return NextResponse.json({ success: true });
}
