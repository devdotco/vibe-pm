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
     * Hand off to the shell rather than showing a local sign-in form.
     *
     * app.vb.co is the identity authority for the suite: if the person is
     * already signed in there, it mints a short-lived token, redirects to
     * /api/auth/callback above, and they arrive here signed in without typing
     * anything. If they are not, the shell shows its own sign-in and sends
     * them back. Either way there is one login for the whole suite, which is
     * the point.
     *
     * No loop: the shell only ever redirects back with a token, to its own
     * sign-in, or to its module settings when the org is not entitled to
     * Projects. /sign-in here stays reachable for magic-link recipients.
     */
    const shell = (process.env.SHELL_URL ?? "https://app.vb.co").replace(/\/$/, "");
    const handoff = `${shell}/api/shell/auth/module-token?aud=pm&next=${encodeURIComponent(
      req.nextUrl.pathname + req.nextUrl.search
    )}`;
    return NextResponse.redirect(handoff);
  }

  // Pass the full URL as a request header so server layouts can build ?next= for expired-session redirects
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-url', publicUrl);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
