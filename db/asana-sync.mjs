/**
 * Asana → ViBe PM sync script
 *
 * Run inside the vibe-pm container:
 *   docker exec -e ASANA_PAT=<your-pat> <container> node /app/db/asana-sync.mjs
 *
 * What it does:
 *   1. Discovers all Asana projects that match ViBe project names
 *   2. For each project: fetches all open (non-completed) tasks
 *   3. Creates missing tasks in ViBe (matched by asana_gid stored in custom_fields,
 *      then by title fallback for tasks imported without a GID)
 *   4. Imports all Asana comments (stories) into task_comments
 *   5. Also fetches yesterday's changes (modified_since) to catch recent updates
 */

import pg from 'pg';
const { Pool } = pg;

const ASANA_PAT = process.env.ASANA_PAT;
if (!ASANA_PAT) {
  console.error('ERROR: ASANA_PAT env var is required');
  process.exit(1);
}

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error('ERROR: DATABASE_URL env var is required');
  process.exit(1);
}

const pool = new Pool({ connectionString: DB_URL });

// ── Asana API helpers ─────────────────────────────────────────────────────────

async function asanaGet(path, params = {}) {
  const url = new URL(`https://app.asana.com/api/1.0${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${ASANA_PAT}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Asana API error ${res.status} for ${path}: ${text}`);
  }
  return res.json();
}

async function asanaPaginate(path, params = {}) {
  const results = [];
  let offset = null;
  do {
    const p = { ...params, limit: '100' };
    if (offset) p.offset = offset;
    const data = await asanaGet(path, p);
    results.push(...(data.data ?? []));
    offset = data.next_page?.offset ?? null;
  } while (offset);
  return results;
}

// Stream one page at a time, calling cb(item) for each item
async function asanaStream(path, params, cb) {
  let offset = null;
  do {
    const p = { ...params, limit: '100' };
    if (offset) p.offset = offset;
    const data = await asanaGet(path, p);
    for (const item of data.data ?? []) await cb(item);
    offset = data.next_page?.offset ?? null;
  } while (offset);
}

// ── DB helpers ────────────────────────────────────────────────────────────────

