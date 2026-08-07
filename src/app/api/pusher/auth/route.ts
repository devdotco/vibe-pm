import { NextRequest, NextResponse } from 'next/server';
import { pusherServer } from '@/lib/pusher/server';
import { getCurrentUser } from '@/lib/auth/session';

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.text();
  const params = new URLSearchParams(body);
  const socketId = params.get('socket_id') ?? '';
  const channel = params.get('channel_name') ?? '';
  if (!channel.startsWith(`org-${user.orgId}-`)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const auth = pusherServer.authorizeChannel(socketId, channel);
  return NextResponse.json(auth);
}
