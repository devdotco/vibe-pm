#!/bin/sh
set -e

echo "[startup] Running migrations..."
sed 's/--> statement-breakpoint/;/g' drizzle/0000_init.sql | \
  psql "$DATABASE_URL" --single-transaction -v ON_ERROR_STOP=0 2>&1 | \
  grep -v "^psql\|already exists\|duplicate" || true
echo "[startup] Migrations done."

echo "[startup] Running incremental migrations..."
psql "$DATABASE_URL" -c "ALTER TABLE task_comments ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'app';" 2>&1 | grep -v "^psql" || true
psql "$DATABASE_URL" -f drizzle/0001_due_time_watchers_recurrence.sql 2>&1 | grep -v "^psql\|already exists\|duplicate" || true
psql "$DATABASE_URL" -f drizzle/0002_user_preferences.sql 2>&1 | grep -v "^psql\|already exists\|duplicate" || true
psql "$DATABASE_URL" -f drizzle/0003_comment_reactions.sql 2>&1 | grep -v "^psql\|already exists\|duplicate" || true
echo "[startup] Incremental migrations done."

echo "[startup] Starting Next.js..."
exec node server.js
