import { NextRequest, NextResponse } from "next/server";

const PUBLIC = [
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

  const token = req.cookies.get("__vibe_session")?.value;
  if (!token) {
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
