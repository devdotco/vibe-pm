import { NextRequest, NextResponse } from 'next/server';
import { requireCronAuth } from '@/lib/auth/service';
import { processWebhookOutbox } from '@/lib/webhooks/worker';

export async function GET(req: NextRequest) {
  if (!requireCronAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const result = await processWebhookOutbox();
  return NextResponse.json(result);
}
