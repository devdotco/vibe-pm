import { db } from "@/lib/db";
import { taskActivity } from "@/lib/db/schema";

// Accepts both db instance and Drizzle transaction objects
type DbOrTx = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

export async function logActivity(
  params: {
    taskId: string;
    projectId: string;
    orgId: string;
    userId: string;
    action: string;
    oldValue?: string | null;
    newValue?: string | null;
    metadata?: Record<string, unknown>;
  },
  tx?: DbOrTx
) {
  const client = tx ?? db;
  await (client as typeof db).insert(taskActivity).values({
    taskId: params.taskId,
    projectId: params.projectId,
    orgId: params.orgId,
    userId: params.userId,
    action: params.action,
    oldValue: params.oldValue ?? null,
    newValue: params.newValue ?? null,
    metadata: params.metadata ?? null,
  });
}
