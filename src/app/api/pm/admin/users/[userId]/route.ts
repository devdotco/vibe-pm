import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { eq } from 'drizzle-orm';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  await requireUser();
  const { userId } = await params;
  const body = await req.json();
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) patch.name = body.name;
  if (body.email !== undefined) patch.email = body.email;
  if (body.status !== undefined) patch.status = body.status;
  const [user] = await db.update(users)
    .set(patch)
    .where(eq(users.id, userId))
    .returning();
  return NextResponse.json({ user });
}