async function dbQuery(sql, values = []) {
  const client = await pool.connect();
  try {
    return await client.query(sql, values);
  } finally {
    client.release();
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Load ViBe users (email → id map)
  const { rows: vibeUsers } = await dbQuery('SELECT id, email FROM users');
  const userByEmail = new Map(vibeUsers.map(u => [u.email.toLowerCase(), u.id]));
  const SYSTEM_USER = userByEmail.get('nate@dev.co') ?? vibeUsers[0]?.id;
  console.log(`Loaded ${vibeUsers.length} ViBe users`);

  // 2. Load ViBe projects (name → {id, orgId})
  const { rows: vibeProjects } = await dbQuery(
    "SELECT id, name, org_id FROM projects WHERE status != 'archived'"
  );
  const projectByName = new Map(vibeProjects.map(p => [p.name.toLowerCase().trim(), p]));
  console.log(`Loaded ${vibeProjects.length} ViBe projects`);

  // 3. Find Asana workspaces
  const wsData = await asanaGet('/workspaces', { opt_fields: 'name,gid' });
  const workspaces = wsData.data ?? [];
  console.log(`Found ${workspaces.length} Asana workspace(s): ${workspaces.map(w => w.name).join(', ')}`);

  let totalNewTasks = 0;
  let totalNewComments = 0;
  let totalUpdatedTasks = 0;

  for (const ws of workspaces) {
    // 4. Fetch all Asana projects in workspace
    const asanaProjects = await asanaPaginate(`/projects`, {
      workspace: ws.gid,
      opt_fields: 'name,gid,archived',
    });
    console.log(`\nWorkspace "${ws.name}": ${asanaProjects.length} projects`);

    for (const ap of asanaProjects) {
      if (ap.archived) continue;

      const vp = projectByName.get(ap.name.toLowerCase().trim());
      if (!vp) {
        // no matching ViBe project — skip
        continue;
      }

      console.log(`\n=== Syncing "${ap.name}" (Asana ${ap.gid} → ViBe ${vp.id}) ===`);

      // 5. Load ViBe sections for this project
      const { rows: vibeSections } = await dbQuery(
        "SELECT id, name FROM sections WHERE project_id = $1 AND is_archived = false ORDER BY position",
        [vp.id]
      );
      const sectionByName = new Map(vibeSections.map(s => [s.name.toLowerCase(), s.id]));
      const defaultSectionId = vibeSections[0]?.id ?? null;

      // 6. Load existing ViBe tasks for this project (id, title, custom_fields)
      const { rows: vibeTaskRows } = await dbQuery(
        "SELECT id, title, custom_fields FROM tasks WHERE project_id = $1 AND deleted_at IS NULL",
        [vp.id]
      );
      // Build lookup maps
      const taskByAsanaGid = new Map();
      const taskByTitle = new Map();
      for (const t of vibeTaskRows) {
        const gid = t.custom_fields?.asana_gid;
        if (gid) taskByAsanaGid.set(gid, t.id);
        taskByTitle.set(t.title.toLowerCase().trim(), t.id);
      }

      // 7. Stream only incomplete Asana tasks (completed=false) to keep memory low
      let taskCount = 0;
      await asanaStream(`/tasks`, {
        project: ap.gid,
        completed_since: 'now', // only incomplete tasks
        opt_fields: 'gid,name,notes,assignee.email,due_on,completed,memberships.section.name,created_at,modified_at',
      }, async (at) => {
        taskCount++;

        // Resolve section
        const sectionName = at.memberships?.[0]?.section?.name?.toLowerCase() ?? '';
        const sectionId = sectionByName.get(sectionName) ?? defaultSectionId;

        // Resolve assignee
        const assigneeEmail = at.assignee?.email?.toLowerCase() || '';
        const assigneeId = assigneeEmail ? (userByEmail.get(assigneeEmail) ?? null) : null;

        const status = at.completed ? 'completed' : 'not_started';

        // Check if task exists in ViBe
        let vibeTaskId = taskByAsanaGid.get(at.gid)
          ?? taskByTitle.get(at.name.toLowerCase().trim());

        if (!vibeTaskId) {
          // Create the task
          const { rows: [newTask] } = await dbQuery(
            `INSERT INTO tasks (project_id, section_id, org_id, title, description, status, assignee_id,
              due_date, position, created_by, custom_fields, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
               COALESCE((SELECT MAX(position) FROM tasks WHERE project_id = $1 AND deleted_at IS NULL), 0) + 1000,
               $9, $10::jsonb, $11, $12)
             RETURNING id`,
            [
              vp.id, sectionId, vp.org_id,
              at.name,
              at.notes || null,
              status,
              assigneeId,
              at.due_on || null,
              SYSTEM_USER,
              JSON.stringify({ asana_gid: at.gid }),
              new Date(at.created_at),
              new Date(at.modified_at),
            ]
          );
          vibeTaskId = newTask.id;
          taskByAsanaGid.set(at.gid, vibeTaskId);
          taskByTitle.set(at.name.toLowerCase().trim(), vibeTaskId);
          totalNewTasks++;
          process.stdout.write('+');
        } else {
          // Store asana_gid in custom_fields if not set yet
          await dbQuery(
            `UPDATE tasks SET custom_fields = custom_fields || $1::jsonb, updated_at = NOW()
             WHERE id = $2 AND (custom_fields->>'asana_gid') IS NULL`,
            [JSON.stringify({ asana_gid: at.gid }), vibeTaskId]
          );
          totalUpdatedTasks++;
          process.stdout.write('.');
        }

        // 8. Fetch Asana stories (comments) for this task — paginated, not accumulated
        const commentRows = [];
        try {
          await asanaStream(`/tasks/${at.gid}/stories`, {
            opt_fields: 'type,text,created_by.email,created_at,resource_subtype',
          }, async (story) => {
            if (story.type === 'comment' && story.resource_subtype === 'comment_added' && story.text) {
              commentRows.push(story);
            }
          });
        } catch { /* skip tasks whose stories are inaccessible */ }

        if (commentRows.length === 0) return;

        // Load existing comments for dedup
        const { rows: existingComments } = await dbQuery(
          'SELECT content FROM task_comments WHERE task_id = $1',
          [vibeTaskId]
        );
        const existingContentSet = new Set(existingComments.map(c => c.content.trim()));

        for (const story of commentRows) {
          const content = story.text.trim();
          if (!content || existingContentSet.has(content)) continue;

          const commentAuthorEmail = story.created_by?.email?.toLowerCase() || '';
          const commentUserId = (commentAuthorEmail ? userByEmail.get(commentAuthorEmail) : null)
            || SYSTEM_USER;

          await dbQuery(
            `INSERT INTO task_comments (task_id, org_id, user_id, content, source, created_at)
             VALUES ($1, $2, $3, $4, 'asana', $5)`,
            [vibeTaskId, vp.org_id, commentUserId, content, new Date(story.created_at)]
          );
          existingContentSet.add(content);
          totalNewComments++;
        }
      });
      console.log(); // newline after progress dots
      console.log(`  Done. Tasks processed: ${taskCount}`);
    }
  }

  console.log(`\n=== Sync complete ===`);
  console.log(`  New tasks created:    ${totalNewTasks}`);
  console.log(`  Tasks GID-tagged:     ${totalUpdatedTasks}`);
  console.log(`  New comments imported: ${totalNewComments}`);

  await pool.end();
}

main().catch(err => {
  console.error('\nFATAL:', err.message);
  process.exit(1);
});
