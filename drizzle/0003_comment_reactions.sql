CREATE TABLE IF NOT EXISTS "comment_reactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "comment_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "org_id" text NOT NULL,
  "emoji" text NOT NULL DEFAULT '👍',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "comment_reactions_unique" UNIQUE ("comment_id", "user_id", "emoji")
);
