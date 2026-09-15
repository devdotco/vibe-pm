import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { formFiles } from "@/lib/db/schema";
import { apiUser, notFound } from "@/lib/forms/api";
import { serveStoredObject } from "@/lib/uploads";

/** A form photo or signature, to members of the submission's organization only. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ submissionId: string; fileId: string }> }) {
  const { user, res } = await apiUser();
  if (res) return res;
  const { submissionId, fileId } = await params;
  const [file] = await db.select().from(formFiles)
    .where(and(eq(formFiles.id, fileId), eq(formFiles.submissionId, submissionId), eq(formFiles.orgId, user.orgId)))
    .limit(1);
  if (!file) return notFound("File not found");
  return serveStoredObject(file.storageKey, file.filename, file.contentType);
}
