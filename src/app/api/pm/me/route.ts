import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/session';

export async function GET() {
  const user = await requireUser();
  return NextResponse.json({ id: user.id, name: user.name, email: user.email });
}
