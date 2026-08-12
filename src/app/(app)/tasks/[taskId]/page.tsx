import { redirect, notFound } from "next/navigation";
import { db } from "@/lib/db";
import { tasks } from "@/lib/db/schema";
import { eq, isNull } from "drizzle-orm";

export default async function TaskByIdPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = await params;

  const [task] = await db
    .select({ projectId: tasks.projectId })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);

  if (!task) notFound();

  redirect(`/projects/${task.projectId}?task=${taskId}`);
}
