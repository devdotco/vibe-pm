import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { goalProjectLinks } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { eq, and } from "drizzle-orm";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ goalId: string; linkId: string }> }
) {
  const user = await requireUser();
  const { linkId } = await params;
  await db.delete(goalProjectLinks)
    .where(and(eq(goalProjectLinks.id, linkId), eq(goalProjectLinks.orgId, user.orgId)));
  return NextResponse.json({ success: true });
}
