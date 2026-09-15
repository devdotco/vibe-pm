import Pusher from "pusher";

export const pusherServer = new Pusher({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.PUSHER_KEY!,
  secret: process.env.PUSHER_SECRET!,
  cluster: process.env.PUSHER_CLUSTER!,
  useTLS: true,
});

/*
 * `private-` prefixed, not plain channel names.
 *
 * Pusher only calls an app's authEndpoint for `private-`/`presence-`
 * channels; anything else is a PUBLIC channel that any client holding the
 * app key can subscribe to directly, no auth call involved at all. These
 * were plain `org-...`/`task-...` names, so /api/pusher/auth's org check
 * was dead code — nothing ever invoked it — and anyone who learned or
 * guessed an org id or task id (both of which appear in URLs) could stream
 * that org's or task's live task payloads.
 */
export function projectChannel(projectId: string, orgId: string) {
  return `private-org-${orgId}-project-${projectId}`;
}

export function channelChannel(channelId: string, orgId: string) {
  return `private-org-${orgId}-channel-${channelId}`;
}

export function taskChannel(taskId: string) {
  return `private-task-${taskId}`;
}

export type ChannelAuthResult =
  | { kind: "org"; authorized: boolean }
  | { kind: "task"; taskId: string }
  | { kind: "unknown" };

/**
 * Pure so /api/pusher/auth's decision is testable without a database: an
 * `org-` channel is authorized by string comparison alone; a `task-` channel
 * names a task, not an org, so the caller has to look ITS org up separately
 * and can't decide from the channel name by itself.
 */
export function classifyChannel(channel: string, callerOrgId: string): ChannelAuthResult {
  if (channel.startsWith(`private-org-${callerOrgId}-`)) return { kind: "org", authorized: true };
  const taskMatch = channel.match(/^private-task-([0-9a-f-]{36})$/);
  if (taskMatch) return { kind: "task", taskId: taskMatch[1]! };
  if (channel.startsWith("private-org-")) return { kind: "org", authorized: false };
  return { kind: "unknown" };
}
