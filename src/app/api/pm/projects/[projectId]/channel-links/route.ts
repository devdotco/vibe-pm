import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projectChannelLinks } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { eq, and } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const user = await requireUser();
  const { projectId } = await params;
  const links = await db
    .select()
    .from(projectChannelLinks)
    .where(
      and(
        eq(projectChannelLinks.projectId, projectId),
        eq(projectChannelLinks.orgId, user.orgId)
      )
    );
  return NextResponse.json({ links });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const user = await requireUser();
  const { projectId } = await params;
  const { channelId, channelName, webhookUrl } = await req.json() as {
    channelId: string;
    channelName: string;
    webhookUrl: string;
  };

  if (!channelId || !channelName || !webhookUrl) {
    return NextResponse.json(
      { error: "channelId, channelName, and webhookUrl are required" },
      { status: 400 }
    );
  }

  const [link] = await db
    .insert(projectChannelLinks)
    .values({
      orgId: user.orgId,
      projectId,
      channelId,
      channelName,
      webhookUrl,
    })
    .onConflictDoUpdate({
      target: [projectChannelLinks.projectId, projectChannelLinks.channelId],
      set: { channelName, webhookUrl },
    })
    .returning();

  return NextResponse.json({ link }, { status: 201 });
}
