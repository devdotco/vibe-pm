import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users, sessions } from '@/lib/db/schema';
import { eq, desc } from "drizzle-orm";
import crypto from 'crypto';
import { COOKIE_NAME, sessionCookieOptions } from '@/lib/auth/session';
import { withBase } from "@/lib/base-path";

function verifyToken(token: string, secret: string): { email: string; expires: number } | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString());
  } catch {
    return null;
  }
}

function hashToken(t: string) {
  return crypto.createHash('sha256').update(t).digest('hex');
}

export async function GET(req: NextRequest) {
  const secret = process.env.EMAIL_REPLY_SECRET;
  if (!secret) return NextResponse.redirect(new URL(withBase('/sign-in'), req.url));

  const token = req.nextUrl.searchParams.get('token') ?? '';
  const next = req.nextUrl.searchParams.get('next') ?? '/my-tasks';

  const data = verifyToken(token, secret);
  if (!data || data.expires < Date.now()) {
    return NextResponse.redirect(new URL(withBase('/sign-in?error=expired'), req.url));
  }

  /*
   * ORDERED, because one email can now be several accounts.
   *
   * Users are scoped per organization — `unique(org_id, email)` — so a person
   * who belongs to two workspaces has two rows. This lookup had no ORDER BY,
   * so `limit(1)` returned whichever row Postgres felt like: a magic link could
   * sign you into somebody else's workspace, and would do it inconsistently.
   *
   * Newest wins. The old rows are the legacy shared workspace; the newest is
   * the account the person most recently arrived as, which is the one they are
   * asking to get back into. It is a rule rather than an answer — an email with
   * two live accounts really needs the link to say which — but it is
   * deterministic, and being deterministic is the part that was missing.
   */
  const [user] = await db.select().from(users)
    .where(eq(users.email, data.email))
    .orderBy(desc(users.createdAt))
    .limit(1);
  if (!user) return NextResponse.redirect(new URL(withBase('/sign-in?error=not_found'), req.url));

  const sessionToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

  await db.insert(sessions).values({
    userId: user.id,
    tokenHash: hashToken(sessionToken),
    expiresAt,
  });

  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'app.erp.io';
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  // withBase: `next` is an app-absolute path and the base here is the bare
  // origin, so without the mount a magic link lands on the shell.
  const res = NextResponse.redirect(new URL(withBase(next), `${proto}://${host}`));
  res.cookies.set(COOKIE_NAME, sessionToken, sessionCookieOptions());

  return res;
}
