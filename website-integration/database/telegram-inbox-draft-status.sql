-- Allow draft status for multi-message Telegram editor flow
-- (photo first, then full multi-line article text).
-- Run once in Supabase SQL editor. Safe to re-run.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.telegram_inbox'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE telegram_inbox DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE telegram_inbox
  ADD CONSTRAINT telegram_inbox_status_check
  CHECK (status IN ('draft', 'pending', 'processing', 'done', 'failed', 'ignored'));

CREATE INDEX IF NOT EXISTS telegram_inbox_draft_user_idx
  ON telegram_inbox (user_id, created_at DESC)
  WHERE status IN ('draft', 'pending');
