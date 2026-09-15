import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projectMembers, users, projects } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { eq, and } from 'drizzle-orm';
import sgMail from '@sendgrid/mail';
import { escapeHtml } from '@/lib/email/notifications';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await requireUser();
  const { projectId } = await params;
  const rows = await db
    .select({ member: projectMembers, user: users })
    .from(projectMembers)
    .leftJoin(users, eq(projectMembers.userId, users.id))
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.orgId, user.orgId)));
  return NextResponse.json({
    members: rows.map(r => ({
      ...r.member,
      userName: r.user?.name ?? null,
      userEmail: r.user?.email ?? null,
      userAvatarUrl: r.user?.avatarUrl ?? null,
    })),
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await requireUser();
  const { projectId } = await params;
  const { userId, role } = await req.json();

  /*
   * This inserted whatever (projectId, userId) the caller sent, stamped with
   * the caller's own orgId — so any signed-in user could self-grant
   * membership into ANY project id, in any org, just by guessing or learning
   * a uuid. That row then let them into every join that trusts
   * project_members without also checking the PROJECT's org (see the fixes
   * in projects/route.ts, portfolio/route.ts and home/page.tsx) — a fake
   * membership row was enough to make a foreign project's name, tasks and
   * task counts show up in the caller's own dashboard.
   *
   * Both the project and the user being added must be in the caller's org.
   */
  const [project] = await db.select({ id: projects.id }).from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.orgId, user.orgId))).limit(1);
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const [targetUser] = await db.select({ id: users.id, email: users.email, name: users.name })
    .from(users).where(and(eq(users.id, userId), eq(users.orgId, user.orgId))).limit(1);
  if (!targetUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const [member] = await db.insert(projectMembers)
    .values({ projectId, orgId: user.orgId, userId, role: role ?? 'editor' })
    .returning();

  // Email the added member (fire and forget)
  const apiKey = process.env.SENDGRID_API_KEY;
  if (userId !== user.id && apiKey && targetUser.email) {
    db.select({ name: projects.name }).from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.orgId, user.orgId))).limit(1)
      .then(async ([proj]) => {
        if (!proj) return;
        sgMail.setApiKey(apiKey);
        const projectUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.erp.io/pm'}/projects/${projectId}`;
        const actorName = escapeHtml(user.name);
        const projectName = escapeHtml(proj.name);
        await sgMail.send({
          from: process.env.EMAIL_FROM ?? 'erp.io PM <notifications@vb.co>',
          to: targetUser.email!,
          subject: `${user.name} added you to ${proj.name}`,
          html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
            <h2 style="font-size:18px;margin-bottom:8px">📋 You've been added to a project</h2>
            <p style="color:#666;margin-bottom:16px">${actorName} added you to <strong>${projectName}</strong> on erp.io PM.</p>
            <a href="${projectUrl}" style="display:inline-block;background:#2563eb;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600">Open project</a>
          </div>`,
        }).catch(() => {});
      }).catch(() => {});
  }

  return NextResponse.json({ member }, { status: 201 });
}
