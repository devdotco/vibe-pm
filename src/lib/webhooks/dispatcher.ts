import { db } from "@/lib/db";
import { webhookOutbox, projectSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const MESSAGING_WEBHOOK_URL = process.env.MESSAGING_MODULE_URL
  ? `${process.env.MESSAGING_MODULE_URL}/api/messaging/pm-webhook`
  : "https://messaging.vb.co/api/messaging/pm-webhook";

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
  const settings = await db
    .select()
    .from(projectSettings)
    .where(eq(projectSettings.projectId, payload.projectId));

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
