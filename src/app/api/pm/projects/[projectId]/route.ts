import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { eq, and } from 'drizzle-orm';
import { dispatchEvent } from '@/lib/webhooks/dispatcher';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await requireUser();
  const { projectId } = await params;
  const [project] = await db.select().from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.orgId, user.orgId)));
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ project });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await requireUser();
  const { projectId } = await params;
  const body = await req.json();
  const updateData: Record<string, unknown> = { ...body, updatedAt: new Date() };
  if (body.status === 'completed' && !body.completedAt) {
    updateData.completedAt = new Date();
    // fire webhook async
    dispatchEvent({ eventType: 'project.completed', orgId: user.orgId, projectId, triggeredBy: user.id, data: {} });
  }
  const [project] = await db.update(projects).set(updateData)
    .where(and(eq(projects.id, projectId), eq(projects.orgId, user.orgId)))
    .returning();
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ project });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await requireUser();
  const { projectId } = await params;
  await db.update(projects).set({ status: 'archived', updatedAt: new Date() })
    .where(and(eq(projects.id, projectId), eq(projects.orgId, user.orgId)));
  return NextResponse.json({ success: true });
}
