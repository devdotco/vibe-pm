import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { eq, and } from 'drizzle-orm';
import { dispatchEvent } from '@/lib/webhooks/dispatcher';
import { validate, UpdateProjectSchema } from '@/lib/validate';

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
  // `.set({...body})` used to write orgId/createdBy/id straight from the
  // request — including moving a project into another organization.
  // completedAt is server-derived below, not caller-settable.
  const parsed = validate(UpdateProjectSchema, await req.json().catch(() => null));
  if (!parsed.success) return parsed.response;
  const body = parsed.data;
  const updateData: Record<string, unknown> = { ...body, updatedAt: new Date() };
  if (body.status === 'completed') {
    updateData.completedAt = new Date();
  }

  // The org-scoped update FIRST, and only dispatch if it actually matched a
  // row in the caller's org. This used to fire the webhook (with an
  // attacker-chosen projectId and the caller's orgId) before checking
  // whether the update touched anything at all — so a caller could send a
  // fake "project.completed" event for a project in a DIFFERENT org, and
  // dispatchEvent's own projectId-only lookup (see dispatcher.ts) would
  // happily deliver it to that project's real messaging channel.
  const [project] = await db.update(projects).set(updateData)
    .where(and(eq(projects.id, projectId), eq(projects.orgId, user.orgId)))
    .returning();
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (body.status === 'completed') {
    dispatchEvent({ eventType: 'project.completed', orgId: user.orgId, projectId, triggeredBy: user.id, data: {} });
  }

  return NextResponse.json({ project });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await requireUser();
  const { projectId } = await params;
  await db.update(projects).set({ status: 'archived', updatedAt: new Date() })
    .where(and(eq(projects.id, projectId), eq(projects.orgId, user.orgId)));
  return NextResponse.json({ success: true });
}
