import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { automations, projects } from '@/lib/db/schema';
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
  /*
   * projectId came straight from the URL with no check it belonged to this
   * org. That let an attacker plant an automation — say, actionType
   * 'assign_user' with their own userId as the param — on ANOTHER tenant's
   * project id while stamping it with their own orgId. Before the fix below,
   * the engine in tasks/[taskId]/route.ts selected automations by projectId
   * ALONE, so the planted row would run for real task updates in the victim
   * org and silently assign the attacker to their tasks.
   */
  const [project] = await db.select({ id: projects.id }).from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.orgId, user.orgId))).limit(1);
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const { name, triggerType, triggerConditions, actionType, actionParams } = await req.json();
  const [automation] = await db.insert(automations).values({
    projectId, orgId: user.orgId, name, triggerType, triggerConditions,
    actionType, actionParams, createdBy: user.id,
  }).returning();
  return NextResponse.json({ automation }, { status: 201 });
}
