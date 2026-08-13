import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

function makeToken(email: string, secret: string): string {
  const expires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  const payload = Buffer.from(JSON.stringify({ email, expires })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export async function POST(req: NextRequest) {
  const secret = process.env.EMAIL_REPLY_SECRET;
  const sgKey = process.env.SENDGRID_API_KEY;
  const from = process.env.EMAIL_FROM ?? 'ViBe PM <noreply@vb.co>';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://pm.vb.co';

  if (!secret || !sgKey) {
    return NextResponse.json({ error: 'Email not configured.' }, { status: 503 });
  }

  let body: { email?: string; next?: string };
  try {
    body = await req.json() as { email?: string; next?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const email = body.email?.trim().toLowerCase();
  if (!email) return NextResponse.json({ error: 'Email required.' }, { status: 400 });

  let user: { email: string; name: string } | undefined;
  try {
    const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
    user = rows[0];
  } catch {
    return NextResponse.json({ error: 'Service unavailable. Please try again.' }, { status: 503 });
  }
  if (!user) {
    return NextResponse.json({ error: 'No account found for that email.' }, { status: 404 });
  }

  const token = makeToken(email, secret);
  const next = body.next ?? '/my-tasks';
  const link = `${appUrl}/api/auth/verify?token=${encodeURIComponent(token)}&next=${encodeURIComponent(next)}`;

  await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${sgKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: { email: from.match(/<(.+)>/)?.[1] ?? 'noreply@vb.co', name: from.split('<')[0].trim() },
      personalizations: [{ to: [{ email: user.email, name: user.name }] }],
      subject: 'Sign in to ViBe PM',
      content: [{ type: 'text/html', value: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
          <h2 style="font-size:20px;font-weight:700;margin-bottom:8px">Sign in to ViBe PM</h2>
          <p style="color:#6c7484;margin-bottom:24px">Click the button below to sign in. This link expires in 24 hours.</p>
          <a href="${link}" style="display:inline-block;padding:12px 24px;background:#2f5cff;color:white;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">Sign in</a>
          <p style="color:#9ca3af;font-size:12px;margin-top:24px">If you didn't request this, ignore this email.</p>
        </div>` }],
    }),
  });

  return NextResponse.json({ ok: true });
}
