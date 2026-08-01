-- =============================================================================
-- One-time: allow status = 'scheduled' for Facebook native Scheduled posts
-- Run if facebook_queue already exists from the earlier migration.
-- =============================================================================

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.facebook_queue'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE facebook_queue DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE facebook_queue
  ADD CONSTRAINT facebook_queue_status_check
  CHECK (status IN ('pending', 'scheduled', 'posted', 'failed', 'cancelled'));
