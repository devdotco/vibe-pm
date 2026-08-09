import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { taskWatchers, users } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { eq, and } from 'drizzle-orm';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const user = await requireUser();
  const { taskId } = await params;
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, avatarUrl: users.avatarUrl })
    .from(taskWatchers)
    .innerJoin(users, eq(taskWatchers.userId, users.id))
    .where(and(eq(taskWatchers.taskId, taskId), eq(taskWatchers.orgId, user.orgId)));
  return NextResponse.json({ watchers: rows });
}
