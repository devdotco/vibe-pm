import { db } from '@/lib/db';
import { taskWatchers } from '@/lib/db/schema';
import type { PgTransaction } from 'drizzle-orm/pg-core';

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function autoWatch(taskId: string, orgId: string, userId: string, dbOrTx: DbOrTx = db) {
  try {
    await dbOrTx.insert(taskWatchers).values({ taskId, orgId, userId }).onConflictDoNothing();
  } catch {
    // best-effort: never fail the parent operation
  }
}
