import { cookies } from "next/headers";

export type ShellOrg = { id: string; name: string };

const SHELL_COOKIE = "__vibe_session";

export function shellUrl(): string {
  return (process.env.SHELL_URL ?? "https://app.erp.io").replace(/\/$/, "");
}

/**
 * Every organisation the signed-in person can act as.
 *
 * Asked of the shell rather than read locally: membership is a fact the shell
 * owns, and this module's `users` table only knows the organisations it has
 * happened to mirror. A locally-built list would offer entities the person has
 * left, and the switch would be refused anyway.
 *
 * Readable at all only because Projects is mounted on app.erp.io now — the
 * shell's cookie is host-scoped to that origin at path `/`, so it arrives here
 * with the request. On pm.erp.io it never did.
 *
 * Best-effort: an unreachable shell collapses the switcher to the organisation
 * already on screen, which is how this module behaved before it had one.
 */
export async function listShellOrgs(): Promise<ShellOrg[]> {
  const token = (await cookies()).get(SHELL_COOKIE)?.value;
  if (!token) return [];

  try {
    const res = await fetch(`${shellUrl()}/api/shell/orgs`, {
      headers: { cookie: `${SHELL_COOKIE}=${token}` },
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { orgs?: unknown };
    if (!Array.isArray(body.orgs)) return [];
    return body.orgs.flatMap((o) => {
      const org = o as Partial<ShellOrg>;
      return org?.id && org?.name ? [{ id: org.id, name: org.name }] : [];
    });
  } catch {
    return [];
  }
}

/*
 * The switch URL is deliberately NOT built here.
 *
 * It is needed by a client component, and handing a server function down as a
 * prop is a function crossing the server/client boundary: it compiles, it
 * builds, and it throws on every request. It is assembled in
 * components/pm/Sidebar.tsx from SHELL_URL, which is client-safe.
 */
