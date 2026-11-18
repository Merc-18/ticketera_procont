-- Read-only post-check for 20261118000300_ticket_catalogs. Only Booleans, counts and names.
SELECT jsonb_build_object(
  'ledger_versions', (SELECT count(*) FROM supabase_migrations.schema_migrations),
  'migration_registered', EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations
                                  WHERE version = '20261118000300' AND name = 'ticket_catalogs'),
  'systems', (SELECT count(*) FROM public.catalog_systems),
  'subprojects', (SELECT count(*) FROM public.catalog_subsystems),
  'studios', (SELECT count(*) FROM public.studios),
  'studio_codes', (SELECT count(*) FROM public.studio_codes),
  'areas', (SELECT count(*) FROM public.areas WHERE parent_id IS NULL),
  'subareas', (SELECT count(*) FROM public.areas WHERE parent_id IS NOT NULL),
  'areas_only_business_accompanying', NOT EXISTS (SELECT 1 FROM public.areas a JOIN public.studios s ON s.id = a.studio_id
                                       WHERE s.name <> 'BUSINESS ACCOMPANYING SAC') AND NOT EXISTS (SELECT 1 FROM public.areas WHERE studio_id IS NULL),
  'quipu_once', (SELECT count(*) FROM public.catalog_systems WHERE name = 'Quipu'),
  'shared_ruc_flagged', (SELECT count(*) FROM public.studios WHERE ruc = '20602111602' AND review_note IS NOT NULL),
  'rls_enabled', (SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN ('public.catalog_systems'::regclass,
                  'public.catalog_subsystems'::regclass, 'public.studios'::regclass, 'public.studio_codes'::regclass, 'public.areas'::regclass)),
  'policies', (SELECT jsonb_object_agg(tablename, n) FROM (SELECT tablename, count(*) n FROM pg_policies
               WHERE schemaname = 'public' AND tablename IN ('catalog_systems','catalog_subsystems','studios','studio_codes','areas')
               GROUP BY tablename) p),
  'delete_granted', EXISTS (SELECT 1 FROM unnest(ARRAY['catalog_systems','catalog_subsystems','studios','studio_codes','areas']) t,
                            unnest(ARRAY['anon','authenticated']) r WHERE has_table_privilege(r, 'public.' || t, 'DELETE')),
  'triggers', (SELECT count(*) FROM pg_trigger WHERE tgname IN ('guard_request_classification','check_area_hierarchy') AND NOT tgisinternal),
  'rpcs', (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
           AND p.proname IN ('submit_classified_request','assign_request_studio_code')),
  'users', (SELECT count(*) FROM public.users), 'auth_users', (SELECT count(*) FROM auth.users),
  'requests', (SELECT count(*) FROM public.requests)
) AS r;
