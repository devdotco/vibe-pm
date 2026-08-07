import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { milestones } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { dispatchEvent } from '@/lib/webhooks/dispatcher';
import { eq, and } from 'drizzle-orm';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ milestoneId: string }> }) {
  const user = await requireUser();
  const { milestoneId } = await params;
  const [milestone] = await db.update(milestones)
    .set({ status: 'reached', reachedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(milestones.id, milestoneId), eq(milestones.orgId, user.orgId)))
    .returning();
  if (!milestone) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  dispatchEvent({ eventType: 'milestone.reached', orgId: user.orgId, projectId: milestone.projectId, milestoneId, triggeredBy: user.id, data: { title: milestone.title } });
  return NextResponse.json({ milestone });
}
