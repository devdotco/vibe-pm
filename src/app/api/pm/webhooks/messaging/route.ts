import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasks, projects, projectMembers, sections, users } from "@/lib/db/schema";
import { verifyWebhookSignature } from "@/lib/webhooks";
import { logActivity } from "@/lib/activity";
import { positionBetween } from "@/lib/ordering";
import { eq, and, isNull, desc } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-vibe-signature") ?? "";

  // Verify signature
  if (!verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: {
    event: string;
    payload: {
      projectId?: string;
      title?: string;
      description?: string;
      creatorEmail?: string;
    };
  };

  try {
    body = JSON.parse(rawBody) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.event === "create_task") {
    const { projectId, title, description, creatorEmail } = body.payload;
    if (!projectId || !title) {
      return NextResponse.json(
        { error: "projectId and title required" },
        { status: 400 }
      );
    }

    // Get project to get orgId
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Find creator user by email if provided
    let creatorId = project.createdBy;
    if (creatorEmail) {
      const [u] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, creatorEmail))
        .limit(1);
      if (u) creatorId = u.id;
    }

    // Get first section for position
    const [firstSection] = await db
      .select({ id: sections.id })
      .from(sections)
      .where(eq(sections.projectId, projectId))
      .orderBy(sections.position)
      .limit(1);

    // Get last position
    const lastPos = await db
      .select({ position: tasks.position })
      .from(tasks)
      .where(
        and(
          eq(tasks.projectId, projectId),
          firstSection ? eq(tasks.sectionId, firstSection.id) : isNull(tasks.sectionId),
          isNull(tasks.deletedAt)
        )
      )
      .orderBy(desc(tasks.position))
      .limit(1);

    const position = positionBetween(lastPos[0]?.position ?? null, null);

    const [task] = await db.transaction(async (tx) => {
      const [t] = await tx
        .insert(tasks)
        .values({
          projectId,
          sectionId: firstSection?.id,
          orgId: project.orgId,
          title,
          description,
          priority: "none",
          position,
          createdBy: creatorId,
          labels: [],
        })
        .returning();
      await logActivity(
        {
          taskId: t.id,
          projectId,
          orgId: project.orgId,
          userId: creatorId,
          action: "created",
          newValue: "via messaging webhook",
        },
        tx
      );
      return [t];
    });

    return NextResponse.json({ ok: true, taskId: task.id });
  }

  return NextResponse.json({ ok: true, skipped: true });
}
