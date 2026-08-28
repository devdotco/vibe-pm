import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME } from "@/lib/auth/session";

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
  const isPublic = PUBLIC.some((p) => req.nextUrl.pathname.startsWith(p));
  if (isPublic) return NextResponse.next();
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'pm.vb.co';
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  const publicUrl = `${proto}://${host}${req.nextUrl.pathname}${req.nextUrl.search}`;

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
     * ViBe" for people who do have a shell account. SSO from the dashboard is
     * unaffected — those links already point at the hand-off endpoint, which
     * lands on /api/auth/callback above.
     */
    return NextResponse.redirect(
      new URL(`/sign-in?next=${encodeURIComponent(publicUrl)}`, `${proto}://${host}`)
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
