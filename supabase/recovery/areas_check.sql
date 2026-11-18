-- Read-only post-check for 20261118000200_areas. Only Booleans and counts.
SELECT jsonb_build_object(
  'migration_registered', EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations
                                  WHERE version = '20261118000200' AND name = 'areas'),
  'ledger_versions', (SELECT count(*) FROM supabase_migrations.schema_migrations),
  'rls_enabled', (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.areas'::regclass),
  'policies', (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'areas'),
  'anon_write', has_table_privilege('anon', 'public.areas', 'INSERT') OR has_table_privilege('anon', 'public.areas', 'UPDATE'),
  'delete_granted', has_table_privilege('authenticated', 'public.areas', 'DELETE') OR has_table_privilege('anon', 'public.areas', 'DELETE'),
  'areas', (SELECT count(*) FROM public.areas)
) AS areas_check;
