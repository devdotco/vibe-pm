import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME } from "@/lib/auth/session";
import { stripBase, withBase } from "@/lib/base-path";

const PUBLIC = [
  // The shell redirects here with a hand-off token. Gating it would bounce the
  // token to /sign-in and the SSO round-trip could never complete.
  "/api/auth/callback",
  "/api/auth/magic",
  "/api/auth/send-magic",
  "/api/auth/verify",
  "/sign-in",
  "/api/pm/public",
  "/api/pm/webhook",
  "/api/pm/cron",
  "/api/health",
  "/api/pusher",
  "/api/webhooks/email/inbound",
];

export function proxy(req: NextRequest) {
  /*
   * Match the list above WITHOUT the mount.
   *
   * The app is served from app.erp.io/pm, and `/pm/sign-in` does not start with
   * `/sign-in` — so every public path above would have become private at once,
   * including the SSO callback, which would have bounced the hand-off token to
   * a sign-in that itself required signing in.
   *
   * Stripped rather than prefixed because Next has shipped `nextUrl.pathname`
   * both with and without the basePath; `stripBase` is a no-op on the form that
   * arrives already stripped, so this is correct either way.
   */
  const path = stripBase(req.nextUrl.pathname);
  const isPublic = PUBLIC.some((p) => path.startsWith(p));
  if (isPublic) return NextResponse.next();
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'app.erp.io';
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  /*
   * withBase, because Next strips the mount from `nextUrl.pathname`.
   *
   * Without it this built https://app.erp.io/home — the SHELL's home, not this
   * app's — and handed it to the sign-in form as `next=`. Signing in then
   * bounced the person out of Projects into the shell, which looks like the
   * sign-in silently failing to take them where they were going.
   *
   * withBase is idempotent, so this is right whichever form Next hands us.
   */
  const publicUrl = `${proto}://${host}${withBase(req.nextUrl.pathname)}${req.nextUrl.search}`;

  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    /*
     * Send people to THIS app's sign-in, not to the shell.
     *
     * A previous revision redirected every signed-out visitor to app.vb.co to
     * pick up a hand-off token. That is right for anyone with a shell account
     * and wrong for everyone else: Projects is also used by people who were
     * invited straight to a board and sign in with a magic link, and they have
     * no app.vb.co account to be handed off from. Bouncing them to the shell
     * locked them out of a tool they had every right to open.
     *
     * So the local sign-in stays the default, and it offers "Continue with
     * erp.io" for people who do have a shell account. SSO from the dashboard is
     * unaffected — those links already point at the hand-off endpoint, which
     * lands on /api/auth/callback above.
     */
    return NextResponse.redirect(
      // withBase: an app-absolute path resolved against the ORIGIN replaces the
      // whole pathname, so this would land on the shell's sign-in.
      new URL(withBase(`/sign-in?next=${encodeURIComponent(publicUrl)}`), `${proto}://${host}`)
    );
  }

  // Pass the full URL as a request header so server layouts can build ?next= for expired-session redirects
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-url', publicUrl);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
