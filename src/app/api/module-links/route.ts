import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, ilike } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects, tasks, users } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { verifyModuleToken } from "@/lib/auth/module-token";

/**
 * The cross-module link contract, implemented for Projects.
 * See packages/erp-ui/module-links.ts for the shape.
 *
 * TASKS, not projects. A project is the container; the work somebody is waiting
 * on is a task, and that is what belongs on a contact record. A project also
 * says almost nothing on its own — "SEO.co" against a contact is not a fact
 * anybody can act on, where "Draft the Q3 audit, due Friday" is.
 *
 * A task belongs to a person because they are its ASSIGNEE — the only direct
 * association this module has between a task and a human.
 *
 * Authenticated by this module's own session when called from a browser, and by
 * a shell-minted hand-off token when another module calls it.
 *
 * THE TOKEN IS NOT AN OPTIMISATION — it is the only thing that works. This
 * app's session cookie is set with `path: /pm`, so a browser never sends it to
 * /crm and the cookie header the CRM forwards genuinely does not contain it.
 * Every module scopes its cookie to its own mount for the same good reason
 * (sign-out deletes by path), so cookie forwarding was never going to
 * authenticate any of them — and it failed silently, as "you have no projects".
 */

/** Who is asking: this app's session, or a verified shell token. */
async function resolveCaller(req: NextRequest) {
  const local = await getCurrentUser();
  if (local) return local;

  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;

  let identity;
  try {
    identity = await verifyModuleToken(auth.slice(7).trim());
  } catch {
    return null;
  }

  // The token proves an email at the shell. It does NOT say which of this app's
  // accounts that is, so resolve it to a real row and use THAT row's org.
  //
  // The org named on the token is preferred. Falling back to a lone row for the
  // address is deliberate and is not the adopt-by-email hazard: nothing is
  // created here, and a single existing account for a proven email is not
  // ambiguous about whose it is. With more than one there is a real choice to
  // make and no basis for making it, so nothing is returned.
  const rows = await db
    .select({ id: users.id, orgId: users.orgId, status: users.status })
    .from(users)
    .where(eq(users.email, identity.email))
    .limit(5);

  const active = rows.filter((r) => r.status === "active");
  const preferred = active.find((r) => r.orgId === identity.shellOrgId);
  return preferred ?? (active.length === 1 ? active[0] : null);
}

/** The stored status values, as somebody would say them. */
const STATUS_LABEL: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
  completed: "Completed",
};

export async function GET(req: NextRequest) {
  const me = await resolveCaller(req);
  if (!me) return NextResponse.json({ records: [] });

  const email = req.nextUrl.searchParams.get("email")?.trim().toLowerCase();
  const rawQ = req.nextUrl.searchParams.get("q");
  const q = rawQ?.trim();
  // A `q` that is present but blank asks for the MOST RECENT projects — what
  // the CRM's attach picker opens with, so the common case ("the project we
  // just made for them") needs no typing.
  const wantsRecent = rawQ !== null && !q;
  if (!email && !q && !wantsRecent) return NextResponse.json({ records: [] });

  let rows: {
    id: string;
    title: string;
    status: string | null;
    dueDate: string | null;
    createdAt: Date | null;
    projectId: string;
    projectName: string;
  }[] = [];

  // The project name rides along as the subtitle: a task title on its own
  // ("Kickoff call") is ambiguous across a workspace.
  const columns = {
    id: tasks.id,
    title: tasks.title,
    status: tasks.status,
    dueDate: tasks.dueDate,
    createdAt: tasks.createdAt,
    projectId: tasks.projectId,
    projectName: projects.name,
  };

  if (email) {
    // The person, IN THIS ORGANISATION. Looking up by email alone would find
    // their account in somebody else's workspace.
    const [person] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.orgId, me.orgId), eq(users.email, email)))
      .limit(1);
    if (!person) return NextResponse.json({ records: [] });

    rows = await db
      .select(columns)
      .from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .where(and(eq(tasks.orgId, me.orgId), eq(tasks.assigneeId, person.id)))
      .orderBy(desc(tasks.createdAt))
      .limit(25);
  } else {
    rows = await db
      .select(columns)
      .from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .where(
        wantsRecent
          ? eq(tasks.orgId, me.orgId)
          : and(eq(tasks.orgId, me.orgId), ilike(tasks.title, `%${q}%`)),
      )
      .orderBy(desc(tasks.createdAt))
      .limit(25);
  }

  const base = (process.env.APP_URL ?? "https://app.erp.io/pm").replace(/\/$/, "");
  return NextResponse.json(
    {
      records: rows.map((t) => ({
        id: t.id,
        title: t.title,
        subtitle: t.dueDate ? `${t.projectName} · due ${t.dueDate}` : t.projectName,
        // The task's own view, inside its project.
        url: `${base}/projects/${t.projectId}?task=${t.id}`,
        status: STATUS_LABEL[t.status ?? ""] ?? t.status ?? undefined,
        at: t.createdAt?.toISOString(),
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
