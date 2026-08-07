import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tasks, sections } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { eq, and, isNull, asc } from 'drizzle-orm';

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await requireUser();
  const { projectId } = await params;
  const { searchParams } = req.nextUrl;
  const status = searchParams.get('status');
  const assigneeId = searchParams.get('assigneeId');

  const conditions = [
    eq(tasks.projectId, projectId),
    eq(tasks.orgId, user.orgId),
    isNull(tasks.deletedAt),
    isNull(tasks.parentTaskId),
  ];
  if (status) conditions.push(eq(tasks.status, status));
  if (assigneeId) conditions.push(eq(tasks.assigneeId, assigneeId));

  const rows = await db.select().from(tasks)
    .where(and(...conditions))
    .orderBy(asc(tasks.position));
  return NextResponse.json({ tasks: rows });
}
