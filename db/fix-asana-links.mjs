/**
 * Fix Asana profile URLs in task_comments
 *
 * Run inside the vibe-pm container:
 *   docker exec <container> node /app/db/fix-asana-links.mjs
 *
 * Replaces hardcoded Asana profile URLs with @mention names.
 */

import pg from 'pg';
const { Pool } = pg;

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error('ERROR: DATABASE_URL env var is required');
  process.exit(1);
}

const pool = new Pool({ connectionString: DB_URL });

const REPLACEMENTS = [
  {
    url: 'https://app.asana.com/1/629874586245439/profile/1156738500401637',
    replacement: '@Sam',
  },
  {
    url: 'https://app.asana.com/1/629874586245439/profile/629874587640613',
    replacement: '@Kathrina',
  },
  {
    url: 'https://app.asana.com/1/629874586245439/profile/629874587640602',
    replacement: '@Bri',
  },
];

async function run() {
  const client = await pool.connect();
  try {
    // Count affected rows first
    const { rows: preview } = await client.query(
      `SELECT id, LEFT(content, 120) AS snippet FROM task_comments WHERE deleted_at IS NULL AND (${REPLACEMENTS.map((_, i) => `content LIKE $${i + 1}`).join(' OR ')})`,
      REPLACEMENTS.map(r => `%${r.url}%`)
    );
    console.log(`Found ${preview.length} comment(s) containing Asana profile URLs`);
    preview.forEach(r => console.log(`  - ${r.id}: ${r.snippet}…`));

    if (preview.length === 0) {
      console.log('Nothing to do.');
      return;
    }

    // Apply replacements one URL at a time
    for (const { url, replacement } of REPLACEMENTS) {
      const result = await client.query(
        `UPDATE task_comments SET content = REPLACE(content, $1, $2) WHERE deleted_at IS NULL AND content LIKE $3`,
        [url, replacement, `%${url}%`]
      );
      console.log(`  "${url}" → "${replacement}": updated ${result.rowCount} row(s)`);
    }

    console.log('Done.');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
