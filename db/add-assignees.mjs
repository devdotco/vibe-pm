/**
 * Add Sam and Bri as assignees to all open tasks
 *
 * Run inside the vibe-pm container:
 *   docker exec <container> node /app/db/add-assignees.mjs
 *
 * - Finds users named Sam and Bri in the users table
 * - Adds them to every non-completed, non-deleted task via task_assignees
 * - Skips tasks where they're already assigned
 * - Does NOT send emails (assignment emails fire via the API layer; this is a
 *   direct DB backfill — notify Sam & Bri separately after running)
 */

import pg from 'pg';
const { Pool } = pg;

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error('ERROR: DATABASE_URL env var is required');
  process.exit(1);
}

const pool = new Pool({ connectionString: DB_URL });

const NAMES = ['Sam', 'Bri'];

async function run() {
  const client = await pool.connect();
  try {
    // Find users
    const { rows: allUsers } = await client.query(
      `SELECT id, name, email, org_id FROM users WHERE name = ANY($1)`,
      [NAMES]
    );
    if (allUsers.length === 0) {
      console.error('ERROR: No users found matching names:', NAMES.join(', '));
      console.error('Make sure Sam and Bri have accounts in the system first.');
      process.exit(1);
    }

    for (const name of NAMES) {
      const found = allUsers.filter(u => u.name.toLowerCase().includes(name.toLowerCase()));
      if (found.length === 0) {
        console.warn(`WARNING: No user found for "${name}" — skipping`);
      } else if (found.length > 1) {
        console.warn(`WARNING: Multiple users match "${name}":`, found.map(u => `${u.name} (${u.email})`).join(', '));
        console.warn(`Using first match: ${found[0].name} (${found[0].email})`);
      } else {
        console.log(`Found: ${found[0].name} (${found[0].email}) — id: ${found[0].id}`);
      }
    }

    const users = NAMES.map(name => {
      const match = allUsers.find(u => u.name.toLowerCase().includes(name.toLowerCase()));
      return match ?? null;
    }).filter(Boolean);

    if (users.length === 0) {
      console.error('No valid users to assign. Exiting.');
      process.exit(1);
    }

    // Get all open tasks
    const { rows: openTasks } = await client.query(
      `SELECT id, org_id, title FROM tasks WHERE status != 'completed' AND deleted_at IS NULL ORDER BY created_at`
    );
    console.log(`\nFound ${openTasks.length} open task(s) to process`);

    let totalAdded = 0;
    let totalSkipped = 0;

    for (const user of users) {
      console.log(`\nAssigning ${user.name} to open tasks...`);
      for (const task of openTasks) {
        const orgId = user.org_id;
        try {
          await client.query(
            `INSERT INTO task_assignees (id, task_id, org_id, user_id, assigned_at, assigned_by)
             VALUES (gen_random_uuid(), $1, $2, $3, NOW(), NULL)
             ON CONFLICT (task_id, user_id) DO NOTHING`,
            [task.id, orgId, user.id]
          );
          totalAdded++;
        } catch (err) {
          // unique constraint — already assigned
          totalSkipped++;
        }
      }
    }

    console.log(`\nDone. Added ${totalAdded} assignment(s), skipped ${totalSkipped} (already assigned).`);
    console.log('\nNote: Email notifications were NOT sent by this script.');
    console.log('To trigger emails, use the API: POST /api/pm/tasks/:id/assignees for each task.');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
