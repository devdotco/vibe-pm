import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { pmNotifications } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { eq, and } from 'drizzle-orm';

export async function PATCH(_req: NextRequest, { params }: { params: Promise<{ notifId: string }> }) {
  const user = await requireUser();
  const { notifId } = await params;
  await db.update(pmNotifications).set({ isRead: true, readAt: new Date() })
    .where(and(eq(pmNotifications.id, notifId), eq(pmNotifications.userId, user.id)));
  return NextResponse.json({ success: true });
}
