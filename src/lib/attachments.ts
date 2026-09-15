import { withBase } from "@/lib/base-path";

/**
 * The permanent URL of a task attachment.
 *
 * It is pasted into comments and descriptions as markdown, so it must keep
 * resolving for as long as the comment exists — never a presigned R2 URL,
 * which expires. The files route checks the caller's org and then redirects.
 *
 * `<attachmentId>__<name>` addresses one row exactly. Rows from before 0005
 * used the bare filename, which the route still resolves by (task, filename).
 */
export const ATTACHMENT_ID_SEPARATOR = "__";

export function attachmentFileUrl(taskId: string, attachmentId: string, safeName: string): string {
  const origin = appOrigin();
  return `${origin}${withBase(`/api/pm/tasks/${taskId}/attachments/files/${attachmentId}${ATTACHMENT_ID_SEPARATOR}${safeName}`)}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Split a files-route segment into the attachment id, if it carries one. */
export function parseAttachmentSegment(segment: string): { attachmentId: string | null; filename: string } {
  const i = segment.indexOf(ATTACHMENT_ID_SEPARATOR);
  if (i > 0 && UUID.test(segment.slice(0, i))) {
    return { attachmentId: segment.slice(0, i), filename: segment.slice(i + ATTACHMENT_ID_SEPARATOR.length) };
  }
  return { attachmentId: null, filename: segment };
}

/**
 * The public origin, never the mount — APP_URL is `https://app.erp.io/pm`, and
 * the mount is added back with withBase (see the long note in
 * api/auth/callback/route.ts on why resolving against APP_URL breaks).
 */
export function appOrigin(): string {
  const configured = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (configured) {
    try { return new URL(configured).origin; } catch { /* fall through */ }
  }
  return "https://app.erp.io";
}
