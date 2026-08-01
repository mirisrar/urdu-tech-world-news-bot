-- =============================================================================
-- Nexora News — Facebook publish queue + SEO / image credit columns
-- =============================================================================
-- Run in Supabase SQL editor (service_role / dashboard). Safe to re-run.
--
-- Bot: enqueue on save → Graph API native Scheduled post (published=false).
-- Website: seo_* already used by article.html; image_credit optional UI later.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. news columns (B2 / B3-bot)
-- ---------------------------------------------------------------------------
ALTER TABLE news ADD COLUMN IF NOT EXISTS seo_title text;
ALTER TABLE news ADD COLUMN IF NOT EXISTS seo_description text;
ALTER TABLE news ADD COLUMN IF NOT EXISTS seo_keywords text;
ALTER TABLE news ADD COLUMN IF NOT EXISTS image_credit text;

-- ---------------------------------------------------------------------------
-- 2. facebook_queue (B4 / B5) — tracks Meta Scheduled posts
--    status: pending → scheduled (on Facebook) → posted (after go-live)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS facebook_queue (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  news_id bigint NOT NULL REFERENCES news (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'scheduled', 'posted', 'failed', 'cancelled')),
  scheduled_at timestamptz NOT NULL,
  posted_at timestamptz,
  fb_post_id text,
  post_text text,
  image_url text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT facebook_queue_news_id_unique UNIQUE (news_id)
);

-- If table already existed without 'scheduled', widen the check constraint:
DO $$
BEGIN
  ALTER TABLE facebook_queue DROP CONSTRAINT IF EXISTS facebook_queue_status_check;
EXCEPTION WHEN undefined_object THEN
  NULL;
END $$;

DO $$
BEGIN
  -- Postgres auto-name for column CHECK may vary; drop any status check then re-add.
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.facebook_queue'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE facebook_queue DROP CONSTRAINT ' || quote_ident(conname)
      FROM pg_constraint
      WHERE conrelid = 'public.facebook_queue'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) ILIKE '%status%'
      LIMIT 1
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

ALTER TABLE facebook_queue DROP CONSTRAINT IF EXISTS facebook_queue_status_check;
ALTER TABLE facebook_queue
  ADD CONSTRAINT facebook_queue_status_check
  CHECK (status IN ('pending', 'scheduled', 'posted', 'failed', 'cancelled'));

CREATE INDEX IF NOT EXISTS facebook_queue_due_idx
  ON facebook_queue (status, scheduled_at);

CREATE INDEX IF NOT EXISTS facebook_queue_news_id_idx
  ON facebook_queue (news_id);

-- ---------------------------------------------------------------------------
-- 3. RLS — bot uses service_role (bypasses RLS). Lock down anon.
-- ---------------------------------------------------------------------------
ALTER TABLE facebook_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS facebook_queue_anon_deny ON facebook_queue;
-- No anon policies = anon cannot read/write. service_role bypasses RLS.
-- Authenticated admin may SELECT for debugging (optional).
DROP POLICY IF EXISTS facebook_queue_authenticated_select ON facebook_queue;
CREATE POLICY facebook_queue_authenticated_select
  ON facebook_queue
  FOR SELECT
  TO authenticated
  USING (true);
