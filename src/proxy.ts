import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME } from "@/lib/auth/session";
import { stripBase, withBase } from "@/lib/base-path";

const PUBLIC = [
  // The shell redirects here with a hand-off token. Gating it would bounce the
  // token to /sign-in and the SSO round-trip could never complete.
  // The cross-module link endpoint. A DATA call, never a navigation — so it
  // must never be answered with a redirect. Left private, the proxy sent the
  // CRM's server-to-server fetch off to the SSO hand-off, `fetch` followed it,
  // and the caller got a sign-in page with a 200 on it. `res.json()` then threw
  // and the whole thing surfaced as "no results", which looks like an empty
  // workspace rather than a redirect.
  //
  // Safe to exempt: the route authenticates with this module's own session and
  // returns an empty list when there is none. It is fail-closed on its own.
  "/api/module-links",
  "/api/auth/callback",
  "/api/auth/send-magic",
  "/api/auth/verify",
  "/sign-in",
  "/api/pm/public",
  // Inter-service bridge, gated by requireServiceAuth's bearer secret, not a
  // session cookie — callers here have no PM session to send.
  "/api/pm/webhook",
  // The messaging bot's HMAC-signed webhook. A DIFFERENT route from the one
  // above (plural "webhooks", singular "webhook") that used to ride along as
  // a side effect of `startsWith("/api/pm/webhook")` matching its prefix too.
  // That was never a deliberate exemption — it happened to work, right up
  // until verifyWebhookSignature's fail-open bug (see src/lib/webhooks.ts)
  // turned "reachable without a session" into "reachable without a
  // signature." It stays public because it has to (the sender has no PM
  // session either), but now it is its own line, not a coincidence.
  "/api/pm/webhooks/messaging",
  "/api/pm/cron",
  "/api/health",
  "/api/pusher",
  "/api/webhooks/email/inbound",
];

/*
 * Exact match, or the start of a path segment — never a bare substring.
 *
 * `startsWith` alone means every entry is also a prefix of anything spelled
 * the same way with more path after it, INCLUDING more path that was never
 * meant to be covered: "/api/pm/webhook" (singular, bearer-token gated) is a
 * literal prefix of "/api/pm/webhooks/messaging" (plural, HMAC-gated), so the
 * old check waved the second one through as a side effect of listing the
 * first. Requiring the next character to be "/" (or nothing) closes that
 * without having to enumerate every accidental collision by hand.
 */
export function isPublicPath(path: string): boolean {
  return PUBLIC.some((p) => path === p || path.startsWith(`${p}/`));
}

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
  if (isPublicPath(path)) return NextResponse.next();
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
  /*
   * FAST PATH. Signed in to the suite but not yet to this module: go straight
   * through the hand-off rather than showing a local sign-in.
   *
   * Only possible since the modules were collapsed onto one origin — the
   * shell's cookie is scoped to app.erp.io, so it now arrives with this
   * request. On the old subdomain it never did, which is why every module
   * switch had to start from the shell and cost three round trips.
   *
   * The local sign-in still stands for anyone with no shell session at all —
   * people invited straight to a board or a document, who have no erp.io
   * account to be handed off from.
   *
   * `next` is the UNMOUNTED path: the module's callback adds the mount back
   * with withBase, and sign-erp's withBase is deliberately not idempotent.
   */
  if (req.cookies.get("__vibe_session")?.value) {
    const shell = (process.env.SHELL_URL ?? "https://app.erp.io").replace(/\/$/, "");
    const handoff = new URL(`${shell}/api/shell/auth/module-token`);
    handoff.searchParams.set("aud", "pm");
    handoff.searchParams.set("next", `${req.nextUrl.pathname}${req.nextUrl.search}`);
    return NextResponse.redirect(handoff);
  }

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
