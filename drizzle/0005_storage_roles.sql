-- Object storage for attachments, and the shell role that decides who
-- administers Projects for an organization.
--
-- Applied by start.sh with `psql -f` on every boot, statement by statement and
-- with errors swallowed, so EVERY statement here must be idempotent. There is
-- no migrations table; running this file twice must change nothing.

-- Task attachments used to live in the container's /tmp and vanished on every
-- redeploy. New uploads go to R2 and record their key here; NULL = legacy row.
ALTER TABLE "task_attachments" ADD COLUMN IF NOT EXISTS "storage_key" text;

-- The suite role from the last shell hand-off. NULL for magic-link-only users.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "shell_role" text;
