import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { sessions, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

const COOKIE_NAME = "__vibe_session";
const MESSAGING_URL = process.env.MESSAGING_MODULE_URL ?? "https://chat.vb.co";

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  // 1. Try local DB first
  const [row] = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.tokenHash, hashToken(token)))
    .limit(1);

  if (row && row.user.status === "active") return row.user;

  // 2. Fall back: validate against messaging app (cross-app SSO)
  try {
    const res = await fetch(`${MESSAGING_URL}/api/messaging/users/me`, {
      headers: { cookie: `${COOKIE_NAME}=${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json() as { id: string; email: string; name: string; orgId: string; status: string };
    if (!data?.id || data.status !== "active") return null;

    // Upsert user locally so future requests hit local DB
    const existing = await db.select().from(users).where(eq(users.email, data.email)).limit(1);
    let localUser = existing[0];
    if (!localUser) {
      [localUser] = await db.insert(users).values({
        id: data.id,
        orgId: data.orgId,
        email: data.email,
        name: data.name,
        status: "active",
      }).onConflictDoNothing().returning();
    }
    if (!localUser) {
      // id conflict — fetch by id
      [localUser] = await db.select().from(users).where(eq(users.id, data.id)).limit(1);
    }
    if (!localUser) return null;

    // Create local session so next request is fast
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await db.insert(sessions).values({
      userId: localUser.id,
      tokenHash: hashToken(token),
      expiresAt,
    }).onConflictDoNothing();

    return localUser;
  } catch {
    return null;
  }
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthenticated");
  return user;
}
