import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projectMembers, users, projects } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { eq, and } from 'drizzle-orm';
import sgMail from '@sendgrid/mail';

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
  const [member] = await db.insert(projectMembers)
    .values({ projectId, orgId: user.orgId, userId, role: role ?? 'editor' })
    .returning();

  // Email the added member (fire and forget)
  const apiKey = process.env.SENDGRID_API_KEY;
  if (userId !== user.id && apiKey) {
    Promise.all([
      db.select().from(users).where(eq(users.id, userId)).limit(1),
      db.select().from(projects).where(eq(projects.id, projectId)).limit(1),
    ]).then(async ([[addedUser], [project]]) => {
      if (!addedUser?.email || !project) return;
      sgMail.setApiKey(apiKey);
      const projectUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://pm.vb.co'}/projects/${projectId}`;
      await sgMail.send({
        from: process.env.EMAIL_FROM ?? 'ViBe PM <notifications@vb.co>',
        to: addedUser.email,
        subject: `${user.name} added you to ${project.name}`,
        html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
          <h2 style="font-size:18px;margin-bottom:8px">📋 You've been added to a project</h2>
          <p style="color:#666;margin-bottom:16px">${user.name} added you to <strong>${project.name}</strong> on ViBe PM.</p>
          <a href="${projectUrl}" style="display:inline-block;background:#2f5cff;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600">Open project</a>
        </div>`,
      }).catch(() => {});
    }).catch(() => {});
  }

  return NextResponse.json({ member }, { status: 201 });
}
