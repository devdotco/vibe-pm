import { NextRequest, NextResponse } from 'next/server';
import { GET as getTask } from '../route';
import { GET as getWatch } from '../watch/route';
import { GET as getWatchers } from '../watchers/route';
import { GET as getRecurrence } from '../recurrence/route';
import { GET as getActivity } from '../activity/route';
import { GET as getSubtasks } from '../subtasks/route';
import { GET as getAssignees } from '../assignees/route';
import { GET as getDependencies } from '../dependencies/route';
import { GET as getAttachments } from '../attachments/route';

type Ctx = { params: Promise<{ taskId: string }> };
type Handler = (req: NextRequest, ctx: Ctx) => Promise<Response>;

/*
 * Everything the task panel reads when it opens, in one round trip.
 *
 * It used to be nine requests, each paying its own trip to the server and its
 * own session check, and together able to fill the connection pool for
 * everyone. This calls the very same route handlers in-process rather than
 * re-querying, so each part keeps exactly its own auth and org scoping — there
 * is no second copy of those checks to drift.
 *
 * The task is fetched first and gates the rest: a task this caller cannot see
 * answers 404 here exactly as /tasks/:id does, without running the others.
 * After that a part that fails comes back as null, and the panel shows that
 * part empty, which is what a failed individual request did before.
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  const taskRes = await getTask(req, ctx);
  if (!taskRes.ok) return taskRes;
  const { task } = await taskRes.json();

  const part = async (handler: Handler) => {
    try {
      const res = await handler(req, ctx);
      return res.ok ? await res.json() : null;
    } catch {
      return null;
    }
  };
  const [watch, watchers, recurrence, activity, subtasks, assignees, dependencies, attachments] =
    await Promise.all([
      part(getWatch), part(getWatchers), part(getRecurrence), part(getActivity),
      part(getSubtasks), part(getAssignees), part(getDependencies), part(getAttachments),
    ]);

  return NextResponse.json({
    task,
    watching: watch?.watching ?? false,
    watcherCount: (watchers?.watchers ?? []).length,
    recurrence: recurrence?.recurrence ?? null,
    feed: activity?.feed ?? [],
    subtasks: subtasks?.subtasks ?? [],
    assignees: assignees?.assignees ?? [],
    dependencies: dependencies?.dependencies ?? [],
    attachments: attachments?.attachments ?? [],
  });
}
