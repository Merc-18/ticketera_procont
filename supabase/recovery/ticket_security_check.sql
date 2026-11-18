-- Read-only post-check for 20261118000500_ticket_security. Only Booleans, counts and names.
SELECT jsonb_build_object(
  'ledger_versions', (SELECT count(*) FROM supabase_migrations.schema_migrations),
  'migration_registered', EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations
                                  WHERE version = '20261118000500' AND name = 'ticket_security'),
  'bucket', (SELECT jsonb_build_object('public', public, 'file_size_limit', file_size_limit)
             FROM storage.buckets WHERE id = 'request-attachments'),
  'grants_table_rls', (SELECT relrowsecurity FROM pg_class WHERE oid = 'app_private.request_attachment_grants'::regclass),
  'grants_table_closed', NOT (has_table_privilege('anon','app_private.request_attachment_grants','SELECT')
                              OR has_table_privilege('authenticated','app_private.request_attachment_grants','SELECT')),
  'final_size_trigger', EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'procont_attachment_final_size'
                                AND tgrelid = 'storage.objects'::regclass AND tgdeferrable),
  'storage_policies', (SELECT string_agg(policyname || ':' || cmd, ', ' ORDER BY policyname) FROM pg_policies
                       WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'procont_%'),
  'anon_reserve_batch', has_function_privilege('anon','public.reserve_request_attachments(uuid,uuid,jsonb)','EXECUTE'),
  'anon_reserve_single', has_function_privilege('anon','public.reserve_request_attachment(uuid,uuid,uuid,text,bigint,text)','EXECUTE'),
  'anon_reject_with_notes', has_function_privilege('anon','public.reject_request_with_notes(uuid,text,text)','EXECUTE'),
  'auth_reject_with_notes', has_function_privilege('authenticated','public.reject_request_with_notes(uuid,text,text)','EXECUTE'),
  'anon_publish_reason', has_function_privilege('anon','public.publish_rejection_reason(uuid,text)','EXECUTE'),
  'auth_publish_reason', has_function_privilege('authenticated','public.publish_rejection_reason(uuid,text)','EXECUTE'),
  'anon_private_reject_fn', has_function_privilege('anon','app_private.reject_with_public_message(uuid,text,text)','EXECUTE'),
  'public_rejection_column', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
                                     AND table_name='requests' AND column_name='public_rejection_reason'),
  'requests', (SELECT count(*) FROM public.requests), 'users', (SELECT count(*) FROM public.users),
  'objects', (SELECT count(*) FROM storage.objects WHERE bucket_id = 'request-attachments')
) AS r;
