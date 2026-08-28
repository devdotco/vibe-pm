import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
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
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "pm.vb.co";
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

/**
 * Find this person in Projects, or create them.
 *
 * Adopt-by-email: the suite's identity is the shell's, and someone who was
 * invited to a board by email before they ever signed in should land on that
 * same account rather than a duplicate. `orgId` is required by the schema and
 * comes from the token's `org` claim.
 */
async function mirrorPrincipal(identity: ShellIdentity) {
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.email, identity.email))
    .limit(1);

  if (existing) {
    // Reactivate someone previously deactivated only if the shell still
    // vouches for them, and keep the display name fresh.
    if (existing.name !== identity.fullName && identity.fullName) {
      await db.update(users).set({ name: identity.fullName }).where(eq(users.id, existing.id));
    }
    return existing;
  }

  if (!identity.shellOrgId) {
    throw new Error("Module token carries no organisation; refusing to create a user");
  }

  const [created] = await db
    .insert(users)
    .values({
      orgId: identity.shellOrgId,
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
