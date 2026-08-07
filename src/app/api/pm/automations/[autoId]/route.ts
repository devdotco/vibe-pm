import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { automations } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { eq, and } from 'drizzle-orm';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ autoId: string }> }) {
  const user = await requireUser();
  const { autoId } = await params;
  const body = await req.json();
  const [auto] = await db.update(automations).set(body)
    .where(and(eq(automations.id, autoId), eq(automations.orgId, user.orgId))).returning();
  return NextResponse.json({ automation: auto });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ autoId: string }> }) {
  const user = await requireUser();
  const { autoId } = await params;
  await db.delete(automations).where(and(eq(automations.id, autoId), eq(automations.orgId, user.orgId)));
  return NextResponse.json({ success: true });
}
