import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projects, projectMembers, projectSettings, sections } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { eq, and, or } from 'drizzle-orm';

const DEFAULT_SECTIONS = [
  { name: 'Backlog', position: 1000 },
  { name: 'To Do', position: 2000 },
  { name: 'In Progress', position: 3000 },
  { name: 'In Review', position: 4000 },
  { name: 'Done', position: 5000 },
];

export async function GET() {
  const user = await requireUser();
  const rows = await db
    .select({ project: projects })
    .from(projectMembers)
    .innerJoin(projects, eq(projectMembers.projectId, projects.id))
    .where(and(eq(projectMembers.userId, user.id), eq(projectMembers.orgId, user.orgId)));
  return NextResponse.json({ projects: rows.map(r => r.project) });
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  const { name, description, color, icon, teamId, isPublic } = await req.json();
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const [project] = await db.insert(projects).values({
    orgId: user.orgId, name, description, color: color ?? '#2f5cff', icon,
    teamId, isPublic: isPublic ?? false, createdBy: user.id,
  }).returning();

  await db.insert(projectMembers).values({
    projectId: project.id, orgId: user.orgId, userId: user.id, role: 'owner',
  });
  await db.insert(projectSettings).values({ projectId: project.id, orgId: user.orgId });
  await db.insert(sections).values(
    DEFAULT_SECTIONS.map(s => ({ ...s, projectId: project.id, orgId: user.orgId }))
  );
  return NextResponse.json({ project }, { status: 201 });
}
