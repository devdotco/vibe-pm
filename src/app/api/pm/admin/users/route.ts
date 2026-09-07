import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { desc, eq } from 'drizzle-orm';
import sgMail from '@sendgrid/mail';

export async function GET() {
  /*
   * SCOPED TO THE CALLER'S ORGANIZATION.
   *
   * This listed every user in the database — every workspace's people, to
   * anyone signed in anywhere. It is the Members page, so the leak was on
   * screen rather than buried in an API: the same cross-tenant read that was
   * closed on the SSO path, still open here.
   */
  const me = await requireUser();
  const allUsers = await db.select().from(users)
    .where(eq(users.orgId, me.orgId))
    .orderBy(desc(users.createdAt));
  return NextResponse.json({ users: allUsers });
}

export async function POST(req: NextRequest) {
  const me = await requireUser();
  const { name, email } = await req.json();
  if (!name || !email) return NextResponse.json({ error: 'name and email required' }, { status: 400 });

  /*
   * The new member joins THE CALLER'S workspace.
   *
   * This defaulted to the literal 'platform_default' and accepted an `orgId`
   * straight off the request body — so an admin adding a teammate put them in
   * a shared legacy workspace, and anyone posting here could place a user into
   * any organization they could name. The caller's own org is the only answer
   * that is both correct and not attacker-supplied.
   */
  const [user] = await db.insert(users)
    .values({ name, email, orgId: me.orgId })
    .returning();

  // Send invite email
  try {
    const apiKey = process.env.SENDGRID_API_KEY;
    if (apiKey) {
      sgMail.setApiKey(apiKey);
      // Built from the configured base, not a literal. This was hardcoded to
      // pm.vb.co and went on mailing links to a host that no longer serves.
      const base = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.erp.io/pm';
      const magicLink = `${base}/api/auth/magic?secret=${process.env.BYPASS_SECRET}&email=${encodeURIComponent(email)}`;
      await sgMail.send({
        from: { email: 'noreply@vb.co', name: 'erp.io' },
        to: email,
        subject: `You've been invited to erp.io PM`,
        html: `<p>Hi ${name},</p><p>You've been invited to join erp.io PM — your team's project management platform.</p><p><a href="${magicLink}" style="background:#2563eb;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block">Accept Invite &amp; Sign In</a></p><p>Or copy this link: ${magicLink}</p>`,
      });
    }
  } catch {
    // Non-fatal: user created, email may have failed
  }

  return NextResponse.json({ user }, { status: 201 });
}
