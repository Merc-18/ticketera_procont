-- Migration 4 compensation BODY: execute only via the guarded offline builder.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_temp.procont_recovery_guard WHERE stage=4) THEN
    RAISE EXCEPTION 'Missing reviewed recovery context';
  END IF;
END $$;
DELETE FROM pg_temp.procont_recovery_guard WHERE stage=4;
-- Full template checksum/count has been checked against snapshot 4.
DELETE FROM public.checklist_templates;
