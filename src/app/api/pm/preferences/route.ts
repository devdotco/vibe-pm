import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { userPreferences } from '@/lib/db/schema';
import type { SavedUserPreferences } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { eq } from 'drizzle-orm';

const DEFAULTS: SavedUserPreferences = {
  hiddenSections: [],
  hideCompletedProjects: false,
};

export async function GET() {
  const user = await requireUser();
  const [row] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, user.id))
    .limit(1);

  const prefs: SavedUserPreferences = row
    ? { ...DEFAULTS, ...(row.preferences as Partial<SavedUserPreferences>) }
    : DEFAULTS;

  return NextResponse.json({ preferences: prefs }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PUT(req: NextRequest) {
  const user = await requireUser();
  const body = await req.json() as Partial<SavedUserPreferences>;

  const [existing] = await db
    .select({ id: userPreferences.id, preferences: userPreferences.preferences })
    .from(userPreferences)
    .where(eq(userPreferences.userId, user.id))
    .limit(1);

  const merged: SavedUserPreferences = {
    ...DEFAULTS,
    ...(existing ? (existing.preferences as Partial<SavedUserPreferences>) : {}),
    ...body,
  };

  if (existing) {
    await db
      .update(userPreferences)
      .set({ preferences: merged, updatedAt: new Date() })
      .where(eq(userPreferences.userId, user.id));
  } else {
    await db.insert(userPreferences).values({
      userId: user.id,
      orgId: user.orgId,
      preferences: merged,
    });
  }

  return NextResponse.json({ preferences: merged });
}
