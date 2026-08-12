import { redirect } from "next/navigation";

export default async function TaskDirectPage({
  params,
}: {
  params: Promise<{ projectId: string; taskId: string }>;
}) {
  const { projectId, taskId } = await params;
  redirect(`/projects/${projectId}?task=${taskId}`);
}
