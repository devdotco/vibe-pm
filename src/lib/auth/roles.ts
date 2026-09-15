import { NextResponse } from "next/server";
import type { User } from "@/lib/db/schema";

/**
 * Who administers Projects for an organization.
 *
 * Projects never had roles: `project_members.role` and `team_members.role` are
 * stored and never checked, and the Members page was open to everyone. The
 * suite's answer lives in the shell — its hand-off token carries a `role` from
 * one ladder (app-erp-io lib/auth/roles.ts), already capped for this module —
 * and the callback stores it on the user row as `shell_role`.
 *
 * Legacy shell strings are mapped the way the shell maps them
 * (PLATFORM_ADMIN → SUPER_ADMIN, ENTITY_ADMIN → WORKSPACE_ADMIN) in case a
 * token from before the ladder is still in flight.
 *
 * A magic-link-only account has no shell role and is never an admin. That is
 * the fail-closed direction: it can still fill in every form.
 */
const ADMIN_ROLES = new Set(["WORKSPACE_ADMIN", "SUPER_ADMIN", "ENTITY_ADMIN", "PLATFORM_ADMIN"]);

export function isOrgAdmin(user: Pick<User, "shellRole"> | null | undefined): boolean {
  return !!user?.shellRole && ADMIN_ROLES.has(user.shellRole);
}

export function forbidden(message = "Only organization admins can do this"): NextResponse {
  return NextResponse.json({ error: message }, { status: 403 });
}
