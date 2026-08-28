import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { sessions, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

/**
 * This app's own session cookie.
 *
 * Deliberately NOT the suite's `__vibe_session`, and deliberately host-scoped.
 * It used to be both: the same name, set on `.vb.co`. The shell stores an
 * iron-session encrypted blob under that name on the same domain, and this app
 * stores an opaque token hashed into its own `sessions` table — so the two
 * overwrote each other. Signing in here silently signed you out of app.vb.co
 * and every other module, and signing in there left this app reading the
 * shell's blob, hashing it, finding no row, and calling you a stranger. That
 * is exactly why pm.vb.co would not log anyone in from the dashboard.
 *
 * Same fix, and the same reasoning, as `__sdr_session` in sdr-vb-co.
 */
export const COOKIE_NAME = "__vibe_pm_session";

/** Long enough to feel persistent, short enough to expire an abandoned laptop. */
export const SESSION_TTL_SECONDS = 90 * 24 * 60 * 60;

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const [row] = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.tokenHash, hashToken(token)))
    .limit(1);

  if (row?.user.status === "active") return row.user;
  return null;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthenticated");
  return user;
}

/**
 * Issue a session for a user and return the raw token for the caller to set as
 * a cookie. Only the hash is stored, so a database leak does not hand anyone a
 * usable session.
 */
export async function createSessionToken(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  await db.insert(sessions).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000),
  });
  return token;
}

/**
 * The cookie options every session cookie must use.
 *
 * No `domain`: host-scoped to pm.vb.co on purpose. A `.vb.co` cookie is what
 * let this app and the shell tread on each other.
 */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
  };
}
