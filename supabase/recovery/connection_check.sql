-- Only the actual CLI session and privileges not proven by SQL Editor identity.
-- No business/Auth records, function bodies or credentials.
SELECT jsonb_build_object(
  'current_user', current_user,
  'session_user', session_user,
  'database_oid', (SELECT oid FROM pg_database WHERE datname = current_database()),
  'server_version_num', current_setting('server_version_num')::integer,
  -- With a pooler this describes its backend leg, not the client's TLS session.
  'server_connection_ssl', (SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()),
  'checks', jsonb_build_object(
    'postgres_operator', current_user = 'postgres' AND session_user = 'postgres',
    'database_postgres', current_database() = 'postgres',
    'read_only', current_setting('transaction_read_only') = 'on',
    'database_create_temp', has_database_privilege(current_database(), 'CREATE')
      AND has_database_privilege(current_database(), 'TEMP'),
    'public_usage_create', has_schema_privilege('public', 'USAGE')
      AND has_schema_privilege('public', 'CREATE'),
    'public_owner', (SELECT pg_has_role(nspowner, 'USAGE') FROM pg_namespace WHERE nspname = 'public'),
    'auth_usage_references', has_schema_privilege('auth', 'USAGE')
      AND has_column_privilege('auth.users', 'id', 'REFERENCES'),
    'auth_source_select', has_column_privilege('auth.users', 'id', 'SELECT')
      AND has_column_privilege('auth.users', 'email', 'SELECT')
      AND has_column_privilege('auth.users', 'raw_user_meta_data', 'SELECT')
      AND NOT row_security_active('auth.users'),
    'auth_uid', coalesce((SELECT prorettype = 'uuid'::regtype AND has_function_privilege(oid, 'EXECUTE')
      FROM pg_proc WHERE oid = to_regprocedure('auth.uid()')), false),
    'languages', (SELECT count(*) = 2 AND bool_and(lanpltrusted AND has_language_privilege(oid, 'USAGE'))
      FROM pg_language WHERE lanname IN ('sql', 'plpgsql')),
    'platform_roles', (SELECT count(*) = 3 FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role')),
    'realtime_owner', coalesce((SELECT NOT puballtables AND pg_has_role(pubowner, 'USAGE')
      FROM pg_publication WHERE pubname = 'supabase_realtime'), false)
  )
) AS connection_identity;
