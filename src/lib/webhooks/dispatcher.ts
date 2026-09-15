import { db } from "@/lib/db";
import { webhookOutbox, projectSettings } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

const MESSAGING_WEBHOOK_URL = process.env.MESSAGING_MODULE_URL
  ? `${process.env.MESSAGING_MODULE_URL}/api/messaging/pm-webhook`
  : "https://chat.vb.co/api/messaging/pm-webhook";

export type PmEventType =
  | "task.created"
  | "task.completed"
  | "task.overdue"
  | "task.assigned"
  | "task.updated"
  | "milestone.reached"
  | "project.completed";

export async function dispatchEvent(payload: {
  eventType: PmEventType;
  orgId: string;
  projectId: string;
  taskId?: string;
  milestoneId?: string;
  triggeredBy?: string;
  data: Record<string, string | undefined>;
}): Promise<void> {
  // projectId alone used to be enough — every caller of dispatchEvent passes
  // its OWN orgId, not one read off the project row, so an event dispatched
  // for the wrong org (see the projects/[projectId] PATCH ordering fix) or a
  // caller that simply got orgId and projectId out of sync would still
  // deliver to whatever org actually owns that projectId.
  const settings = await db
    .select()
    .from(projectSettings)
    .where(and(eq(projectSettings.projectId, payload.projectId), eq(projectSettings.orgId, payload.orgId)));

  for (const setting of settings) {
    if (!setting.messagingChannelId) continue;
    if (!setting.notifyOn.includes(payload.eventType)) continue;

    await db.insert(webhookOutbox).values({
      orgId: payload.orgId,
      eventType: payload.eventType,
      payload: { ...payload, channelId: setting.messagingChannelId },
      targetUrl: MESSAGING_WEBHOOK_URL,
      status: "pending",
    });
  }
}
