-- Keep the Dashboard's Postgres Changes subscription in sync with requests.
-- The requests table is protected by RLS and its member_read policy.
DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) THEN
    RAISE EXCEPTION 'Required publication supabase_realtime does not exist';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'requests'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.requests';
  END IF;
END
$migration$;
