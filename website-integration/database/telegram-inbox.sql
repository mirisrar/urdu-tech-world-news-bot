-- =============================================================================
-- Telegram editor inbox (GitHub Actions polling)
-- Run in Supabase SQL editor. Safe to re-run.
-- =============================================================================

CREATE TABLE IF NOT EXISTS telegram_inbox (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  update_id bigint NOT NULL,
  chat_id bigint NOT NULL,
  user_id bigint,
  username text,
  message_id bigint,
  photo_file_id text,
  caption text,
  text_body text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'done', 'failed', 'ignored')),
  news_id bigint REFERENCES news (id) ON DELETE SET NULL,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  CONSTRAINT telegram_inbox_update_id_unique UNIQUE (update_id)
);

CREATE INDEX IF NOT EXISTS telegram_inbox_pending_idx
  ON telegram_inbox (status, created_at)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS telegram_bot_state (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE telegram_inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_bot_state ENABLE ROW LEVEL SECURITY;

-- Bot uses service_role (bypasses RLS). No anon write policies.
DROP POLICY IF EXISTS telegram_inbox_authenticated_select ON telegram_inbox;
CREATE POLICY telegram_inbox_authenticated_select
  ON telegram_inbox
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS telegram_bot_state_authenticated_select ON telegram_bot_state;
CREATE POLICY telegram_bot_state_authenticated_select
  ON telegram_bot_state
  FOR SELECT
  TO authenticated
  USING (true);
