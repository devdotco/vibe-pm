import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { COOKIE_NAME, hashToken } from "@/lib/auth/session";
import { BASE_PATH, withBase } from "@/lib/base-path";

/**
 * Sign out of Projects.
 *
 * There was no such route. "Log out" in the sidebar was an anchor to
 * `/sign-in`, which navigated to the sign-in page and left the session cookie
 * exactly where it was — so the next click, or simply going back, put you
 * straight in again. It looked like signing out because the destination looked
 * like signing out.
 *
 * The `path` MUST match the one the cookie was written with. A cookie set at
 * `/pm` is not cleared by a delete at `/`, and the failure is silent: the
 * response carries a Set-Cookie the browser quietly ignores.
 *
 * It also never deleted the `sessions` row — only the cookie that pointed at
 * it. The token kept working: anyone who had it (a copied header, a synced
 * browser, a shared machine somebody clicked "sign out" on) could still sign
 * back in with it after the "signed out" user thought the session was dead.
 */
export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (token) {
    await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  }

  const res = NextResponse.redirect(
    new URL(withBase("/sign-in"), process.env.APP_URL ?? "https://app.erp.io"),
    { status: 303 },
  );
  res.cookies.set(COOKIE_NAME, "", { path: BASE_PATH, maxAge: 0 });
  return res;
}
