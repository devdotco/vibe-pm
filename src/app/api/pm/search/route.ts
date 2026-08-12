import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tasks, taskComments, projects } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { eq, and, isNull, ilike, or, desc } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const user = await requireUser();
  const q = req.nextUrl.searchParams.get('q') ?? '';
  const type = req.nextUrl.searchParams.get('type') ?? 'tasks';
  if (!q || q.length < 2) return NextResponse.json({ results: [] });

  if (type === 'tasks') {
    const results = await db.select({ task: tasks, projectName: projects.name })
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .where(and(
        eq(tasks.orgId, user.orgId), isNull(tasks.deletedAt),
        or(ilike(tasks.title, `%${q}%`), ilike(tasks.description, `%${q}%`))
      ))
      .orderBy(desc(tasks.updatedAt))
      .limit(50);
    return NextResponse.json({ results });
  }

  if (type === 'comments') {
    const results = await db.select().from(taskComments)
      .where(and(eq(taskComments.orgId, user.orgId), isNull(taskComments.deletedAt), ilike(taskComments.content, `%${q}%`)))
      .limit(25);
    return NextResponse.json({ results });
  }

  if (type === 'projects') {
    const results = await db.select().from(projects)
      .where(and(eq(projects.orgId, user.orgId), ilike(projects.name, `%${q}%`)))
      .limit(25);
    return NextResponse.json({ results });
  }

  return NextResponse.json({ results: [] });
}
