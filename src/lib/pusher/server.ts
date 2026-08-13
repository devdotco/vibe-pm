import Pusher from "pusher";

export const pusherServer = new Pusher({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.PUSHER_KEY!,
  secret: process.env.PUSHER_SECRET!,
  cluster: process.env.PUSHER_CLUSTER!,
  useTLS: true,
});

export function projectChannel(projectId: string, orgId: string) {
  return `org-${orgId}-project-${projectId}`;
}

export function channelChannel(channelId: string, orgId: string) {
  return `org-${orgId}-channel-${channelId}`;
}

export function taskChannel(taskId: string) {
  return `task-${taskId}`;
}
