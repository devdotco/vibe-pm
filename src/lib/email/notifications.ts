import sgMail from '@sendgrid/mail';
import crypto from 'crypto';

// SendGrid requires { email, name } object — not "Name <email>" string format
function parseFrom(s: string): { email: string; name?: string } {
  const m = s.match(/^(.+?)\s*<([^>]+)>$/);
  return m ? { name: m[1].trim(), email: m[2].trim() } : { email: s.trim() };
}
const FROM = parseFrom(process.env.EMAIL_FROM ?? 'erp.io PM <notifications@vb.co>');
const REPLY_DOMAIN = process.env.EMAIL_REPLY_DOMAIN ?? 'reply.vb.co';
/*
 * No fallback. `?? 'dev-secret'` meant every deploy that forgot to set
 * EMAIL_REPLY_SECRET — or had it typo'd in the env — signed reply addresses
 * with a literal string that ships in this repo. Anyone who read it could
 * compute a valid `reply+t-<taskId>-<token>@...` for ANY task id and forge an
 * inbound reply as anyone, bypassing the inbound route's provider check
 * entirely (see the fail-closed check in verifyReplyAddress below, and the
 * per-branch secret check added to the inbound route).
 */
const REPLY_SECRET = process.env.EMAIL_REPLY_SECRET ?? '';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.erp.io/pm';

export function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatCommentHtml(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let inUl = false;
  let inOl = false;

  const closeList = () => {
    if (inUl) { out.push("</ul>"); inUl = false; }
    if (inOl) { out.push("</ol>"); inOl = false; }
  };

  const linkify = (s: string) =>
    escapeHtml(s).replace(
      /https?:\/\/[^\s<>"]+/g,
      url => `<a href="${url}" style="color:#2563eb">${url}</a>`
    );

  const inlineFormat = (s: string) =>
    linkify(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/@(\w+)/g, '<strong style="color:#2563eb">@$1</strong>');

  for (const raw of lines) {
    const bullet = raw.match(/^[-*]\s+(.*)$/);
    const numbered = raw.match(/^\d+\.\s+(.*)$/);
    if (bullet) {
      if (!inUl) { closeList(); out.push('<ul style="margin:6px 0;padding-left:20px">'); inUl = true; }
      out.push(`<li style="margin:2px 0">${inlineFormat(bullet[1]!)}</li>`);
    } else if (numbered) {
      if (!inOl) { closeList(); out.push('<ol style="margin:6px 0;padding-left:20px">'); inOl = true; }
      out.push(`<li style="margin:2px 0">${inlineFormat(numbered[1]!)}</li>`);
    } else {
      closeList();
      const trimmed = raw.trim();
      if (trimmed === "") {
        out.push('<br>');
      } else {
        out.push(`<p style="margin:4px 0;word-break:break-word">${inlineFormat(raw)}</p>`);
      }
    }
  }
  closeList();
  return out.join("\n");
}

function replyToken(type: string, entityId: string, recipientEmail: string) {
  return crypto.createHmac('sha256', REPLY_SECRET)
    .update(`${type}:${entityId}:${recipientEmail}`)
    .digest('hex').slice(0, 16);
}

// Single-char type codes keep local part ≤64 chars (RFC 5321 limit)
const TYPE_ENCODE: Record<string, string> = { task: 't', project: 'p' };
const TYPE_DECODE: Record<string, string> = { t: 'task', p: 'project' };

function replyAddress(type: string, entityId: string, recipientEmail: string) {
  const code = TYPE_ENCODE[type] ?? type[0]!;
  const shortId = entityId.replace(/-/g, ''); // UUID without dashes: 32 chars
  return `reply+${code}-${shortId}-${replyToken(type, entityId, recipientEmail)}@${REPLY_DOMAIN}`;
}

function restoreUuid(s: string) {
  return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`;
}

export function verifyReplyAddress(toAddress: string, fromEmail: string): { type: string; entityId: string } | null {
  // No secret configured means no token was ever computed with real entropy
  // (see REPLY_SECRET above) — refuse to verify anything rather than compare
  // against a value every reply address in this state would also have been
  // signed with.
  if (!REPLY_SECRET) return null;
  const match = toAddress.match(/reply\+([a-z])-([0-9a-f]{32})-([0-9a-f]{16})@/);
  if (!match) return null;
  const [, code, shortId, token] = match;
  const type = TYPE_DECODE[code!] ?? code!;
  const entityId = restoreUuid(shortId!);
  const expected = replyToken(type, entityId, fromEmail);
  if (expected !== token) return null;
  return { type, entityId };
}

export function stripQuotedReply(text: string): string {
  const patterns = [
    /\r?\n--[ \t]*\r?\n/,                          // RFC 3676 signature delimiter: -- on its own line
    /\r?\nOn .{5,100} wrote:\r?\n/,                 // Gmail/Outlook quote header
    /\r?\n[-_]{3,} *Original Message *[-_]{3,}/i,   // Outlook original message
    /\r?\nFrom: .+/,                                // bare From: line
    /\r?\n>[ \t]/,                                  // quoted text
    /\r?\nSent from my /i,                          // mobile signature
    /\r?\nGet Outlook for /i,                       // Outlook mobile
  ];
  let cutAt = text.length;
  for (const p of patterns) {
    const m = text.search(p);
    if (m > 0 && m < cutAt) cutAt = m;
  }
  return text.slice(0, cutAt).trim();
}

export interface TaskNotificationData {
  taskId: string;
  taskTitle: string;
  projectName: string;
  taskUrl?: string;
  recipientEmail: string;
  recipientName: string;
  actorName: string;
  commentText?: string;
}

async function sendNotification(to: string, subject: string, html: string, replyTo: string) {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) return;
  sgMail.setApiKey(apiKey);
  await sgMail.send({ from: FROM, to, subject, html, replyTo }).catch(console.error);
}

function taskUrl(taskId: string) {
  return `${APP_URL}/tasks/${taskId}`;
}

/*
 * taskTitle/actorName/projectName all come from user-editable data (a task
 * title, a display name, a project name) and used to go straight into the
 * HTML body unescaped. A title like `<img src=x onerror=...>` would have run
 * in whatever mail client rendered it. formatCommentHtml already escapes
 * commentText line by line; these three needed the same treatment at the
 * call site.
 */
export async function sendTaskAssignedEmail(data: TaskNotificationData) {
  const url = data.taskUrl ?? taskUrl(data.taskId);
  const replyTo = replyAddress('task', data.taskId, data.recipientEmail);
  const taskTitle = escapeHtml(data.taskTitle);
  const actorName = escapeHtml(data.actorName);
  const projectName = escapeHtml(data.projectName);
  await sendNotification(
    data.recipientEmail,
    `You've been assigned: ${data.taskTitle}`,
    `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <h2 style="font-size:18px;margin-bottom:8px">New task assigned</h2>
      <p style="color:#666;margin-bottom:16px">${actorName} assigned you a task in <strong>${projectName}</strong>:</p>
      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:16px">
        <strong style="font-size:16px">${taskTitle}</strong>
      </div>
      <a href="${url}" style="display:inline-block;background:#2563eb;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600">View task</a>
      <p style="color:#9ca3af;font-size:12px;margin-top:24px">Reply to this email to leave a comment on the task without logging in.</p>
    </div>`,
    replyTo
  );
}

