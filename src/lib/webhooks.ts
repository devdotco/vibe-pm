import crypto from "crypto";
import { db } from "@/lib/db";
import { projectChannelLinks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const WEBHOOK_SECRET = process.env.VIBE_WEBHOOK_SECRET ?? "";

export type WebhookEvent =
  | "task.created"
  | "task.updated"
  | "task.completed"
  | "task.commented";

export interface WebhookPayload {
  taskId: string;
  taskTitle: string;
  projectName: string;
  projectId: string;
  actorName: string;
  status?: string;
  priority?: string;
  comment?: string;
}

export async function fireProjectWebhooks(
  projectId: string,
  event: WebhookEvent,
  payload: WebhookPayload
): Promise<void> {
  const links = await db
    .select()
    .from(projectChannelLinks)
    .where(eq(projectChannelLinks.projectId, projectId));

  if (links.length === 0) return;

  const body = JSON.stringify({ event, payload, ts: Date.now() });
  const sig = WEBHOOK_SECRET
    ? crypto.createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex")
    : "";

  await Promise.allSettled(
    links.map((link) =>
      fetch(link.webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(sig ? { "X-Vibe-Signature": sig } : {}),
        },
        body,
      }).catch(() => {})
    )
  );
}

export function verifyWebhookSignature(body: string, signature: string): boolean {
  if (!WEBHOOK_SECRET) return true; // skip in dev if no secret set
  const expected = crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(body)
    .digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(signature, "hex")
  );
}
