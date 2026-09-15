-- Forms: Jobber-style job forms (templates, immutable versions, submissions,
-- uploaded photos and signatures). See src/lib/forms/.
--
-- Applied by start.sh with `psql -f` on every boot, errors swallowed, so every
-- statement is idempotent.

CREATE TABLE IF NOT EXISTS "form_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" text NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "status" text DEFAULT 'active' NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "definition" jsonb DEFAULT '{"sections":[]}'::jsonb NOT NULL,
  "default_project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "default_section_id" uuid REFERENCES "sections"("id") ON DELETE SET NULL,
  "default_assignee_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "auto_attach_project_ids" uuid[] DEFAULT '{}' NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "archived_at" timestamp with time zone
);
CREATE INDEX IF NOT EXISTS "form_templates_org_status_idx" ON "form_templates" ("org_id", "status");

CREATE TABLE IF NOT EXISTS "form_template_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "template_id" uuid NOT NULL REFERENCES "form_templates"("id") ON DELETE CASCADE,
  "org_id" text NOT NULL,
  "version" integer NOT NULL,
  "title" text NOT NULL,
  "definition" jsonb NOT NULL,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "form_template_versions_template_version_idx"
  ON "form_template_versions" ("template_id", "version");

CREATE TABLE IF NOT EXISTS "form_submissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" text NOT NULL,
  "template_id" uuid NOT NULL REFERENCES "form_templates"("id"),
  "template_version" integer NOT NULL,
  "title" text NOT NULL,
  "task_id" uuid REFERENCES "tasks"("id") ON DELETE SET NULL,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "crm_company_id" text,
  "crm_company_name" text,
  "crm_person_id" text,
  "crm_person_name" text,
  "crm_person_email" text,
  "status" text DEFAULT 'draft' NOT NULL,
  "answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by" uuid NOT NULL,
  "submitted_by" uuid,
  "submitted_at" timestamp with time zone,
  "crm_synced_at" timestamp with time zone,
  "crm_sync_error" text,
  "last_emailed_at" timestamp with time zone,
  "last_emailed_to" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
CREATE INDEX IF NOT EXISTS "form_submissions_org_template_idx" ON "form_submissions" ("org_id", "template_id", "submitted_at");
CREATE INDEX IF NOT EXISTS "form_submissions_task_idx" ON "form_submissions" ("task_id");
CREATE INDEX IF NOT EXISTS "form_submissions_crm_company_idx" ON "form_submissions" ("org_id", "crm_company_id");
CREATE INDEX IF NOT EXISTS "form_submissions_crm_person_idx" ON "form_submissions" ("org_id", "crm_person_id");

CREATE TABLE IF NOT EXISTS "form_files" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" text NOT NULL,
  "submission_id" uuid NOT NULL REFERENCES "form_submissions"("id") ON DELETE CASCADE,
  "question_id" text NOT NULL,
  "kind" text NOT NULL,
  "storage_key" text NOT NULL UNIQUE,
  "filename" text NOT NULL,
  "content_type" text NOT NULL,
  "size_bytes" integer NOT NULL,
  "uploaded_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "form_files_submission_idx" ON "form_files" ("submission_id");
