import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { formFiles } from "@/lib/db/schema";
import { apiUser, canEditSubmission, notFound } from "@/lib/forms/api";
import { definitionForSubmission, getSubmission } from "@/lib/forms/service";
import { forbidden } from "@/lib/auth/roles";
import { allQuestions } from "@/lib/forms/definition";
import { newStorageKey, storage } from "@/lib/storage";
import { readUpload, storageUnavailable } from "@/lib/uploads";

// PDF embedding supports JPEG and PNG; the fill screen converts everything else
// (HEIC from iPhones included) to JPEG before upload. WebP is accepted for the
// screen but renders as a placeholder in the PDF.
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Upload one photo or a signature for one question. Returns the file id; the
 * fill screen then saves it into the answer. A file nobody saves into an
 * answer is simply never shown.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ submissionId: string }> }) {
  const { user, res } = await apiUser();
  if (res) return res;
  const { submissionId } = await params;
  const questionId = req.nextUrl.searchParams.get("questionId") ?? "";

  const sub = await getSubmission(user.orgId, submissionId);
  if (!sub) return notFound();
  if (!canEditSubmission(user, sub)) return forbidden("This form has been submitted; only an admin can change it");

  const definition = await definitionForSubmission(sub);
  const question = allQuestions(definition).find((q) => q.id === questionId);
  if (!question || (question.type !== "images" && question.type !== "signature")) {
    return NextResponse.json({ error: "That question does not take files" }, { status: 400 });
  }

  const upload = await readUpload(req, {
    allow: (t) => (question.type === "signature" ? t === "image/png" : IMAGE_TYPES.has(t)),
  });
  if (!upload.ok) return upload.response;

  const storageKey = newStorageKey(user.orgId, "forms", sub.id, upload.file.name || `${question.type}.png`);
  try {
    await storage().put(storageKey, upload.bytes, upload.contentType);
  } catch (err) {
    return storageUnavailable(err);
  }

  const [file] = await db.insert(formFiles).values({
    orgId: user.orgId,
    submissionId: sub.id,
    questionId,
    kind: question.type === "signature" ? "signature" : "image",
    storageKey,
    filename: upload.file.name || `${question.type}.png`,
    contentType: upload.contentType,
    sizeBytes: upload.file.size,
    uploadedBy: user.id,
  }).returning({ id: formFiles.id, questionId: formFiles.questionId, kind: formFiles.kind, filename: formFiles.filename, contentType: formFiles.contentType, sizeBytes: formFiles.sizeBytes });

  return NextResponse.json({ file }, { status: 201 });
}
