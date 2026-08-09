import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tasks, sections, projects, users } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { eq, and, isNull } from 'drizzle-orm';
import Papa from 'papaparse';
import { z } from 'zod';
import { positionBetween } from '@/lib/ordering';

const RowSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(50_000).optional(),
  assignee_email: z.string().email().optional().or(z.literal('')),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  priority: z.enum(['none', 'low', 'medium', 'high', 'urgent']).optional().or(z.literal('')),
  status: z.enum(['not_started', 'in_progress', 'completed', 'blocked']).optional().or(z.literal('')),
  labels: z.string().optional(),
  section_name: z.string().max(200).optional(),
  estimated_minutes: z.string().optional(),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  await requireUser();
  const { projectId } = await params;
  const csv = 'title,description,assignee_email,due_date,priority,status,labels,section_name,estimated_minutes\n' +
    `"Example task","Task description","user@example.com","2026-09-01","high","not_started","bug,backend","To Do","60"\n`;
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="tasks-template-${projectId}.csv"`,
    },
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await requireUser();
  const { projectId } = await params;

  // Verify project access
  const [proj] = await db.select({ id: projects.id }).from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.orgId, user.orgId)));
  if (!proj) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  const text = await file.text();
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });

  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    return NextResponse.json({ error: 'Could not parse CSV', details: parsed.errors }, { status: 400 });
  }

  const rowErrors: Array<{ row: number; reason: string }> = [];
  const toInsert: (typeof tasks.$inferInsert)[] = [];

  // Pre-cache: email→userId map
  const emailCache = new Map<string, string>();
  // Pre-cache: section name→id map
  const sectionCache = new Map<string, string>();

  const existingSections = await db.select({ id: sections.id, name: sections.name }).from(sections)
    .where(and(eq(sections.projectId, projectId), isNull(sections.isArchived as never)));
  for (const s of existingSections) sectionCache.set(s.name.toLowerCase(), s.id);

  // Fetch last position
  const lastTask = await db.select({ position: tasks.position }).from(tasks)
    .where(and(eq(tasks.projectId, projectId), isNull(tasks.deletedAt)))
    .orderBy(tasks.position).limit(1);
  let posBase = lastTask[0]?.position ?? 0;

  for (let i = 0; i < parsed.data.length; i++) {
    const rawRow = parsed.data[i]!;
    const v = RowSchema.safeParse(rawRow);
    if (!v.success) {
      rowErrors.push({ row: i + 2, reason: v.error.issues.map(e => e.message).join(', ') });
      continue;
    }
    const row = v.data;

    // Resolve assignee email
    let assigneeId: string | undefined;
    if (row.assignee_email) {
      if (emailCache.has(row.assignee_email)) {
        assigneeId = emailCache.get(row.assignee_email);
      } else {
        const [u] = await db.select({ id: users.id }).from(users)
          .where(and(eq(users.email, row.assignee_email), eq(users.orgId, user.orgId)));
        if (u) { assigneeId = u.id; emailCache.set(row.assignee_email, u.id); }
      }
    }

    // Resolve section name
    let sectionId: string | undefined;
    if (row.section_name) {
      const key = row.section_name.toLowerCase();
      if (sectionCache.has(key)) {
        sectionId = sectionCache.get(key);
      } else {
        // Create new section
        const [newSection] = await db.insert(sections).values({
          projectId, orgId: user.orgId, name: row.section_name, position: posBase + 1000,
        }).returning();
        if (newSection) { sectionCache.set(key, newSection.id); sectionId = newSection.id; }
      }
    }

    // Parse labels
    const labels = row.labels ? row.labels.split(',').map(l => l.trim()).filter(Boolean).slice(0, 10) : [];

    // Parse estimated_minutes
    const estimatedMinutes = row.estimated_minutes ? parseInt(row.estimated_minutes, 10) || undefined : undefined;

    posBase = positionBetween(posBase, null);

    toInsert.push({
      projectId,
      sectionId,
      orgId: user.orgId,
      title: row.title,
      description: row.description || null,
      priority: (row.priority || 'none') as typeof tasks.$inferInsert['priority'],
      status: (row.status || 'not_started') as typeof tasks.$inferInsert['status'],
      assigneeId,
      dueDate: row.due_date || null,
      labels,
      estimatedMinutes,
      position: posBase,
      createdBy: user.id,
    });
  }

  let imported = 0;
  if (toInsert.length > 0) {
    // Insert in batches of 100
    for (let i = 0; i < toInsert.length; i += 100) {
      const batch = toInsert.slice(i, i + 100);
      await db.insert(tasks).values(batch);
      imported += batch.length;
    }
  }

  return NextResponse.json({ imported, errors: rowErrors });
}
