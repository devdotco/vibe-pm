import { NextRequest, NextResponse } from 'next/server';
import { pusherServer, classifyChannel } from '@/lib/pusher/server';
import { getCurrentUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { tasks } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.text();
  const params = new URLSearchParams(body);
  const socketId = params.get('socket_id') ?? '';
  const channel = params.get('channel_name') ?? '';

  // Two channel shapes, two ways of proving the caller belongs on them: an
  // `org-` channel names the org right there in the string; a `task-`
  // channel names a task, so its org has to be looked up. This used to check
  // only the org-shaped prefix, which meant a task channel could never be
  // authorized at all (every subscription 403'd) until it was also made
  // private (see pusher/server.ts) — plain channels need no auth call, so
  // the bug was silent: the client just connected anyway, unauthenticated.
  const classified = classifyChannel(channel, user.orgId);
  let authorized = false;
  if (classified.kind === 'org') {
    authorized = classified.authorized;
  } else if (classified.kind === 'task') {
    const [task] = await db.select({ orgId: tasks.orgId }).from(tasks)
      .where(eq(tasks.id, classified.taskId)).limit(1);
    authorized = task?.orgId === user.orgId;
  }

  if (!authorized) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const auth = pusherServer.authorizeChannel(socketId, channel);
  return NextResponse.json(auth);
}
