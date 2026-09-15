import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { taskAttachments, tasks } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { logActivity } from '@/lib/activity';
import { eq, and } from 'drizzle-orm';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const user = await requireUser();
  const { taskId } = await params;
  const attachments = await db.select().from(taskAttachments)
    .where(and(eq(taskAttachments.taskId, taskId), eq(taskAttachments.orgId, user.orgId)));
  return NextResponse.json({ attachments });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const user = await requireUser();
  const { taskId } = await params;
  const [task] = await db.select().from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.orgId, user.orgId)));
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = await req.json().catch(() => null);
  const { url, filename, fileType, fileSize } = body ?? {};
  // A link attachment is rendered as <a href>. Only http(s) — a `javascript:`
  // URL here would run in the app's origin for whoever clicked it.
  let parsedUrl: URL | null = null;
  try { parsedUrl = typeof url === 'string' ? new URL(url) : null; } catch { parsedUrl = null; }
  if (!parsedUrl || !['https:', 'http:'].includes(parsedUrl.protocol) || typeof filename !== 'string' || !filename.trim()) {
    return NextResponse.json({ error: 'A valid http(s) url and filename are required' }, { status: 400 });
  }
  const safeUrl = parsedUrl.toString();
  const [attachment] = await db.transaction(async (tx) => {
    const [a] = await tx.insert(taskAttachments).values({ taskId, orgId: user.orgId, userId: user.id, url: safeUrl, filename: filename.slice(0, 300), fileType: typeof fileType === 'string' ? fileType.slice(0, 200) : 'link', fileSize: Number.isInteger(fileSize) ? fileSize : null }).returning();
    await logActivity({ taskId, projectId: task.projectId, orgId: user.orgId, userId: user.id, action: 'attachment_added', newValue: filename }, tx);
    return [a];
  });
  return NextResponse.json({ attachment }, { status: 201 });
}
