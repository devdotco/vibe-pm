#!/usr/bin/env node
/**
 * Load a form definition from JSON into an organization.
 *
 *   node db/seed-form.mjs db/forms/grease-trap-alameda.json \
 *     --org cmu2yk3ud00007aoggo5i0b65 --creator nate@dev.co [--force]
 *
 * `--creator` is the email of a user IN THAT ORG; the template records them as
 * its author. Re-running is refused when a form with the same title already
 * exists in the org (`--force` writes a new version of that form instead), so
 * this is safe to run twice by mistake.
 *
 * Needs DATABASE_URL. Against the live database run it inside the app
 * container (`docker exec -i -w /app <container> node - < db/seed-form.mjs …`),
 * where `pg` resolves and the database is reachable.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(path.join(process.cwd(), "noop.js"));
const { Pool } = require("pg");

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const orgId = flag("org");
const creatorEmail = flag("creator");
const force = args.includes("--force");

if (!file || !orgId || !creatorEmail) {
  console.error("usage: node db/seed-form.mjs <definition.json> --org <shellOrgId> --creator <email> [--force]");
  process.exit(2);
}

const doc = JSON.parse(await readFile(file, "utf8"));
const { title, description = null, definition } = doc;
if (!title || !definition?.sections) {
  console.error("The JSON needs a `title` and a `definition.sections`.");
  process.exit(2);
}

// The same shape the API enforces, checked here too: a bad seed is worse than a
// refused one, because a broken definition renders as an empty form.
const TYPES = new Set(["short_text", "long_text", "dropdown", "checkboxes", "number", "images", "date", "signature"]);
const ids = new Set();
for (const section of definition.sections) {
  if (!section.id || !section.title) throw new Error("every section needs an id and a title");
  for (const q of section.questions ?? []) {
    if (!q.id || !q.label || !TYPES.has(q.type)) throw new Error(`bad question: ${JSON.stringify(q).slice(0, 120)}`);
    if (ids.has(q.id)) throw new Error(`duplicate question id ${q.id}`);
    ids.add(q.id);
    if ((q.type === "dropdown" || q.type === "checkboxes") && !(q.options?.length > 0)) {
      throw new Error(`"${q.label}" is a ${q.type} with no options`);
    }
    for (const o of q.options ?? []) if (!o.id || !o.label) throw new Error(`bad option in "${q.label}"`);
  }
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  const { rows: [creator] } = await client.query(
    `SELECT id, name FROM users WHERE org_id = $1 AND lower(email) = lower($2) LIMIT 1`, [orgId, creatorEmail]);
  if (!creator) throw new Error(`No user ${creatorEmail} in org ${orgId} — they must sign in to Projects once first.`);

  await client.query("BEGIN");
  const { rows: existing } = await client.query(
    `SELECT id, version FROM form_templates WHERE org_id = $1 AND title = $2 LIMIT 1`, [orgId, title]);

  let templateId;
  let version;
  if (existing.length && !force) {
    throw new Error(`"${title}" already exists in this org (id ${existing[0].id}). Pass --force to add a new version.`);
  } else if (existing.length) {
    templateId = existing[0].id;
    version = existing[0].version + 1;
    await client.query(
      `UPDATE form_templates SET title = $1, description = $2, definition = $3::jsonb, version = $4,
              updated_by = $5, updated_at = now(), status = 'active', archived_at = NULL
         WHERE id = $6`,
      [title, description, JSON.stringify(definition), version, creator.id, templateId]);
  } else {
    version = 1;
    const { rows: [created] } = await client.query(
      `INSERT INTO form_templates (org_id, title, description, definition, created_by, updated_by)
       VALUES ($1, $2, $3, $4::jsonb, $5, $5) RETURNING id`,
      [orgId, title, description, JSON.stringify(definition), creator.id]);
    templateId = created.id;
  }

  await client.query(
    `INSERT INTO form_template_versions (template_id, org_id, version, title, definition, created_by)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)
     ON CONFLICT (template_id, version) DO NOTHING`,
    [templateId, orgId, version, title, JSON.stringify(definition), creator.id]);

  await client.query("COMMIT");
  const questions = definition.sections.reduce((n, s) => n + (s.questions?.length ?? 0), 0);
  console.log(JSON.stringify({ templateId, version, sections: definition.sections.length, questions, author: creator.name }, null, 2));
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(err.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
