import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { verifyModuleToken, shellSignInUrl, type ShellIdentity } from "@/lib/auth/module-token";
import { createSessionToken, sessionCookieOptions, COOKIE_NAME } from "@/lib/auth/session";

/**
 * Redeems a shell-issued module token for a Projects session.
 *
 * The token is a 120-second, single-audience hand-off credential signed by a
 * key only app.vb.co holds. We verify it, mirror the person into this app's
 * own `users` table, mint OUR OWN host-scoped session, and never look at the
 * token again.
 *
 * This is the endpoint the shell redirects to; without it, clicking Projects
 * on the dashboard landed on this app's sign-in form, which is what "pm.vb.co
 * isn't logging me in" meant.
 */

/** Only ever redirect within this app — an open redirect here is a real one. */
function safeReturnPath(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/my-tasks";
  return raw;
}

/**
 * Behind the proxy the request's own origin is the container's bind address,
 * so building redirects from it sends the browser to 0.0.0.0 and stops there.
 */
function publicOrigin(req: NextRequest): string {
  const configured = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "app.erp.io";
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

/**
 * Find this person in Projects WITHIN THE ORGANIZATION THEY ARRIVED FROM, or
 * create them there.
 *
 * The match is on (orgId, email), and the orgId half is the entire security
 * property. This used to select on email alone, which meant the first row ever
 * created for an address won permanently: anyone who already had an account
 * here — every member of our own internal workspace — kept that row, and its
 * original org_id, when they signed in from a brand-new workspace. The session
 * they were handed was the internal user. They saw internal projects.
 *
 * So adopt-by-email is now adopt-by-email-within-an-org. Someone invited to a
 * board before they ever signed in still lands on that account, because the
 * invitation was issued inside an org too. Someone who belongs to two
 * organizations gets two rows, which is correct: in this app they are two
 * different members with two different sets of projects.
 */
async function mirrorPrincipal(identity: ShellIdentity) {
  // Refused BEFORE the lookup, not after. A token carrying no org cannot be
  // scoped to one, and falling through to an unscoped query is precisely the
  // bug this function now exists to prevent.
  if (!identity.shellOrgId) {
    throw new Error("Module token carries no organization; refusing to sign anyone in");
  }
  const orgId = identity.shellOrgId;

  const [existing] = await db
    .select()
    .from(users)
    .where(and(eq(users.email, identity.email), eq(users.orgId, orgId)))
    .limit(1);

  if (existing) {
    // Keep the display name fresh. Status is deliberately NOT reactivated here:
    // a row set inactive is a decision someone made inside this app, and the
    // shell vouching for the person again does not undo it.
    if (existing.name !== identity.fullName && identity.fullName) {
      await db.update(users).set({ name: identity.fullName }).where(eq(users.id, existing.id));
    }
    return existing;
  }

  const [created] = await db
    .insert(users)
    .values({
      orgId,
      email: identity.email,
      name: identity.fullName || identity.email,
      status: "active",
    })
    .returning();

  return created;
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const next = safeReturnPath(req.nextUrl.searchParams.get("next"));
  const origin = publicOrigin(req);

  if (!token) {
    return NextResponse.redirect(shellSignInUrl(new URL(next, origin).toString()));
  }

  let user;
  try {
    const identity = await verifyModuleToken(token);
    user = await mirrorPrincipal(identity);
  } catch (err) {
    // Anything suspect — expired, wrong audience, wrong key, no org — is
    // "not signed in". Never a soft failure that lets the request through.
    console.warn("[auth/callback] rejected module token:", (err as Error).message);
    return NextResponse.redirect(shellSignInUrl(new URL(next, origin).toString()));
  }

  if (!user || user.status !== "active") {
    return NextResponse.redirect(shellSignInUrl(new URL(next, origin).toString()));
  }

  const sessionToken = await createSessionToken(user.id);
  const res = NextResponse.redirect(new URL(next, origin));
  res.cookies.set(COOKIE_NAME, sessionToken, sessionCookieOptions());
  return res;
}
