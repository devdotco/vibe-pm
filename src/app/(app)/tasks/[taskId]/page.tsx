import { redirect, notFound } from "next/navigation";
import { db } from "@/lib/db";
import { tasks } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { eq, and } from "drizzle-orm";

/**
 * No requireUser() and no org filter — this took ANY task uuid and answered
 * with its projectId, unconditionally. Every OTHER route in this app treats
 * "does a task with this id exist in my org" as something worth hiding from
 * a stranger; this one turned it into a task-uuid -> project-uuid oracle for
 * any signed-in user (of any org), not just the ones the task belongs to.
 */
export default async function TaskByIdPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const user = await requireUser();
  const { taskId } = await params;

  const [task] = await db
    .select({ projectId: tasks.projectId })
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.orgId, user.orgId)))
    .limit(1);

  if (!task) notFound();

  redirect(`/projects/${task.projectId}?task=${taskId}`);
}
