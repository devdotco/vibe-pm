import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { requireServiceAuth } from '@/lib/auth/service';
import { eq, and } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  if (!requireServiceAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = req.nextUrl.searchParams.get('orgId');
  if (!orgId) return NextResponse.json({ error: 'orgId required' }, { status: 400 });
  const rows = await db.select({
    id: projects.id, name: projects.name, color: projects.color,
    status: projects.status, teamId: projects.teamId,
  }).from(projects).where(and(eq(projects.orgId, orgId), eq(projects.status, 'active')));
  return NextResponse.json({ projects: rows });
}
