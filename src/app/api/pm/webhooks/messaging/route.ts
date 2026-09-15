import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasks, projects, projectMembers, sections, users } from "@/lib/db/schema";
import { verifyWebhookSignature } from "@/lib/webhooks";
import { getCurrentUser } from "@/lib/auth/session";
import { autoAttachForms } from "@/lib/forms/service";
import { logActivity } from "@/lib/activity";
import { positionBetween } from "@/lib/ordering";
import { eq, and, isNull, desc } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-vibe-signature") ?? "";

  /*
   * Two callers, two proofs.
   *
   * A signed server-to-server call is the service path. But Chat's "create a
   * task from this message" is a fetch FROM THE BROWSER
   * (vibe-messaging channel-view.tsx), which cannot hold a signing secret and
   * sends none — it worked only because the signature check used to return
   * true whenever VIBE_WEBHOOK_SECRET was unset, i.e. it authenticated nobody.
   * Chat and Projects now share one origin, so that request already carries
   * this app's own session cookie; a signed-in person acting inside their own
   * organization is proof enough, and better proof than the header was.
   *
   * Anything else is refused, so an anonymous POST can no longer plant a task
   * in any project whose id it can guess.
   */
  const signed = verifyWebhookSignature(rawBody, signature);
  const sessionUser = signed ? null : await getCurrentUser();
  if (!signed && !sessionUser) {
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

    // A session only ever authorises that person's OWN organization. (The
    // signed service path is trusted for any org, as it always was.)
    if (sessionUser && sessionUser.orgId !== project.orgId) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Find creator user by email if provided, WITHIN THE PROJECT'S ORG.
    //
    // This looked up by email alone, so a creatorEmail that happened to match
    // someone in a different organization attributed the task to that
    // stranger's account there — and their name/email then went out in the
    // task-assigned notification.
    // The session is the author when there is one: it is verified, and
    // `creatorEmail` is just a string the caller sent.
    let creatorId = sessionUser?.id ?? project.createdBy;
    if (!sessionUser && creatorEmail) {
      const [u] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.email, creatorEmail), eq(users.orgId, project.orgId)))
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

    await autoAttachForms(task);

    return NextResponse.json({ ok: true, taskId: task.id });
  }

  return NextResponse.json({ ok: true, skipped: true });
}
