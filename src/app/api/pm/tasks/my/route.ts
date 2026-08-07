import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tasks, projects, sections } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { eq, and, isNull, asc } from 'drizzle-orm';

export async function GET() {
  const user = await requireUser();
  const rows = await db
    .select({ task: tasks, projectName: projects.name, projectColor: projects.color, sectionName: sections.name })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .leftJoin(sections, eq(tasks.sectionId, sections.id))
    .where(and(eq(tasks.assigneeId, user.id), eq(tasks.orgId, user.orgId), isNull(tasks.deletedAt)))
    .orderBy(asc(tasks.dueDate));
  return NextResponse.json({ tasks: rows });
}
