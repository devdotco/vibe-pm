import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { desc } from 'drizzle-orm';
import sgMail from '@sendgrid/mail';

export async function GET() {
  await requireUser();
  const allUsers = await db.select().from(users).orderBy(desc(users.createdAt));
  return NextResponse.json({ users: allUsers });
}

export async function POST(req: NextRequest) {
  await requireUser();
  const { name, email, orgId } = await req.json();
  if (!name || !email) return NextResponse.json({ error: 'name and email required' }, { status: 400 });

  const [user] = await db.insert(users)
    .values({ name, email, orgId: orgId ?? 'platform_default' })
    .returning();

  // Send invite email
  try {
    const apiKey = process.env.SENDGRID_API_KEY;
    if (apiKey) {
      sgMail.setApiKey(apiKey);
      const magicLink = `https://pm.vb.co/api/auth/magic?secret=${process.env.BYPASS_SECRET}&email=${encodeURIComponent(email)}`;
      await sgMail.send({
        from: { email: 'noreply@vb.co', name: 'ViBe' },
        to: email,
        subject: `You've been invited to ViBe PM`,
        html: `<p>Hi ${name},</p><p>You've been invited to join ViBe PM — your team's project management platform.</p><p><a href="${magicLink}" style="background:#2f5cff;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block">Accept Invite &amp; Sign In</a></p><p>Or copy this link: ${magicLink}</p>`,
      });
    }
  } catch {
    // Non-fatal: user created, email may have failed
  }

  return NextResponse.json({ user }, { status: 201 });
}
