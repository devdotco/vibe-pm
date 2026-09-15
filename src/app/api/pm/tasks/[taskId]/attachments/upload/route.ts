import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { taskAttachments, tasks } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { logActivity } from "@/lib/activity";
import { eq, and, isNull } from "drizzle-orm";
import { newStorageKey, safeFilename, storage } from "@/lib/storage";
import { readUpload, storageUnavailable } from "@/lib/uploads";
import { attachmentFileUrl } from "@/lib/attachments";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const user = await requireUser();
  const { taskId } = await params;

  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.orgId, user.orgId), isNull(tasks.deletedAt)));
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const upload = await readUpload(req);
  if (!upload.ok) return upload.response;
  const { file, bytes, contentType } = upload;

  // R2, keyed per org and task with a random segment. This used to write
  // /tmp/vibe-uploads/<task>/<name> inside the container: lost on every
  // redeploy, and two files with the same name overwrote each other.
  const storageKey = newStorageKey(user.orgId, "tasks", taskId, file.name);
  try {
    await storage().put(storageKey, bytes, contentType);
  } catch (err) {
    return storageUnavailable(err);
  }

  const [attachment] = await db.transaction(async (tx) => {
    const [a] = await tx
      .insert(taskAttachments)
      .values({
        taskId,
        orgId: user.orgId,
        userId: user.id,
        // Placeholder until the id exists; the stable URL is keyed by it.
        url: "",
        filename: file.name,
        fileType: contentType,
        fileSize: file.size,
        storageKey,
      })
      .returning();
    const [withUrl] = await tx
      .update(taskAttachments)
      .set({ url: attachmentFileUrl(taskId, a.id, safeFilename(file.name)) })
      .where(eq(taskAttachments.id, a.id))
      .returning();
    await logActivity(
      { taskId, projectId: task.projectId, orgId: user.orgId, userId: user.id, action: "attachment_added", newValue: file.name },
      tx
    );
    return [withUrl];
  });

  return NextResponse.json({ attachment }, { status: 201 });
}
