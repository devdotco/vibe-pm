import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projectChannelLinks, projects } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { isSafeWebhookUrl } from "@/lib/webhooks";
import { eq, and, sql } from "drizzle-orm";

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

  // The project must be the caller's own. Without this, a channel link — and
  // the webhookUrl that goes with it — could be planted on ANY project id,
  // and fireProjectWebhooks would start POSTing that project's task activity
  // to a URL someone in a different org chose.
  const [project] = await db.select({ id: projects.id }).from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.orgId, user.orgId))).limit(1);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

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

  // webhookUrl used to go straight into fetch() unvalidated. Require https
  // and reject loopback/private/link-local hosts so this can't be pointed at
  // an internal service or the cloud metadata endpoint.
  if (!isSafeWebhookUrl(webhookUrl)) {
    return NextResponse.json(
      { error: "webhookUrl must be https and cannot target a private, loopback, or link-local host" },
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
      // Belt and suspenders: even with the ownership check above, the UPDATE
      // half of this upsert only ever applies to a row already in the
      // caller's org.
      setWhere: sql`${projectChannelLinks.orgId} = ${user.orgId}`,
    })
    .returning();

  return NextResponse.json({ link }, { status: 201 });
}
