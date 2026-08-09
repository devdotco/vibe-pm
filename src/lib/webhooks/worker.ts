import { db } from "@/lib/db";
import { webhookOutbox } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

const INTER_SERVICE_SECRET = process.env.INTER_SERVICE_SECRET ?? "";
const MAX_ATTEMPTS = 5;

function signPayload(payload: string, secret: string): string {
  return "sha256=" + crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export async function processWebhookOutbox(): Promise<{ processed: number; failed: number }> {
  const pending = await db
    .select()
    .from(webhookOutbox)
    .where(eq(webhookOutbox.status, "pending"))
    .limit(50);

  let processed = 0;
  let failed = 0;

  for (const row of pending) {
    try {
      const body = JSON.stringify(row.payload);
      const signature = signPayload(body, INTER_SERVICE_SECRET);
      const res = await fetch(row.targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${INTER_SERVICE_SECRET}`,
          "X-Vibe-Signature": signature,
        },
        body,
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok) {
        await db
          .update(webhookOutbox)
          .set({ status: "sent", sentAt: new Date() })
          .where(eq(webhookOutbox.id, row.id));
        processed++;
      } else {
        await handleFailure(row);
        failed++;
      }
    } catch {
      await handleFailure(row);
      failed++;
    }
  }

  return { processed, failed };
}

async function handleFailure(row: { id: string; attempts: number }) {
  const attempts = row.attempts + 1;
  const status = attempts >= MAX_ATTEMPTS ? "failed" : "pending";
  await db
    .update(webhookOutbox)
    .set({ status, attempts, lastAttemptedAt: new Date() })
    .where(eq(webhookOutbox.id, row.id));
}
