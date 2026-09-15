import { NextRequest, NextResponse } from "next/server";
import { apiUser, notFound } from "@/lib/forms/api";
import { getSubmission } from "@/lib/forms/service";
import { buildSubmissionPdf } from "@/lib/forms/report";
import { storageUnavailable } from "@/lib/uploads";

/** The report for one submission. Rendered on demand — never stored, so it always matches the answers. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ submissionId: string }> }) {
  const { user, res } = await apiUser();
  if (res) return res;
  const { submissionId } = await params;
  const sub = await getSubmission(user.orgId, submissionId);
  if (!sub) return notFound();

  let pdf;
  try {
    pdf = await buildSubmissionPdf(sub, req.nextUrl.searchParams.get("org"));
  } catch (err) {
    if ((err as Error).name === "StorageNotConfiguredError") return storageUnavailable(err);
    console.error("[forms] pdf failed", sub.id, (err as Error).message);
    return NextResponse.json({ error: "The report could not be built" }, { status: 500 });
  }

  const disposition = req.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline";
  return new NextResponse(pdf.bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${pdf.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
