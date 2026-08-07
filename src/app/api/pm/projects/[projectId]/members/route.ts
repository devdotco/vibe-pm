import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projectMembers } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { eq, and } from 'drizzle-orm';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await requireUser();
  const { projectId } = await params;
  const members = await db.select().from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.orgId, user.orgId)));
  return NextResponse.json({ members });
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
