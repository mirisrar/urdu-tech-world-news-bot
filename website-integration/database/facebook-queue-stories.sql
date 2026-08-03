-- =============================================================================
-- Facebook Stories columns on facebook_queue
-- Run in Supabase SQL editor. Safe to re-run.
-- =============================================================================

ALTER TABLE facebook_queue ADD COLUMN IF NOT EXISTS fb_story_id text;
ALTER TABLE facebook_queue ADD COLUMN IF NOT EXISTS story_posted_at timestamptz;
ALTER TABLE facebook_queue ADD COLUMN IF NOT EXISTS story_error text;

CREATE INDEX IF NOT EXISTS facebook_queue_story_pending_idx
  ON facebook_queue (status, story_posted_at)
  WHERE fb_story_id IS NULL;
