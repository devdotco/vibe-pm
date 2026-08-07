import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { goals, goalProjectLinks } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { eq, and } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ goalId: string }> }
) {
  const user = await requireUser();
  const { goalId } = await params;
  const [goal] = await db.select({ id: goals.id }).from(goals)
    .where(and(eq(goals.id, goalId), eq(goals.orgId, user.orgId)));
  if (!goal) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const links = await db.select().from(goalProjectLinks)
    .where(eq(goalProjectLinks.goalId, goalId));
  return NextResponse.json({ links });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ goalId: string }> }
) {
  const user = await requireUser();
  const { goalId } = await params;
  const { projectId } = await req.json();
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
  const [goal] = await db.select({ id: goals.id }).from(goals)
    .where(and(eq(goals.id, goalId), eq(goals.orgId, user.orgId)));
  if (!goal) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [link] = await db.insert(goalProjectLinks)
    .values({ goalId, projectId, orgId: user.orgId })
    .onConflictDoNothing()
    .returning();
  return NextResponse.json({ link: link ?? null }, { status: 201 });
}
