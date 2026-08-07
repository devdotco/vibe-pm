import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { taskDependencies } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { eq, and } from 'drizzle-orm';

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ taskId: string; did: string }> }) {
  const user = await requireUser();
  const { did } = await params;
  await db.delete(taskDependencies).where(and(eq(taskDependencies.id, did), eq(taskDependencies.orgId, user.orgId)));
  return NextResponse.json({ success: true });
}
