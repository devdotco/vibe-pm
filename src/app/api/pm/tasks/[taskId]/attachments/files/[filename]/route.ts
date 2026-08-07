import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ taskId: string; filename: string }> }
) {
  const { taskId, filename } = await params;
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = path.join("/tmp/vibe-uploads", taskId, safeFilename);

  try {
    const buffer = await readFile(filePath);
    return new NextResponse(buffer, {
      headers: {
        "Content-Disposition": `attachment; filename="${safeFilename}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
