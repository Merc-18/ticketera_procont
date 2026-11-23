-- M16b post-activation check. READ-ONLY. Run only AFTER authorized application of M16 + M16b,
-- together with docs/validation/client-experience-integration-20261123/m16-postcheck.sql.
SELECT jsonb_build_object(
 'history_m16_m16b_expected_2', (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version IN ('20261123000100','20261123000200')),
 'legacy_subsystem_rule_expected_true', position('p_payload ? ''subsystem_id'' AND EXISTS' IN (SELECT prosrc FROM pg_proc WHERE oid='public.submit_client_request(jsonb,uuid)'::regprocedure))>0,
 'quipu_name_discard_expected_true', position('v_payload:=p_payload-''requester_name''' IN (SELECT prosrc FROM pg_proc WHERE oid='public.client_submit_request(text,jsonb,uuid)'::regprocedure))>0,
 'submit_client_request_public_exec_expected_false', has_function_privilege('anon','public.submit_client_request(jsonb,uuid)','EXECUTE') OR has_function_privilege('authenticated','public.submit_client_request(jsonb,uuid)','EXECUTE') OR has_function_privilege('service_role','public.submit_client_request(jsonb,uuid)','EXECUTE'),
 'client_submit_request_exec_expected_anon_auth_service', (SELECT jsonb_agg(r ORDER BY r) FROM unnest(ARRAY['anon','authenticated','service_role']) r WHERE has_function_privilege(r,'public.client_submit_request(text,jsonb,uuid)','EXECUTE'))
) AS m16b_postcheck;

-- Phase 4 (observation): legacy-frontend traffic after activation. Replace the timestamp with the
-- recorded UTC time of the authorized db push. Legacy payloads never include 'requested_priority'.
-- SELECT count(*) AS legacy_client_requests FROM app_private.client_request_links
--   WHERE created_at > '2026-11-23T00:00:00Z'::timestamptz AND NOT original_payload ? 'requested_priority';
