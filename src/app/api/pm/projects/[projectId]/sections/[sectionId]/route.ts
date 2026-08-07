import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sections } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { eq, and } from "drizzle-orm";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; sectionId: string }> }
) {
  const user = await requireUser();
  const { sectionId } = await params;
  const body = await req.json();
  const allowed = ["name", "color", "position"] as const;
  const patch: Partial<{ name: string; color: string | null; position: number }> = {};
  for (const key of allowed) {
    if (key in body) (patch as Record<string, unknown>)[key] = body[key];
  }
  if (Object.keys(patch).length === 0)
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  const [section] = await db
    .update(sections)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(sections.id, sectionId), eq(sections.orgId, user.orgId)))
    .returning();
  if (!section) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ section });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; sectionId: string }> }
) {
  const user = await requireUser();
  const { sectionId } = await params;
  const [section] = await db
    .update(sections)
    .set({ isArchived: true, updatedAt: new Date() })
    .where(and(eq(sections.id, sectionId), eq(sections.orgId, user.orgId)))
    .returning();
  if (!section) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
