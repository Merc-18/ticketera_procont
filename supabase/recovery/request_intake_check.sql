-- Read-only post-check for 20261118000400_request_intake. Only Booleans, counts and names.
SELECT jsonb_build_object(
  'ledger_versions', (SELECT count(*) FROM supabase_migrations.schema_migrations),
  'migration_registered', EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations
                                  WHERE version = '20261118000400' AND name = 'request_intake'),
  'request_types', (SELECT string_agg(name, ', ' ORDER BY sort_order) FROM public.request_types),
  'rls', (SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN ('public.request_types'::regclass, 'public.request_events'::regclass)),
  'policies_request_types', (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='request_types'),
  'policies_request_events', (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='request_events'),
  'bucket', (SELECT jsonb_build_object('public', public, 'limit', file_size_limit) FROM storage.buckets WHERE id = 'request-attachments'),
  'storage_policies', (SELECT string_agg(policyname || ':' || cmd, ', ' ORDER BY policyname) FROM pg_policies
                       WHERE schemaname='storage' AND tablename='objects' AND policyname LIKE 'procont_%'),
  'triggers', (SELECT string_agg(tgname, ', ' ORDER BY tgname) FROM pg_trigger WHERE tgrelid='public.requests'::regclass AND NOT tgisinternal),
  'anon_submit_client', has_function_privilege('anon', 'public.submit_client_request(jsonb,uuid)', 'EXECUTE'),
  'anon_submit_legacy', has_function_privilege('anon', 'public.submit_request(jsonb,uuid)', 'EXECUTE')
                        OR has_function_privilege('anon', 'public.submit_classified_request(jsonb,jsonb,uuid)', 'EXECUTE'),
  'anon_classify', has_function_privilege('anon', 'public.classify_request(uuid,jsonb)', 'EXECUTE'),
  'auth_classify', has_function_privilege('authenticated', 'public.classify_request(uuid,jsonb)', 'EXECUTE'),
  'requests', (SELECT count(*) FROM public.requests), 'users', (SELECT count(*) FROM public.users)
) AS r;
