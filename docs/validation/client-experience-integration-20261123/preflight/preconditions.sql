SELECT jsonb_build_object(
 'server_version', current_setting('server_version'),
 'requests_new_cols_present', (SELECT count(*) FROM pg_attribute WHERE attrelid='public.requests'::regclass AND attname IN ('requested_priority','requested_subsystem_id','requester_name_source') AND NOT attisdropped),
 'links_username_col_present', (SELECT count(*) FROM pg_attribute WHERE attrelid='app_private.client_request_links'::regclass AND attname='authenticated_username' AND NOT attisdropped),
 'm13_identity_unique_exact', (SELECT count(*) FROM pg_constraint WHERE conrelid='app_private.client_identities'::regclass AND contype='u' AND pg_get_constraintdef(oid)='UNIQUE (company_id, provider, subject_source, subject)'),
 'subsystems_unique_id_system', (SELECT count(*) FROM pg_constraint WHERE conrelid='public.catalog_subsystems'::regclass AND contype IN ('u','p') AND pg_get_constraintdef(oid) IN ('UNIQUE (id, system_id)','UNIQUE (system_id, id)')),
 'm16_functions_present', (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE (n.nspname,p.proname) IN (('public','client_subprojects'),('app_private','client_owns_request'),('app_private','guard_original_client_inputs'))),
 'm16_triggers_present', (SELECT count(*) FROM pg_trigger WHERE tgname IN ('client_identity_scope_immutable','client_request_link_scope','guard_original_client_inputs')),
 'requests_triggers', (SELECT jsonb_agg(tgname ORDER BY tgname) FROM pg_trigger WHERE tgrelid='public.requests'::regclass AND NOT tgisinternal),
 'requests_total', (SELECT count(*) FROM public.requests),
 'requests_req_series', (SELECT count(*) FROM public.requests WHERE number_series='REQ'),
 'catalog_systems', (SELECT count(*) FROM public.catalog_systems),
 'catalog_subsystems_active', (SELECT count(*) FROM public.catalog_subsystems WHERE is_active),
 'requests_with_subsystem_outside_system', (SELECT count(*) FROM public.requests r JOIN public.catalog_subsystems c ON c.id=r.subsystem_id WHERE c.system_id IS DISTINCT FROM r.system_id)
) AS preflight;
