import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { automations } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { validate, UpdateAutomationSchema } from '@/lib/validate';
import { eq, and } from 'drizzle-orm';

// `.set(body)` wrote the request straight through — projectId/orgId/id/
// createdBy/runCount/lastRunAt included.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ autoId: string }> }) {
  const user = await requireUser();
  const { autoId } = await params;
  const parsed = validate(UpdateAutomationSchema, await req.json().catch(() => null));
  if (!parsed.success) return parsed.response;
  const [auto] = await db.update(automations).set(parsed.data)
    .where(and(eq(automations.id, autoId), eq(automations.orgId, user.orgId))).returning();
  if (!auto) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ automation: auto });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ autoId: string }> }) {
  const user = await requireUser();
  const { autoId } = await params;
  await db.delete(automations).where(and(eq(automations.id, autoId), eq(automations.orgId, user.orgId)));
  return NextResponse.json({ success: true });
}
