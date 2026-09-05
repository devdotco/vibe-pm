-- A person is identified by email WITHIN an organization, never globally.
--
-- `users.email` was UNIQUE across the whole table, so one email meant exactly
-- one row and therefore exactly one `org_id`, permanently. The SSO callback
-- adopts by email, so somebody who already had a row here — every member of
-- our own internal workspace — kept that row and its ORIGINAL org_id when they
-- signed in from a brand-new workspace. Their session was the internal user.
-- They saw internal projects.
--
-- That is a cross-tenant read, and it is the whole reason for this migration.
-- After it, the same email in two organizations is two rows, each scoped to
-- its own org, and the callback matches on (org_id, email).
--
-- Safe to run on existing data: dropping a unique constraint never fails, and
-- (org_id, email) cannot collide because email was globally unique until now.
-- Idempotent — running it twice changes nothing.

ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_email_unique";

CREATE UNIQUE INDEX IF NOT EXISTS "users_org_email_idx"
  ON "users" USING btree ("org_id", "email");
