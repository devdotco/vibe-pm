import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { forbidden, isOrgAdmin } from '@/lib/auth/roles';
import { validate } from '@/lib/validate';
import { and, eq } from 'drizzle-orm';

const PatchMemberSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().toLowerCase().email().max(320),
  status: z.enum(['active', 'inactive']),
}).partial();

/**
 * Admins only, and only members of the admin's own organization.
 *
 * This was `where id = :userId` for ANY signed-in user: anyone could rename,
 * deactivate, or change the email of any person in any workspace. Changing the
 * email was an account takeover — Projects signs people in by magic link to
 * that address.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const me = await requireUser();
  if (!isOrgAdmin(me)) return forbidden('Only organization admins can change members');
  const { userId } = await params;
  const parsed = validate(PatchMemberSchema, await req.json().catch(() => null));
  if (!parsed.success) return parsed.response;
  if (parsed.data.status === 'inactive' && userId === me.id) {
    return NextResponse.json({ error: 'You cannot deactivate yourself' }, { status: 400 });
  }
  try {
    const [user] = await db.update(users)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(users.id, userId), eq(users.orgId, me.orgId)))
      .returning();
    if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ error: 'That email already belongs to a member' }, { status: 409 });
  }
}
