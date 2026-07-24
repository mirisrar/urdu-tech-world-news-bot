-- Required Row Level Security setup for the website's public, read-only
-- access to the `news` table. Run this in the Supabase SQL editor for the
-- SAME Supabase project the news bot writes to.
--
-- Canonical copy of this lives in the bot repo's DATABASE_SCHEMA.md —
-- keep both in sync if you change this.
--
-- What this does:
--   1. Enables Row Level Security on `news` (if not already enabled).
--   2. Allows the "anon" role (used by the public website) to SELECT
--      (read) every row — there's no sensitive/private data in this
--      table, it's all public news content.
--   3. Does NOT grant INSERT/UPDATE/DELETE to anon — once RLS is enabled,
--      any operation without a matching permissive policy is denied by
--      default. This is what makes it safe to expose the anon key in the
--      website's client-side code: even if someone reads the key out of
--      the browser's network tab, they can only read data, never write.
--
-- The bot itself must use the `service_role` key (which bypasses RLS
-- entirely) to keep writing after this policy is applied — see
-- SUPABASE_SERVICE_ROLE_KEY in the bot repo's DEPLOYMENT_GUIDE.md.

ALTER TABLE news ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access on news"
  ON news
  FOR SELECT
  USING (true);

-- Optional but recommended: enable Realtime on this table so
-- realtime.js's subscribeToNewArticles() can receive live INSERT events.
-- (Supabase dashboard -> Database -> Replication -> toggle "news" on,
-- OR run the equivalent SQL below if your project's Realtime is
-- publication-based.)
--
-- ALTER PUBLICATION supabase_realtime ADD TABLE news;
