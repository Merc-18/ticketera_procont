-- Read-only post-check for 20261118000100_account_administration.
-- Returns only Booleans and counts: no business rows, identities or definitions.
SELECT jsonb_build_object(
  'migration_registered', EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations
                                  WHERE version = '20261118000100'
                                    AND name = 'account_administration'),
  'ledger_versions', (SELECT count(*) FROM supabase_migrations.schema_migrations),
  'tables_rls', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE n.nspname = 'app_private'
                   AND c.relname IN ('account_bootstrap', 'account_admin_jobs')
                   AND c.relkind = 'r' AND c.relrowsecurity),
  'tables_closed', NOT EXISTS (
     SELECT 1 FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) r(role),
                   unnest(ARRAY['app_private.account_bootstrap', 'app_private.account_admin_jobs']) t(name),
                   unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p(priv)
     WHERE has_table_privilege(r.role, t.name, p.priv)),
  'rpc_service_role_only', (
     SELECT bool_and(has_function_privilege('service_role', f, 'EXECUTE')
                     AND NOT has_function_privilege('anon', f, 'EXECUTE')
                     AND NOT has_function_privilege('authenticated', f, 'EXECUTE'))
     FROM unnest(ARRAY['public.admin_account_begin(uuid,uuid,text,text,text,text)',
                       'public.admin_account_record(uuid,uuid,uuid)',
                       'public.admin_account_finish(uuid,uuid)']) f),
  'private_functions_closed', (
     SELECT bool_and(NOT has_function_privilege(r, f, 'EXECUTE'))
     FROM unnest(ARRAY['app_private.authorize_account_actor(uuid,text)',
                       'app_private.set_account_permissions(uuid,uuid,text,boolean)',
                       'app_private.bootstrap_superadmin(uuid)']) f,
          unnest(ARRAY['anon', 'authenticated', 'service_role']) r),
  'admin_update_user_authenticated', has_function_privilege('authenticated',
     'public.admin_update_user(uuid,text,boolean)', 'EXECUTE'),
  'auth_users', (SELECT count(*) FROM auth.users),
  'app_users', (SELECT count(*) FROM public.users),
  'bootstrap_rows', (SELECT count(*) FROM app_private.account_bootstrap),
  'job_rows', (SELECT count(*) FROM app_private.account_admin_jobs)
) AS account_admin_check;
