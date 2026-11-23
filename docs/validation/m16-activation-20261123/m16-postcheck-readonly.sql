-- M16 post-activation check (read-only role variant: ownership rule of app_private.client_owns_request inlined, since M16 revokes EXECUTE on it). READ-ONLY. Run only AFTER authorized application:
--   supabase db query --remote=xsxdpaiivklqeudgqoqf --read-only -f docs/validation/client-experience-integration-20261123/m16-postcheck.sql
-- Expected values come from the 23/11/2026 preflight (preflight/*.txt).
SELECT jsonb_build_object(
 'requests_total_expected_4', (SELECT count(*) FROM public.requests),
 'historical_new_fields_null_expected_4', (SELECT count(*) FROM public.requests WHERE created_at < '2026-11-23' AND requested_priority IS NULL AND requested_subsystem_id IS NULL AND requester_name_source IS NULL),
 'historical_urgent_expected_1', (SELECT count(*) FROM public.requests WHERE created_at < '2026-11-23' AND urgent_requested),
 'identities_expected_quipu2_quipufac1', (SELECT jsonb_object_agg(provider,n) FROM (SELECT provider,count(*) n FROM app_private.client_identities GROUP BY 1) x),
 'links_expected_quipu1_quipufac2', (SELECT jsonb_object_agg(provider,n) FROM (SELECT provider,count(*) n FROM app_private.client_request_links GROUP BY 1) x),
 'links_owned_after_m16_expected_3', (SELECT count(*) FROM app_private.client_request_links l JOIN app_private.client_identities i ON i.id=l.identity_id WHERE l.company_id=i.company_id AND l.provider=i.provider AND (i.provider='quipufac' OR l.authenticated_username=i.username OR (l.authenticated_username IS NULL AND i.provider='quipu' AND i.subject_source='username' AND i.subject=i.username))),
 'new_columns_expected_3', (SELECT count(*) FROM pg_attribute WHERE attrelid='public.requests'::regclass AND attname IN ('requested_priority','requested_subsystem_id','requester_name_source') AND NOT attisdropped),
 'requested_priority_default', (SELECT pg_get_expr(adbin,adrelid) FROM pg_attrdef WHERE adrelid='public.requests'::regclass AND adnum=(SELECT attnum FROM pg_attribute WHERE attrelid='public.requests'::regclass AND attname='requested_priority')),
 'm16_triggers_expected_3', (SELECT count(*) FROM pg_trigger WHERE tgname IN ('client_identity_scope_immutable','client_request_link_scope','guard_original_client_inputs')),
 'new_unique_expected_1', (SELECT count(*) FROM pg_constraint WHERE conname='client_identities_scoped_subject_username_key'),
 'old_m13_unique_expected_0', (SELECT count(*) FROM pg_constraint WHERE conrelid='app_private.client_identities'::regclass AND pg_get_constraintdef(oid)='UNIQUE (company_id, provider, subject_source, subject)'),
 'anon_exec_client_subprojects_expected_true', has_function_privilege('anon','public.client_subprojects(text,uuid)','EXECUTE'),
 'submit_client_request_public_exec_expected_false', (has_function_privilege('anon','public.submit_client_request(jsonb,uuid)','EXECUTE') OR has_function_privilege('authenticated','public.submit_client_request(jsonb,uuid)','EXECUTE') OR has_function_privilege('service_role','public.submit_client_request(jsonb,uuid)','EXECUTE')),
 'client_owns_request_public_exec_expected_false', (has_function_privilege('anon','app_private.client_owns_request(uuid,uuid)','EXECUTE') OR has_function_privilege('authenticated','app_private.client_owns_request(uuid,uuid)','EXECUTE'))
) AS m16_postcheck;
