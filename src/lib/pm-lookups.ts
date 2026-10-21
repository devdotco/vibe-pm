"use client";
import { apiFetch } from "@/lib/base-path";

/*
 * Org-wide lists the task panel needs on every open: the people it can assign,
 * the projects it can move a task to, and who "me" is.
 *
 * The panel fetched all three each time it mounted, so going from one task to
 * the next re-downloaded the same lists — three of the dozen-plus requests an
 * open made. They change rarely; holding them for a few minutes per tab is
 * plenty, and a failed read is forgotten so the next open retries.
 */
const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; value: Promise<unknown> }>();

function cached<T>(path: string, pick: (body: Record<string, unknown>) => T): Promise<T> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as Promise<T>;
  const value = apiFetch(path)
    .then(r => {
      if (!r.ok) throw new Error(`${path}: ${r.status}`);
      return r.json();
    })
    .then(pick);
  value.catch(() => cache.delete(path));
  cache.set(path, { at: Date.now(), value });
  return value;
}

export type OrgUser = { id: string; name: string; email: string; [k: string]: unknown };
export type OrgProject = { id: string; name: string; color: string };

export const getOrgUsers = () =>
  cached("/api/pm/admin/users", d => (d.users as OrgUser[] | undefined) ?? []);
export const getOrgProjects = () =>
  cached("/api/pm/projects", d => (d.projects as OrgProject[] | undefined) ?? []);
export const getCurrentUserId = () =>
  cached("/api/pm/me", d => (d.id as string | undefined) ?? null);
