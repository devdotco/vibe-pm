import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { projectMembers, projects } from '@/lib/db/schema';
import { and, eq, ne } from 'drizzle-orm';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'not authenticated' }, { status: 401 });

  const rows = await db
    .select({ name: projects.name, status: projects.status })
    .from(projectMembers)
    .innerJoin(projects, eq(projectMembers.projectId, projects.id))
    .where(and(eq(projectMembers.userId, user.id), eq(projectMembers.orgId, user.orgId), ne(projects.status, 'archived')));

  return NextResponse.json({
    userId: user.id,
    email: user.email,
    orgId: user.orgId,
    projectCount: rows.length,
    projects: rows.map(r => r.name),
  }, { headers: { 'Cache-Control': 'no-store' } });
}
