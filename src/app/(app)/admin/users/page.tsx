import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/session';
import { desc } from 'drizzle-orm';
import { UsersAdminClient } from './users-admin-client';

export default async function AdminUsersPage() {
  await requireUser();
  const allUsers = await db.select().from(users).orderBy(desc(users.createdAt));
  const serialized = allUsers.map(u => ({
    ...u,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  }));
  return <UsersAdminClient initialUsers={serialized} />;
}
