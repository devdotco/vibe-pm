import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { requireServiceAuth } from '@/lib/auth/service';
import { eq, and } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  if (!requireServiceAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = req.nextUrl;
  const email = searchParams.get('email');
  const orgId = searchParams.get('orgId');
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 });
  /*
   * orgId is now required. Email is unique WITHIN an org, not globally (see
   * the comment on users.email in schema.ts) — an email-only lookup with no
   * ORDER BY could match rows in several different organizations and
   * silently returned whichever one postgres felt like handing back first,
   * handing the caller a user id (and name) in an org it never asked about.
   */
  if (!orgId) return NextResponse.json({ error: 'orgId required' }, { status: 400 });
  const [user] = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(and(eq(users.email, email.toLowerCase()), eq(users.orgId, orgId)))
    .limit(1);
  if (!user) return NextResponse.json({ user: null });
  return NextResponse.json({ user });
}
