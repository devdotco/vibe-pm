import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { and, desc, eq } from 'drizzle-orm';
import sgMail from '@sendgrid/mail';
import { z } from 'zod';
import { forbidden, isOrgAdmin } from '@/lib/auth/roles';
import { validate } from '@/lib/validate';

const InviteSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().toLowerCase().email().max(320),
});

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

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
  if (!isOrgAdmin(me)) return forbidden('Only organization admins can add members');
  const parsed = validate(InviteSchema, await req.json().catch(() => null));
  if (!parsed.success) return parsed.response;
  const { name, email } = parsed.data;
  const [dupe] = await db.select({ id: users.id }).from(users)
    .where(and(eq(users.orgId, me.orgId), eq(users.email, email))).limit(1);
  if (dupe) return NextResponse.json({ error: 'That person is already a member' }, { status: 409 });

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
      // A link to the ordinary sign-in page, which mails them their own magic
      // link. This used to embed BYPASS_SECRET — the master key of the
      // now-deleted /api/auth/magic route, which signed in AS ANY EMAIL — in a
      // message sent to whatever address the inviter typed.
      const base = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.erp.io/pm';
      const signInLink = `${base.replace(/\/$/, '')}/sign-in?email=${encodeURIComponent(email)}`;
      const safeName = escapeHtml(name);
      await sgMail.send({
        from: { email: 'noreply@vb.co', name: 'erp.io' },
        to: email,
        subject: `You've been invited to erp.io PM`,
        html: `<p>Hi ${safeName},</p><p>You've been invited to join erp.io PM — your team's project management platform.</p><p><a href="${signInLink}" style="background:#2563eb;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block">Accept Invite &amp; Sign In</a></p><p>Or copy this link: ${signInLink}</p>`,
      });
    }
  } catch {
    // Non-fatal: user created, email may have failed
  }

  return NextResponse.json({ user }, { status: 201 });
}
