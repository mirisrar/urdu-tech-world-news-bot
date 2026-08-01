-- =============================================================================
-- Nexora News — Schema alignment for Bot + Admin CMS (same `news` table)
-- =============================================================================
-- Run in the Supabase SQL editor BEFORE or WITH rls-policy.sql.
-- Safe to re-run (IF NOT EXISTS / DROP NOT NULL guarded where possible).
--
-- Goal: Bot inserts (service_role) and Admin CMS (authenticated) can both
-- read/write the same rows without column-mismatch or NOT NULL errors.
--
-- Bot writes (index.js): title, source, url, category, urdu_title,
--   urdu_summary, article, hashtags, facebook_post, image_prompt, image_url,
--   seo_title (+ publish-status columns).
-- Admin writes (add-news.js): title, urdu_title, category, urdu_summary,
--   article, image_url, hashtags, reading_time, featured, views.
-- Admin does NOT set source/url — those must be nullable (or defaulted).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Admin CMS columns
-- ---------------------------------------------------------------------------
ALTER TABLE news ADD COLUMN IF NOT EXISTS views integer DEFAULT 0;
ALTER TABLE news ADD COLUMN IF NOT EXISTS featured boolean DEFAULT false;
ALTER TABLE news ADD COLUMN IF NOT EXISTS reading_time integer DEFAULT 2;

-- ---------------------------------------------------------------------------
-- 2. Bot / AI / publish columns (no-op if already applied)
-- ---------------------------------------------------------------------------
ALTER TABLE news ADD COLUMN IF NOT EXISTS seo_title text;
ALTER TABLE news ADD COLUMN IF NOT EXISTS seo_description text;
ALTER TABLE news ADD COLUMN IF NOT EXISTS seo_keywords text;
ALTER TABLE news ADD COLUMN IF NOT EXISTS image_credit text;
ALTER TABLE news ADD COLUMN IF NOT EXISTS facebook_post text;
ALTER TABLE news ADD COLUMN IF NOT EXISTS image_prompt text;
ALTER TABLE news ADD COLUMN IF NOT EXISTS fb_post_id text;
ALTER TABLE news ADD COLUMN IF NOT EXISTS telegram_message_id text;
ALTER TABLE news ADD COLUMN IF NOT EXISTS whatsapp_status text;
ALTER TABLE news ADD COLUMN IF NOT EXISTS x_post_id text;
ALTER TABLE news ADD COLUMN IF NOT EXISTS published_at timestamptz;

-- ---------------------------------------------------------------------------
-- 3. Shared columns — ensure Admin inserts don't fail on bot-only fields
-- ---------------------------------------------------------------------------
-- Manual "Add News" from Admin does not set `source` / `url`. If those
-- columns are currently NOT NULL, Admin INSERT will error. Make them nullable.
-- (Bot always fills them for RSS/NewsAPI items.)
ALTER TABLE news ALTER COLUMN source DROP NOT NULL;
ALTER TABLE news ALTER COLUMN url DROP NOT NULL;

-- Helpful defaults for Admin-created rows (optional, keeps UI cleaner).
ALTER TABLE news ALTER COLUMN source SET DEFAULT 'Manual';
ALTER TABLE news ALTER COLUMN views SET DEFAULT 0;
ALTER TABLE news ALTER COLUMN featured SET DEFAULT false;
ALTER TABLE news ALTER COLUMN reading_time SET DEFAULT 2;

-- ---------------------------------------------------------------------------
-- 4. Indexes
-- ---------------------------------------------------------------------------
-- Partial unique index: bot duplicate-prevention still works; multiple
-- Admin-created rows with NULL url are allowed.
CREATE UNIQUE INDEX IF NOT EXISTS news_url_unique_idx
  ON news (url)
  WHERE url IS NOT NULL;

CREATE INDEX IF NOT EXISTS news_category_idx ON news (category);
CREATE INDEX IF NOT EXISTS news_featured_idx ON news (featured)
  WHERE featured = true;
CREATE INDEX IF NOT EXISTS news_created_at_idx ON news (created_at DESC);
