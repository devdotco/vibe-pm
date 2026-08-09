-- FIX 4: add due_time to tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_time time;

-- ADDITION 2: task_watchers
CREATE TABLE IF NOT EXISTS task_watchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  org_id text NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS task_watchers_task_user_idx ON task_watchers(task_id, user_id);
CREATE INDEX IF NOT EXISTS task_watchers_user_idx ON task_watchers(user_id, org_id);

-- ADDITION 3: task_recurrence
CREATE TABLE IF NOT EXISTS task_recurrence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE UNIQUE,
  org_id text NOT NULL,
  frequency text NOT NULL,
  interval int DEFAULT 1 NOT NULL,
  days_of_week int[],
  day_of_month int,
  end_date date,
  max_occurrences int,
  next_due_date date NOT NULL,
  occurrence_count int DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS task_recurrence_next_due_idx ON task_recurrence(next_due_date);
