-- Read-only post-check for 20261118000700_business_metrics. Only Booleans, counts and names.
SELECT jsonb_build_object(
  'ledger_versions', (SELECT count(*) FROM supabase_migrations.schema_migrations),
  'migration_registered', EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261118000700'),
  'paired_cohort_definition', (SELECT pg_get_functiondef('public.metrics_time_averages(integer,uuid)'::regprocedure) LIKE '%paired_complete%'),
  'grants', (SELECT jsonb_object_agg(f, jsonb_build_object('anon', has_function_privilege('anon', f, 'EXECUTE'),
             'authenticated', has_function_privilege('authenticated', f, 'EXECUTE')))
             FROM unnest(ARRAY['public.metrics_time_averages(integer,uuid)','public.metrics_monthly_urgency(text)',
               'public.metrics_requester_urgency(uuid,text)','public.get_ticket_performance(uuid)',
               'public.get_ticket_performance_summary(uuid)','public.get_requester_urgency_month(date,uuid)',
               'public.track_request_status(text)']) f),
  'private_helpers_closed', NOT has_function_privilege('authenticated', 'app_private.ticket_performance(uuid)', 'EXECUTE'),
  'requests', (SELECT jsonb_agg(jsonb_build_object('n', request_number, 'updated', updated_at, 'name_len', length(requester_name))) FROM public.requests)
) AS r;
