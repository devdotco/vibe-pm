# Forms rollout (app.erp.io/pm)

Everything below is deliberate ORDER: one step protects files that the next
step would otherwise destroy.

## 0. Before anything is deployed

**Copy the existing task attachments out of the running container.** Uploads
have been written to `/tmp/vibe-uploads` inside the PM container since the app
was built, so the next deploy — including this one — deletes every file anyone
has attached since the last restart.

```sh
ssh erp-platform                      # 128.140.93.22, ~/.ssh/id_ed25519
docker ps --filter name=vqkz3bvjn5a31czpjc2xfemc     # the PM app container
docker exec -i -w /app <container> sh -c 'ls -R /tmp/vibe-uploads | head'   # is there anything?
```

If there is, add `storage_key` first (0005 has not run yet on the old image):

```sh
docker exec -i <container> psql "$DATABASE_URL" \
  -c 'ALTER TABLE task_attachments ADD COLUMN IF NOT EXISTS storage_key text'
```

then, with the R2 variables from step 1 in the environment:

```sh
docker exec -i -w /app \
  -e R2_ACCOUNT_ID=… -e R2_ACCESS_KEY_ID=… -e R2_SECRET_ACCESS_KEY=… -e R2_BUCKET=… -e R2_PREFIX=pm/ \
  <container> node - < db/copy-tmp-attachments-to-r2.mjs        # DRY_RUN=1 first
```

It is idempotent and reports what it copied. `url` is left alone, so the links
already pasted into comments keep resolving.

## 1. R2

One bucket, private, shared with other apps if you like — `R2_PREFIX` keeps
Projects' objects under their own prefix.

| Variable | Value |
| --- | --- |
| `R2_ACCOUNT_ID` | Cloudflare account id |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | an R2 API token with Object Read & Write on that bucket |
| `R2_BUCKET` | bucket name |
| `R2_PREFIX` | `pm/` (default) |
| `R2_ENDPOINT` | only if not `https://<account>.r2.cloudflarestorage.com` |

No CORS rules are needed: uploads and downloads both go through the app, which
checks the caller's organization and then hands out a 60-second signed URL.

Without these four variables a production boot refuses uploads with a clear
error instead of writing to a disk that disappears.

## 2. The PM → CRM key pair

Projects signs every CRM call with its own Ed25519 key; the CRM holds only the
public half and can therefore verify Projects but never impersonate it.

```sh
node -e 'const {generateKeyPairSync}=require("crypto");
const {privateKey,publicKey}=generateKeyPairSync("ed25519");
require("fs").writeFileSync("pm-service-private.pem",privateKey.export({type:"pkcs8",format:"pem"}),{mode:0o600});
require("fs").writeFileSync("pm-service-public.pem",publicKey.export({type:"spki",format:"pem"}));'
```

- `pm-erp-io` (Coolify `vqkz3bvjn5a31czpjc2xfemc`): `PM_SERVICE_PRIVATE_KEY` =
  the private PEM, `CRM_URL` = `https://app.erp.io/crm`
- `crm-erp-io` (Coolify `lyochb2q4e8dxoqc4aomlgzl`): `PM_SERVICE_PUBLIC_KEY` =
  the public PEM

Coolify stores PEMs with escaped newlines; both sides accept `\n`, real
newlines, or double-escaped.

Keep the private PEM out of the repo. Delete the local copies once both apps
have them.

## 3. Rotate the leaked PM secret

`crm-erp-io` had a working PM inter-service secret written into
`src/lib/crm/pm-sync.ts` and committed on 2026-08-17. The fix removes it, but
it is in git history: generate a new value, set `INTER_SERVICE_SECRET` on
`pm-erp-io` and `PM_INTER_SERVICE_SECRET` on `crm-erp-io` to the same new
string, and check any other app that holds it (the messaging module and the
webhook worker send it as a bearer token).

That sync has been sending the secret in a header PM never reads, to the
retired host `pm.vb.co`, so nothing is currently depending on the old value.

## 4. Other PM variables

| Variable | Why |
| --- | --- |
| `EMAIL_FROM` | the report email's sender; must be a SendGrid-authenticated domain (`notifications@dev.co`, not `@vb.co`) |
| `SENDGRID_API_KEY` | already set; the report email checks SendGrid's answer rather than assuming a 202 |
| `REPORT_TIME_ZONE` | optional, default `America/Los_Angeles` — the timestamp on the customer's PDF |
| `EMAIL_REPLY_SECRET` | must be set: the inbound-mail HMAC no longer falls back to a hard-coded default |
| `BYPASS_SECRET` | **delete it.** `/api/auth/magic` is gone; the variable is now dead weight that used to be a master key |

## 5. Deploy

A push does not deploy either app. Deploy `pm-erp-io`, then `crm-erp-io`
(order matters only in that PM's calls 404 until the CRM has the new routes —
which is recorded on the submission and retried, not lost).

Migrations 0005 and 0006 run from `start.sh` on boot. Both are idempotent and
were checked against a real Postgres.

## 6. Load the Grease Trap form

```sh
docker exec -i -w /app <pm container> node - --org cmu2yk3ud00007aoggo5i0b65 \
  --creator <an admin who has signed in> < db/seed-form.mjs   # see the script header
```

The definition is `db/forms/grease-trap-alameda.json`. **Options marked
`[CONFIRM WORDING]` / `[CONFIRM OPTION]` are incomplete** — Jobber's API does
not expose job-form templates, so anything the screenshots cut off was not
readable. Fix those in the builder before the form is used on a county report.

The county variants (Healdsburg, Petaluma, Contra Costa, Humboldt, Lake,
Marin, …) are copies of this one: duplicate it from the ⋯ menu and change the
jurisdictional maximum.

## 7. Check it end to end

1. Open `app.erp.io/pm/forms` as an admin — the form is listed.
2. Start it, pick a customer, submit it from a phone.
3. The task appears in the project with the form attached.
4. The CRM contact and company each show it under **Forms**, and the timeline
   shows "Form submitted".
5. Download the PDF and the CSV.

Anything that fails at step 4 shows on the submission as a CRM error with a
Retry button; the form itself is never lost.
