import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, ilike, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects, projectMembers, users } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth/session";

/**
 * The cross-module link contract, implemented for Projects.
 * See packages/erp-ui/module-links.ts for the shape.
 *
 * A project belongs to a person because they are a MEMBER of it — that is the
 * only association this module has, and it is the one worth surfacing on a
 * contact. Authenticated by this module's own session, so the answer is scoped
 * to what the person asking can see here, not to what CRM can see.
 */
export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ records: [] });

  const email = req.nextUrl.searchParams.get("email")?.trim().toLowerCase();
  const rawQ = req.nextUrl.searchParams.get("q");
  const q = rawQ?.trim();
  // A `q` that is present but blank asks for the MOST RECENT projects — what
  // the CRM's attach picker opens with, so the common case ("the project we
  // just made for them") needs no typing.
  const wantsRecent = rawQ !== null && !q;
  if (!email && !q && !wantsRecent) return NextResponse.json({ records: [] });

  let rows: { id: string; name: string; status: string | null; createdAt: Date | null }[] = [];

  if (email) {
    // The person, IN THIS ORGANISATION. Looking up by email alone would find
    // their account in somebody else's workspace.
    const [person] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.orgId, me.orgId), eq(users.email, email)))
      .limit(1);
    if (!person) return NextResponse.json({ records: [] });

    const memberships = await db
      .select({ projectId: projectMembers.projectId })
      .from(projectMembers)
      .where(and(eq(projectMembers.orgId, me.orgId), eq(projectMembers.userId, person.id)))
      .limit(200);

    const ids = [...new Set(memberships.map((m) => m.projectId))];
    if (ids.length === 0) return NextResponse.json({ records: [] });

    rows = await db
      .select({ id: projects.id, name: projects.name, status: projects.status, createdAt: projects.createdAt })
      .from(projects)
      .where(and(eq(projects.orgId, me.orgId), inArray(projects.id, ids)))
      .orderBy(desc(projects.createdAt))
      .limit(25);
  } else {
    rows = await db
      .select({ id: projects.id, name: projects.name, status: projects.status, createdAt: projects.createdAt })
      .from(projects)
      .where(
        wantsRecent
          ? eq(projects.orgId, me.orgId)
          : and(eq(projects.orgId, me.orgId), ilike(projects.name, `%${q}%`)),
      )
      .orderBy(desc(projects.createdAt))
      .limit(25);
  }

  const base = (process.env.APP_URL ?? "https://app.erp.io/pm").replace(/\/$/, "");
  return NextResponse.json(
    {
      records: rows.map((p) => ({
        id: p.id,
        title: p.name,
        url: `${base}/projects/${p.id}`,
        status: p.status ?? undefined,
        at: p.createdAt?.toISOString(),
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
