import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { pmNotifications } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { eq, and } from 'drizzle-orm';

export async function PATCH() {
  const user = await requireUser();
  await db.update(pmNotifications).set({ isRead: true, readAt: new Date() })
    .where(and(eq(pmNotifications.userId, user.id), eq(pmNotifications.orgId, user.orgId)));
  return NextResponse.json({ success: true });
}