export async function sendTaskMentionEmail(data: TaskNotificationData) {
  const url = data.taskUrl ?? taskUrl(data.taskId);
  const replyTo = replyAddress('task', data.taskId, data.recipientEmail);
  const taskTitle = escapeHtml(data.taskTitle);
  const actorName = escapeHtml(data.actorName);
  const projectName = escapeHtml(data.projectName);
  await sendNotification(
    data.recipientEmail,
    `${data.actorName} mentioned you in: ${data.taskTitle}`,
    `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <h2 style="font-size:18px;margin-bottom:8px">You were mentioned</h2>
      <p style="color:#666;margin-bottom:16px">${actorName} mentioned you in <strong>${projectName}</strong>:</p>
      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:16px">
        <strong style="font-size:16px;display:block;margin-bottom:8px">${taskTitle}</strong>
        ${data.commentText ? `<div style="color:#374151;font-size:14px;line-height:1.6">${formatCommentHtml(data.commentText)}</div>` : ''}
      </div>
      <a href="${url}" style="display:inline-block;background:#2563eb;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600">View task</a>
      <p style="color:#9ca3af;font-size:12px;margin-top:24px">Reply to this email to respond without logging in.</p>
    </div>`,
    replyTo
  );
}

export async function sendTaskCommentEmail(data: TaskNotificationData) {
  const url = data.taskUrl ?? taskUrl(data.taskId);
  const replyTo = replyAddress('task', data.taskId, data.recipientEmail);
  const taskTitle = escapeHtml(data.taskTitle);
  const actorName = escapeHtml(data.actorName);
  const projectName = escapeHtml(data.projectName);
  await sendNotification(
    data.recipientEmail,
    `New comment on: ${data.taskTitle}`,
    `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <h2 style="font-size:18px;margin-bottom:8px">New comment</h2>
      <p style="color:#666;margin-bottom:16px">${actorName} commented on a task in <strong>${projectName}</strong>:</p>
      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:16px">
        <strong style="font-size:16px;display:block;margin-bottom:8px">${taskTitle}</strong>
        ${data.commentText ? `<blockquote style="border-left:3px solid #2563eb;padding-left:12px;color:#374151;margin:0;font-size:14px;line-height:1.6">${formatCommentHtml(data.commentText)}</blockquote>` : ''}
      </div>
      <a href="${url}" style="display:inline-block;background:#2563eb;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600">View task</a>
      <p style="color:#9ca3af;font-size:12px;margin-top:24px">Reply to this email to respond without logging in.</p>
    </div>`,
    replyTo
  );
}
