-- =============================================================================
-- Nexora News — RLS policies for Bot + Public Website + Admin CMS
-- =============================================================================
-- Run this in the Supabase SQL editor for the SAME project the news bot writes
-- to, and that Nexora News Urdu (public site + admin/) reads from.
--
-- Canonical docs: bot repo DATABASE_SCHEMA.md + SECURITY_GUIDELINES.md
-- Keep both in sync if you change this.
--
-- Roles / who writes what:
--   • anon          → public website (and logged-out browsers): SELECT only
--   • authenticated → Admin CMS (after Supabase Auth login): SELECT + INSERT
--                     + UPDATE + DELETE on `news`; INSERT on Storage
--   • service_role  → news bot (GitHub Actions): bypasses RLS entirely
--                     (SUPABASE_SERVICE_ROLE_KEY — server-side only, NEVER in
--                     website/admin browser code)
--
-- ⚠️ Setup order (critical):
--   1. Add SUPABASE_SERVICE_ROLE_KEY as a GitHub Actions secret for the bot.
--   2. Ensure Admin login uses Supabase Auth (so the JWT role is
--      `authenticated`). A custom localStorage password gate with the anon
--      key will LOSE write access once these policies are applied.
--   3. Run this SQL (and schema-align.sql).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. news table — enable RLS
-- ---------------------------------------------------------------------------
ALTER TABLE news ENABLE ROW LEVEL SECURITY;

-- Drop older/duplicate policies so this file is idempotent / re-runnable.
DROP POLICY IF EXISTS "Public read access on news" ON news;
DROP POLICY IF EXISTS "Anon read access on news" ON news;
DROP POLICY IF EXISTS "Authenticated read access on news" ON news;
DROP POLICY IF EXISTS "Authenticated insert on news" ON news;
DROP POLICY IF EXISTS "Authenticated update on news" ON news;
DROP POLICY IF EXISTS "Authenticated delete on news" ON news;

-- Public site + anyone with the anon key: READ only.
CREATE POLICY "Anon read access on news"
  ON news
  FOR SELECT
  TO anon
  USING (true);

-- Logged-in admin (Supabase Auth session): full CRUD on news.
CREATE POLICY "Authenticated read access on news"
  ON news
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated insert on news"
  ON news
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated update on news"
  ON news
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated delete on news"
  ON news
  FOR DELETE
  TO authenticated
  USING (true);

-- ---------------------------------------------------------------------------
-- 2. Storage bucket `news-images` — public read, authenticated upload
-- ---------------------------------------------------------------------------
-- Create the bucket in the dashboard first (Storage → New bucket → public),
-- OR uncomment the insert below if your project allows it via SQL.
--
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('news-images', 'news-images', true)
-- ON CONFLICT (id) DO UPDATE SET public = true;

-- Idempotent policy cleanup for this bucket.
DROP POLICY IF EXISTS "Public read news-images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload news-images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update news-images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete news-images" ON storage.objects;

-- Anyone can read images (public URLs for website + social previews).
CREATE POLICY "Public read news-images"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'news-images');

-- Admin CMS image upload (add-news.js → storage.from('news-images').upload).
-- Bot uploads use service_role and bypass RLS — no policy needed for the bot.
CREATE POLICY "Authenticated upload news-images"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'news-images');

CREATE POLICY "Authenticated update news-images"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'news-images')
  WITH CHECK (bucket_id = 'news-images');

CREATE POLICY "Authenticated delete news-images"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'news-images');

-- ---------------------------------------------------------------------------
-- 3. Optional — Realtime for live website updates
-- ---------------------------------------------------------------------------
-- ALTER PUBLICATION supabase_realtime ADD TABLE news;
