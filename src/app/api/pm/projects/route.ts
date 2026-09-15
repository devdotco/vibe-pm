import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projects, projectMembers, projectSettings, sections, teams } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { eq, and, or, ne } from 'drizzle-orm';
import { validate, CreateProjectSchema } from '@/lib/validate';
import { rateLimit } from '@/lib/rate-limit';

const DEFAULT_SECTIONS = [
  { name: 'Backlog', position: 1000 },
  { name: 'To Do', position: 2000 },
  { name: 'In Progress', position: 3000 },
  { name: 'In Review', position: 4000 },
  { name: 'Done', position: 5000 },
];

export async function GET() {
  const user = await requireUser();
  // The membership row's own orgId matching the caller isn't enough on its
  // own: POST .../members used to let anyone insert a membership row (with
  // their own orgId) pointing at ANY project id, including one in another
  // org. Requiring the PROJECT to also be in the caller's org means that,
  // even before that POST was fixed, a stray fake-membership row can't leak
  // a foreign project into this list.
  const rows = await db
    .select({ project: projects })
    .from(projectMembers)
    .innerJoin(projects, and(eq(projectMembers.projectId, projects.id), eq(projects.orgId, user.orgId)))
    .where(and(eq(projectMembers.userId, user.id), eq(projectMembers.orgId, user.orgId), ne(projects.status, 'archived')));
  return NextResponse.json({ projects: rows.map(r => r.project) }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!rateLimit(`projects:${user.id}`, 10, 60_000)) {
    return NextResponse.json({ error: 'Too many requests. Slow down.' }, { status: 429 });
  }
  const body = await req.json();
  const v = validate(CreateProjectSchema, body);
  if (!v.success) return v.response;
  const { name, description, color, icon, teamId, isPublic, dueDate } = v.data;

  // teamId came straight from the body with no check that the team existed
  // in this org — a project could be filed under another tenant's team id,
  // and workspaces/[teamId] has no org-scoped read guarding against it.
  if (teamId) {
    const [team] = await db.select({ id: teams.id }).from(teams)
      .where(and(eq(teams.id, teamId), eq(teams.orgId, user.orgId))).limit(1);
    if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 400 });
  }

  const [project] = await db.insert(projects).values({
    orgId: user.orgId, name, description, color: color ?? '#2563eb', icon,
    teamId, isPublic: isPublic ?? false, dueDate, createdBy: user.id,
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
