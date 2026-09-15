#!/usr/bin/env node
/**
 * Prove an R2 credential works, before it is set on a live app.
 *
 *   R2_ACCOUNT_ID=… R2_ACCESS_KEY_ID=… R2_SECRET_ACCESS_KEY=… R2_BUCKET=… \
 *     node db/check-r2.mjs
 *
 * Writes one small object under `<R2_PREFIX>_healthcheck/`, reads it back,
 * checks the bytes match, then deletes it. Nothing else in the bucket is
 * touched, and it never lists or reads anything it did not write — so it is
 * safe to run against a bucket another app already uses.
 *
 * Same signing code path as the app (src/lib/storage/r2.ts), so a pass here
 * means uploads will work, not merely that the key exists.
 */
import { createHash, createHmac, randomBytes } from "node:crypto";

const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_ENDPOINT } = process.env;
const PREFIX = (() => { const p = process.env.R2_PREFIX ?? "pm/"; return p && !p.endsWith("/") ? `${p}/` : p; })();

const missing = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"].filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing: ${missing.join(", ")}`);
  process.exit(2);
}

const host = new URL(R2_ENDPOINT || `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`).host;
const rfc3986 = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
const hmac = (k, d) => createHmac("sha256", k).update(d).digest();

function presign(method, key, expires = 120) {
  const stamp = new Date().toISOString().replace(/[:-]/g, "").replace(/\.\d{3}/, "");
  const scope = `${stamp.slice(0, 8)}/auto/s3/aws4_request`;
  const path = `/${rfc3986(R2_BUCKET)}/${key.split("/").map(rfc3986).join("/")}`;
  const q = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${R2_ACCESS_KEY_ID}/${scope}`,
    "X-Amz-Date": stamp,
    "X-Amz-Expires": String(expires),
    "X-Amz-SignedHeaders": "host",
  };
  const cq = Object.keys(q).sort().map((k) => `${rfc3986(k)}=${rfc3986(q[k])}`).join("&");
  const creq = [method, path, cq, `host:${host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const sts = ["AWS4-HMAC-SHA256", stamp, scope, createHash("sha256").update(creq).digest("hex")].join("\n");
  const signing = hmac(hmac(hmac(hmac(`AWS4${R2_SECRET_ACCESS_KEY}`, stamp.slice(0, 8)), "auto"), "s3"), "aws4_request");
  return `https://${host}${path}?${cq}&X-Amz-Signature=${createHmac("sha256", signing).update(sts).digest("hex")}`;
}

const key = `${PREFIX}_healthcheck/${randomBytes(8).toString("hex")}.txt`;
const payload = `erp.io Projects R2 check ${new Date().toISOString()}`;
const step = (ok, text) => console.log(`${ok ? "  ok  " : " FAIL "} ${text}`);

let failed = false;
try {
  console.log(`bucket ${R2_BUCKET} at ${host}`);
  console.log(`object ${key}\n`);

  const put = await fetch(presign("PUT", key), { method: "PUT", body: payload, headers: { "content-type": "text/plain" } });
  step(put.ok, `write  (${put.status}${put.ok ? "" : " " + (await put.text()).slice(0, 200)})`);
  failed ||= !put.ok;

  if (put.ok) {
    const get = await fetch(presign("GET", key));
    const body = get.ok ? await get.text() : "";
    const same = body === payload;
    step(get.ok && same, `read   (${get.status}${get.ok && !same ? ", bytes differ" : ""})`);
    failed ||= !(get.ok && same);

    const del = await fetch(presign("DELETE", key), { method: "DELETE" });
    step(del.ok || del.status === 404, `delete (${del.status})`);
    failed ||= !(del.ok || del.status === 404);
  }
} catch (err) {
  step(false, `could not reach R2: ${err.message}`);
  failed = true;
}

console.log(failed
  ? "\nThese credentials will NOT work. Check the key has Object Read & Write on this bucket."
  : "\nThese credentials work: read, write and delete, on this bucket only.");
process.exit(failed ? 1 : 0);
