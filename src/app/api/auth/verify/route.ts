import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users, sessions } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

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
  if (!secret) return NextResponse.redirect(new URL('/sign-in', req.url));

  const token = req.nextUrl.searchParams.get('token') ?? '';
  const next = req.nextUrl.searchParams.get('next') ?? '/my-tasks';

  const data = verifyToken(token, secret);
  if (!data || data.expires < Date.now()) {
    return NextResponse.redirect(new URL('/sign-in?error=expired', req.url));
  }

  const [user] = await db.select().from(users).where(eq(users.email, data.email)).limit(1);
  if (!user) return NextResponse.redirect(new URL('/sign-in?error=not_found', req.url));

  const sessionToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await db.insert(sessions).values({
    userId: user.id,
    tokenHash: hashToken(sessionToken),
    expiresAt,
  });

  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'pm.vb.co';
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  const res = NextResponse.redirect(new URL(next, `${proto}://${host}`));
  res.cookies.set('__vibe_session', sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: expiresAt,
    path: '/',
    domain: process.env.COOKIE_DOMAIN ?? '.vb.co',
  });

  return res;
}
