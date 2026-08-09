import { NextRequest, NextResponse } from "next/server";

const PUBLIC = [
  "/api/auth/magic",
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
  const token = req.cookies.get("__vibe_session")?.value;
  if (!token) {
    const signInUrl = process.env.AUTH_URL ?? 'https://app.vb.co';
    return NextResponse.redirect(
      new URL(`/sign-in?next=${encodeURIComponent(req.url)}`, signInUrl)
    );
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
