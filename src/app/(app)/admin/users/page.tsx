import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { isOrgAdmin } from '@/lib/auth/roles';
import { desc, eq } from 'drizzle-orm';
import { UsersAdminClient } from './users-admin-client';

export default async function AdminUsersPage() {
  const me = await requireUser();
  // Scoped to the caller's organization. This selected EVERY user in the
  // database — every workspace's people, names and emails — for anyone signed
  // in anywhere. The API route was fixed on 09-05; this server component read
  // the table directly and was missed.
  const orgUsers = await db.select().from(users)
    .where(eq(users.orgId, me.orgId))
    .orderBy(desc(users.createdAt));
  const serialized = orgUsers.map(u => ({
    ...u,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  }));
  return <UsersAdminClient initialUsers={serialized} canManage={isOrgAdmin(me)} />;
}
