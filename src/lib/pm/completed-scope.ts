/**
 * Which completed tasks a project's task list carries — the `completed` query
 * param on /api/pm/projects/:id/tasks.
 *
 * - `none`   open tasks only
 * - `recent` open, plus completed in the last RECENT_COMPLETED_DAYS
 * - `all`    everything (the API's default when the param is absent)
 */
export type CompletedScope = "none" | "recent" | "all";

export const RECENT_COMPLETED_DAYS = 30;

export function parseCompletedScope(v: string | null): CompletedScope {
  return v === "none" || v === "recent" ? v : "all";
}
