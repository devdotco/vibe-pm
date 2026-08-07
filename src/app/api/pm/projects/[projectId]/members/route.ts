import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projectMembers, users } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { eq, and } from 'drizzle-orm';

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
  return NextResponse.json({ member }, { status: 201 });
}
