/**
 * Where this app is mounted.
 *
 * Projects is served from `app.erp.io/pm` rather than its own subdomain so the
 * suite shares ONE origin: one session cookie, no cross-site hand-off, and data
 * shared between modules becomes a same-origin fetch.
 *
 * Next's `basePath` rewrites `<Link>`, the router, `redirect()` and static
 * assets. It does NOT touch strings. A runtime `fetch('/api/pm/tasks')`
 * resolves against the ORIGIN, so it leaves this app and lands on the shell,
 * which answers 404 — and a fetch that 404s in a click handler usually shows
 * as nothing happening at all. Anything that builds a path as text goes
 * through here.
 *
 * Kept in lockstep with `basePath` in next.config.ts by hand; Next exposes no
 * public runtime accessor for it.
 */
export const BASE_PATH = '/pm';

/** Prefix an app-absolute path with the mount point. */
export function withBase(path: string): string {
  if (!path.startsWith('/')) return `${BASE_PATH}/${path}`;
  // Idempotent: a value that already carries the mount must not gain a second
  // one. Paths reach here from query strings and stored `next=` values, which
  // may have been written either side of this migration.
  if (path === BASE_PATH || path.startsWith(`${BASE_PATH}/`)) return path;
  return `${BASE_PATH}${path}`;
}

/** Strip the mount from a path, for matching against unprefixed route lists. */
export function stripBase(path: string): string {
  if (path === BASE_PATH) return '/';
  return path.startsWith(`${BASE_PATH}/`) ? path.slice(BASE_PATH.length) : path;
}

/**
 * `fetch` for this app's own API.
 *
 * A wrapper rather than `fetch(withBase(...))` at each call site: there are 127
 * of them, they are a mix of quoted strings and template literals, and
 * rewriting the argument of each by hand is how a stray parenthesis ships.
 */
export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(withBase(path), init);
}
