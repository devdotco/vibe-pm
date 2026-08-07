import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { taskActivity } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { eq, and, desc } from 'drizzle-orm';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await requireUser();
  const { projectId } = await params;
  const rows = await db.select().from(taskActivity)
    .where(and(eq(taskActivity.projectId, projectId), eq(taskActivity.orgId, user.orgId)))
    .orderBy(desc(taskActivity.createdAt))
    .limit(100);
  return NextResponse.json({ activity: rows });
}
