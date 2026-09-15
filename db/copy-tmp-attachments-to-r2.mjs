#!/usr/bin/env node
/**
 * ONE-OFF: copy task attachments out of the running container's /tmp into R2.
 *
 * Until migration 0005 every upload was written to /tmp/vibe-uploads/<taskId>/
 * <name> INSIDE the container. A redeploy replaces the container, so whatever
 * is still there dies with it — including the deploy that ships the R2 fix.
 * Run this in the CURRENT container, after 0005 has added `storage_key`, and
 * before redeploying:
 *
 *   docker exec -i -w /app -e R2_ACCOUNT_ID=… -e R2_ACCESS_KEY_ID=… \
 *     -e R2_SECRET_ACCESS_KEY=… -e R2_BUCKET=… <container> node - < db/copy-tmp-attachments-to-r2.mjs
 *
 * (-w /app so `pg` resolves from the standalone node_modules.) Add DRY_RUN=1 to
 * report without writing. Idempotent: rows that already have a storage_key are
 * skipped, so a second run copies nothing.
 *
 * It needs `storage_key` to exist. If the running image predates 0005, apply
 * just that column first:
 *   psql "$DATABASE_URL" -c 'ALTER TABLE task_attachments ADD COLUMN IF NOT EXISTS storage_key text'
 *
 * Only the key is written. `url` is left alone: the legacy URL is pasted into
 * comments as markdown, and the files route still resolves it by filename,
 * now finding the row's storage_key and redirecting to R2.
 */
import { createHash, createHmac, randomBytes } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(path.join(process.cwd(), "noop.js"));
const { Pool } = require("pg");

const ROOT = "/tmp/vibe-uploads";
const DRY = process.env.DRY_RUN === "1";
const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_ENDPOINT } = process.env;
const PREFIX = (() => { const p = process.env.R2_PREFIX ?? "pm/"; return p && !p.endsWith("/") ? `${p}/` : p; })();
if (!DRY && !(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET)) {
  console.error("R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET are required (or DRY_RUN=1)");
  process.exit(2);
}

const rfc3986 = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
const hmac = (k, d) => createHmac("sha256", k).update(d).digest();
function presignPut(key) {
  const host = new URL(R2_ENDPOINT || `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`).host;
  const stamp = new Date().toISOString().replace(/[:-]/g, "").replace(/\.\d{3}/, "");
  const scope = `${stamp.slice(0, 8)}/auto/s3/aws4_request`;
  const p = `/${rfc3986(R2_BUCKET)}/${key.split("/").map(rfc3986).join("/")}`;
  const q = { "X-Amz-Algorithm": "AWS4-HMAC-SHA256", "X-Amz-Credential": `${R2_ACCESS_KEY_ID}/${scope}`, "X-Amz-Date": stamp, "X-Amz-Expires": "300", "X-Amz-SignedHeaders": "host" };
  const cq = Object.keys(q).sort().map((k) => `${rfc3986(k)}=${rfc3986(q[k])}`).join("&");
  const creq = ["PUT", p, cq, `host:${host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const sts = ["AWS4-HMAC-SHA256", stamp, scope, createHash("sha256").update(creq).digest("hex")].join("\n");
  const key4 = hmac(hmac(hmac(hmac(`AWS4${R2_SECRET_ACCESS_KEY}`, stamp.slice(0, 8)), "auto"), "s3"), "aws4_request");
  return `https://${host}${p}?${cq}&X-Amz-Signature=${createHmac("sha256", key4).update(sts).digest("hex")}`;
}
const sanitize = (n) => n.replace(/[^a-zA-Z0-9._-]/g, "_");
const seg = (s) => s.replace(/[^a-zA-Z0-9_-]/g, "_");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const stats = { files: 0, copied: 0, noRow: 0, alreadyStored: 0, failed: 0 };

let taskDirs = [];
try { taskDirs = await readdir(ROOT); } catch { console.log(`${ROOT} does not exist — nothing to copy.`); }

for (const taskId of taskDirs) {
  const files = await readdir(path.join(ROOT, taskId)).catch(() => []);
  for (const name of files) {
    stats.files++;
    // Newest row for this (task, sanitized filename) — the /tmp scheme overwrote same-named files,
    // so the bytes on disk belong to the most recent upload.
    const { rows } = await pool.query(
      `SELECT id, org_id, filename, file_type, storage_key FROM task_attachments
        WHERE task_id::text = $1 ORDER BY created_at DESC`, [taskId]);
    const row = rows.find((r) => sanitize(r.filename) === name);
    if (!row) { stats.noRow++; console.log(`no row   ${taskId}/${name}`); continue; }
    if (row.storage_key) { stats.alreadyStored++; continue; }
    const key = `${seg(row.org_id)}/tasks/${seg(taskId)}/${randomBytes(8).toString("hex")}-${name}`;
    if (DRY) { stats.copied++; console.log(`would copy ${taskId}/${name} -> ${PREFIX}${key}`); continue; }
    try {
      const body = await readFile(path.join(ROOT, taskId, name));
      const res = await fetch(presignPut(PREFIX + key), { method: "PUT", body, headers: { "content-type": row.file_type || "application/octet-stream" } });
      if (!res.ok) throw new Error(`R2 ${res.status}`);
      await pool.query(`UPDATE task_attachments SET storage_key = $1 WHERE id = $2 AND storage_key IS NULL`, [key, row.id]);
      stats.copied++;
      console.log(`copied   ${taskId}/${name} (${body.length} bytes)`);
    } catch (err) {
      stats.failed++;
      console.error(`FAILED   ${taskId}/${name}: ${err.message}`);
    }
  }
}

const { rows: [{ n }] } = await pool.query(`SELECT count(*)::int AS n FROM task_attachments WHERE storage_key IS NULL AND url LIKE '%/attachments/files/%'`);
console.log(JSON.stringify({ ...stats, dryRun: DRY, uploadRowsStillWithoutStorage: n }));
await pool.end();
process.exit(stats.failed ? 1 : 0);
