-- Indexes the board and task panel were reading without.
--
-- task_comments and task_attachments had no index on task_id at all, so every
-- comment count on the board and every activity feed in the task panel was a
-- full scan of task_comments (52k rows by Oct 2026, and the largest table).
-- Every statement is IF NOT EXISTS — this runs on every boot.
CREATE INDEX IF NOT EXISTS "task_comments_task_idx" ON "task_comments" ("task_id");
CREATE INDEX IF NOT EXISTS "task_attachments_task_idx" ON "task_attachments" ("task_id");

-- The board's own query: one project's live top-level tasks, in order.
CREATE INDEX IF NOT EXISTS "tasks_project_parent_position_live_idx"
  ON "tasks" ("project_id", "parent_task_id", "position")
  WHERE "deleted_at" IS NULL;
