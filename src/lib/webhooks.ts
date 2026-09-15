import crypto from "crypto";
import { db } from "@/lib/db";
import { projectChannelLinks } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

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
  orgId: string,
  projectId: string,
  event: WebhookEvent,
  payload: WebhookPayload
): Promise<void> {
  // Scoped to the caller's org, not just the projectId. Without this, a
  // channel link planted on another tenant's project id (see the
  // channel-links POST fix) would still fire — the projectId alone doesn't
  // prove the link belongs to whoever is triggering the event.
  const links = await db
    .select()
    .from(projectChannelLinks)
    .where(and(eq(projectChannelLinks.projectId, projectId), eq(projectChannelLinks.orgId, orgId)));

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

/**
 * This used to `return true` when no secret was configured — "skip in dev" —
 * which is also what production looks like the moment VIBE_WEBHOOK_SECRET is
 * unset or misspelled in the deploy env. Combined with this route sitting on
 * the proxy's public list, that turned a missing env var into "anyone can
 * create a task in any project with no signature at all." An unset secret now
 * fails every signature instead of none.
 */
export function verifyWebhookSignature(body: string, signature: string): boolean {
  if (!WEBHOOK_SECRET) return false;
  const expected = crypto.createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  // Buffer.from(str, 'hex') silently truncates instead of throwing on
  // non-hex input, so a garbage header decodes to *some* buffer — but
  // timingSafeEqual throws the moment the two lengths differ, which a
  // malformed or short header does almost every time. Checking the length
  // first turns that crash into an ordinary "no".
  const sigBuf = Buffer.from(signature, "hex");
  if (sigBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, sigBuf);
}

const PRIVATE_HOST_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  // Link-local, including the 169.254.169.254 cloud metadata endpoint.
  /^169\.254\./,
  /^::1$/,
  /^\[?::1\]?$/,
  /^fe80:/i,
  /\.local$/i,
];

/**
 * A channel link's webhookUrl used to go straight into `fetch()` with
 * whatever a project member pasted. A link pointed at
 * `http://169.254.169.254/latest/meta-data/...` or `http://localhost:5432`
 * would have made this server fetch it on the attacker's behalf and, since
 * the response is never returned to the caller, that alone isn't enough to
 * exfiltrate anything here — but it IS enough to probe internal services and
 * cloud metadata from outside. https-only plus this host check closes that
 * off. It is a literal-hostname check, not a DNS lookup: it does not defend
 * against a hostname that resolves to a private address only after this
 * check runs (DNS rebinding).
 */
export function isSafeWebhookUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname;
  return !PRIVATE_HOST_PATTERNS.some((p) => p.test(host));
}
