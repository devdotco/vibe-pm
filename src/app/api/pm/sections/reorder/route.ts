import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sections } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { eq, and } from 'drizzle-orm';

export async function POST(req: NextRequest) {
  const user = await requireUser();
  const { updates } = await req.json() as { updates: Array<{ id: string; position: number }> };
  await Promise.all(updates.map(({ id, position }) =>
    db.update(sections).set({ position, updatedAt: new Date() })
      .where(and(eq(sections.id, id), eq(sections.orgId, user.orgId)))
  ));
  return NextResponse.json({ success: true });
}
