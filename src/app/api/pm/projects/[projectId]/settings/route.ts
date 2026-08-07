import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projectSettings } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { eq, and } from 'drizzle-orm';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await requireUser();
  const { projectId } = await params;
  const [settings] = await db.select().from(projectSettings)
    .where(and(eq(projectSettings.projectId, projectId), eq(projectSettings.orgId, user.orgId)));
  return NextResponse.json({ settings: settings ?? null });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await requireUser();
  const { projectId } = await params;
  const body = await req.json();
  const [settings] = await db.update(projectSettings)
    .set({ ...body, updatedAt: new Date() })
    .where(and(eq(projectSettings.projectId, projectId), eq(projectSettings.orgId, user.orgId)))
    .returning();
  return NextResponse.json({ settings });
}
