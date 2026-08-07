#!/bin/sh
set -e

echo "[startup] Running migrations..."
sed 's/--> statement-breakpoint/;/g' drizzle/0000_init.sql | \
  psql "$DATABASE_URL" --single-transaction -v ON_ERROR_STOP=0 2>&1 | \
  grep -v "^psql\|already exists\|duplicate" || true
echo "[startup] Migrations done."

echo "[startup] Starting Next.js..."
exec node server.js
