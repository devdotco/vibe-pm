import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projectChannelLinks } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { eq, and } from "drizzle-orm";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; linkId: string }> }
) {
  const user = await requireUser();
  const { linkId } = await params;
  await db
    .delete(projectChannelLinks)
    .where(
      and(
        eq(projectChannelLinks.id, linkId),
        eq(projectChannelLinks.orgId, user.orgId)
      )
    );
  return NextResponse.json({ success: true });
}
