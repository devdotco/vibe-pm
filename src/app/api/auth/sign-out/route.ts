import { NextResponse } from "next/server";
import { COOKIE_NAME } from "@/lib/auth/session";
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
 */
export async function POST() {
  const res = NextResponse.redirect(
    new URL(withBase("/sign-in"), process.env.APP_URL ?? "https://app.erp.io"),
    { status: 303 },
  );
  res.cookies.set(COOKIE_NAME, "", { path: BASE_PATH, maxAge: 0 });
  return res;
}
