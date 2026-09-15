import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { taskAttachments } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { parseAttachmentSegment } from "@/lib/attachments";
import { serveStoredObject } from "@/lib/uploads";
import { safeFilename } from "@/lib/storage";

/**
 * Serve a task attachment to a member of the task's organization.
 *
 * This used to read /tmp/vibe-uploads/<taskId>/<filename> for ANY signed-in
 * user — the proxy checked for a session, nothing checked the org — so a task
 * id and a filename were enough to read another tenant's file. It now resolves
 * the attachment ROW, scoped to the caller's org, and serves only that.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ taskId: string; filename: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { taskId, filename: segment } = await params;
  const { attachmentId, filename } = parseAttachmentSegment(decodeURIComponent(segment));

  const scope = and(eq(taskAttachments.taskId, taskId), eq(taskAttachments.orgId, user.orgId));
  const rows = attachmentId
    ? await db.select().from(taskAttachments).where(and(scope, eq(taskAttachments.id, attachmentId))).limit(1)
    : // Legacy URL: the bare sanitized filename. The newest row wins, because
      // the old /tmp scheme overwrote an earlier file of the same name anyway.
      (await db.select().from(taskAttachments).where(scope).orderBy(desc(taskAttachments.createdAt)))
        .filter((a) => safeFilename(a.filename) === safeFilename(filename) || a.url.endsWith(`/${filename}`))
        .slice(0, 1);
  const attachment = rows[0];
  if (!attachment) return NextResponse.json({ error: "File not found" }, { status: 404 });

  if (attachment.storageKey) {
    return serveStoredObject(attachment.storageKey, attachment.filename, attachment.fileType);
  }

  // Pre-R2 row: only present if this container has not been redeployed since
  // it was uploaded (or the one-off copy to R2 has not run yet).
  const legacyName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  try {
    const buffer = await readFile(path.join("/tmp/vibe-uploads", taskId, legacyName));
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${legacyName}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
