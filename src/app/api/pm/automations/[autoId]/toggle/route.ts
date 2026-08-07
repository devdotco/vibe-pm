import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { automations } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { eq, and } from 'drizzle-orm';

export async function PATCH(_req: NextRequest, { params }: { params: Promise<{ autoId: string }> }) {
  const user = await requireUser();
  const { autoId } = await params;
  const [current] = await db.select().from(automations)
    .where(and(eq(automations.id, autoId), eq(automations.orgId, user.orgId)));
  if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const [auto] = await db.update(automations).set({ isEnabled: !current.isEnabled })
    .where(eq(automations.id, autoId)).returning();
  return NextResponse.json({ automation: auto });
}
