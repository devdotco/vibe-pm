import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { taskAttachments, tasks } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { logActivity } from "@/lib/activity";
import { eq, and } from "drizzle-orm";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const user = await requireUser();
  const { taskId } = await params;

  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.orgId, user.orgId)));
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  // Store file to disk
  const uploadDir = path.join("/tmp/vibe-uploads", taskId);
  await mkdir(uploadDir, { recursive: true });
  const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = path.join(uploadDir, safeFilename);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer);

  // Construct a URL — the file is served by the local file server
  // In production this should be S3/CDN; for now use internal API
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const url = `${appUrl}/api/pm/tasks/${taskId}/attachments/files/${safeFilename}`;

  const [attachment] = await db.transaction(async (tx) => {
    const [a] = await tx
      .insert(taskAttachments)
      .values({
        taskId,
        orgId: user.orgId,
        userId: user.id,
        url,
        filename: file.name,
        fileType: file.type || "application/octet-stream",
        fileSize: file.size,
      })
      .returning();
    await logActivity(
      { taskId, projectId: task.projectId, orgId: user.orgId, userId: user.id, action: "attachment_added", newValue: file.name },
      tx
    );
    return [a];
  });

  return NextResponse.json({ attachment }, { status: 201 });
}
