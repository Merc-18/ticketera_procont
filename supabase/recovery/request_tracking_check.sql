-- Read-only post-check for 20261118000600_request_tracking. Only Booleans, counts and names.
SELECT jsonb_build_object(
  'ledger_versions', (SELECT count(*) FROM supabase_migrations.schema_migrations),
  'migration_registered', EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261118000600'),
  'triggers', (SELECT string_agg(c.relname || '.' || t.tgname, ', ' ORDER BY 1) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
               WHERE t.tgname IN ('sync_request_status','sync_review_status','sync_flow_phase','sync_project_block')),
  'action_check_extended', (SELECT pg_get_constraintdef(oid) LIKE '%status_changed%' FROM pg_constraint
                            WHERE conrelid = 'public.request_events'::regclass AND conname = 'request_events_action_check'),
  'hits_table_closed', NOT has_table_privilege('anon', 'app_private.public_tracking_hits', 'SELECT'),
  'anon_track_status', has_function_privilege('anon', 'public.track_request_status(text)', 'EXECUTE'),
  'anon_start_review', has_function_privilege('anon', 'public.start_request_review(uuid)', 'EXECUTE'),
  'auth_start_review', has_function_privilege('authenticated', 'public.start_request_review(uuid)', 'EXECUTE'),
  'baseline_events', (SELECT count(*) FROM public.request_events WHERE action = 'status_changed' AND details->>'cause' = 'baseline'),
  'requests', (SELECT count(*) FROM public.requests),
  'statuses', (SELECT jsonb_object_agg(r.request_number, (SELECT e.details->>'to' FROM public.request_events e
               WHERE e.request_id = r.id AND e.action = 'status_changed' ORDER BY e.id DESC LIMIT 1)) FROM public.requests r)
) AS r;
