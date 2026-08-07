import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { automations } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { eq, and } from 'drizzle-orm';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await requireUser();
  const { projectId } = await params;
  const rows = await db.select().from(automations)
    .where(and(eq(automations.projectId, projectId), eq(automations.orgId, user.orgId)));
  return NextResponse.json({ automations: rows });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await requireUser();
  const { projectId } = await params;
  const { name, triggerType, triggerConditions, actionType, actionParams } = await req.json();
  const [automation] = await db.insert(automations).values({
    projectId, orgId: user.orgId, name, triggerType, triggerConditions,
    actionType, actionParams, createdBy: user.id,
  }).returning();
  return NextResponse.json({ automation }, { status: 201 });
}
