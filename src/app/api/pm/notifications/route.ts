import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { pmNotifications } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { eq, and, desc } from 'drizzle-orm';

export async function GET() {
  const user = await requireUser();
  const notifs = await db.select().from(pmNotifications)
    .where(and(eq(pmNotifications.userId, user.id), eq(pmNotifications.orgId, user.orgId)))
    .orderBy(desc(pmNotifications.createdAt))
    .limit(100);
  return NextResponse.json({ notifications: notifs });
}
