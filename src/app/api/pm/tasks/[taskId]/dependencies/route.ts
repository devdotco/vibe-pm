import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { taskDependencies } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { eq, and } from 'drizzle-orm';

export async function POST(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const user = await requireUser();
  const { taskId } = await params;
  const { dependsOnTaskId, type } = await req.json();
  const [dep] = await db.insert(taskDependencies).values({
    taskId, dependsOnTaskId, orgId: user.orgId, type: type ?? 'finish_to_start',
  }).returning();
  return NextResponse.json({ dependency: dep }, { status: 201 });
}
