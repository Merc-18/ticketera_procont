-- Synthetic records only. Loaded ONLY by the isolated test runner.
CREATE SCHEMA test;
GRANT USAGE ON SCHEMA test TO anon,authenticated;
CREATE TABLE test.checks(label text PRIMARY KEY);
CREATE TABLE test.results(name text PRIMARY KEY,value jsonb NOT NULL);
GRANT ALL ON test.checks,test.results TO anon,authenticated;
CREATE FUNCTION test.ok(condition boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF;
  INSERT INTO test.checks VALUES (label);
END $$;
CREATE FUNCTION test.expect_error(statement text,expected text,label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual text;
BEGIN
  BEGIN
    EXECUTE statement;
    SET CONSTRAINTS ALL IMMEDIATE;
  EXCEPTION WHEN OTHERS THEN actual := SQLSTATE;
  END;
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'FAIL: %, expected SQLSTATE %, got %',label,expected,actual;
  END IF;
  INSERT INTO test.checks VALUES (label);
END $$;

SELECT test.ok((SELECT count(*)=0 FROM public.users),'migrations contain no accounts');
SELECT test.ok((SELECT count(*)=0 FROM public.requests),'migrations contain no business records');
SELECT test.ok((SELECT count(*)=35 FROM public.checklist_templates),'generic reference checklist matches current defaults');
SELECT test.ok((SELECT bool_and(c.relrowsecurity) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname IN ('public','app_private') AND c.relkind='r'),'RLS enabled on every application table');
SELECT test.ok((SELECT bool_and(p.proconfig @> ARRAY['search_path=""']) FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','app_private') AND p.prosecdef),
  'definer functions have empty search_path');
SELECT test.ok(NOT has_function_privilege('anon','app_private.bootstrap_superadmin(uuid)','EXECUTE')
  AND NOT has_function_privilege('authenticated','app_private.next_number(text)','EXECUTE'),
  'bootstrap and counters inaccessible to API roles');
SELECT test.ok((SELECT count(*)=3 FROM pg_publication_tables WHERE pubname='supabase_realtime'),
  'only three required realtime tables published');

INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('10000000-0000-4000-8000-000000000001','super@example.invalid','{"role":"superadmin","is_active":true}'),
 ('10000000-0000-4000-8000-000000000002','admin@example.invalid','{}'),
 ('10000000-0000-4000-8000-000000000003','developer@example.invalid','{}'),
 ('10000000-0000-4000-8000-000000000004','viewer@example.invalid','{}'),
 ('10000000-0000-4000-8000-000000000005','inactive@example.invalid','{}');
-- Explicit owner provisioning replaces the former trigger on platform-owned Auth.
-- This historical suite is NOT run by the 2B.3D checks.
SELECT app_private.provision_auth_profile(id) FROM auth.users;
SELECT test.ok((SELECT bool_and(role='viewer' AND NOT is_active) FROM public.users),
  'explicit provisioning ignores role metadata and creates inactive viewers');
SELECT app_private.bootstrap_superadmin('10000000-0000-4000-8000-000000000001');
SELECT test.expect_error($q$SELECT app_private.bootstrap_superadmin('10000000-0000-4000-8000-000000000002')$q$,
  '23514','bootstrap can run only before first active superadmin');

SET ROLE authenticated;
SET request.jwt.claim.sub='10000000-0000-4000-8000-000000000001';
SELECT public.admin_update_user('10000000-0000-4000-8000-000000000002','admin',true);
SELECT public.admin_update_user('10000000-0000-4000-8000-000000000003','developer',true);
SELECT public.admin_update_user('10000000-0000-4000-8000-000000000004','viewer',true);
SELECT test.expect_error($q$SELECT public.admin_update_user('10000000-0000-4000-8000-000000000001','viewer',true)$q$,
  '23514','last active superadmin cannot be demoted');
RESET ROLE;

SET ROLE anon;
SET request.jwt.claim.sub='';
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['users','requests','projects','project_flows','checklist_items',
    'checklist_templates','comments','activity_logs','notifications'] LOOP
    PERFORM test.expect_error(format('SELECT * FROM public.%I',t),'42501','anon cannot read '||t);
  END LOOP;
END $$;
SELECT test.expect_error('SELECT * FROM app_private.request_access','42501','anon cannot read tracking tokens');
SELECT test.expect_error($q$SELECT public.submit_request('{
 "requester_name":"Persona ficticia","requester_area":"Área ficticia","request_type":"Prueba",
 "description":"Prueba","status":"approved"}','30000000-0000-4000-8000-000000000001')$q$,
 '22023','public submission rejects protected status');
INSERT INTO test.results VALUES ('request',public.submit_request('{
 "requester_name":"Persona ficticia","requester_email":"person@example.invalid",
 "requester_area":"Área ficticia","request_type":"Prueba","description":"Contenido ficticio"}',
 '30000000-0000-4000-8000-000000000002'));
SELECT test.ok((SELECT value=public.submit_request('{
 "requester_name":"Persona ficticia","requester_email":"person@example.invalid",
 "requester_area":"Área ficticia","request_type":"Prueba","description":"Contenido ficticio"}',
 '30000000-0000-4000-8000-000000000002') FROM test.results WHERE name='request'),'anonymous retry returns same result');
SELECT test.expect_error($q$SELECT public.submit_request('{"description":"Different"}',
 '30000000-0000-4000-8000-000000000002')$q$,'22023','key reuse with different payload rejected');
SELECT test.ok((SELECT public.track_request(value->>'request_number',(value->>'tracking_token')::uuid)->>'status'='pending'
  FROM test.results WHERE name='request'),'tracking accepts correct number and token');
SELECT test.ok((SELECT public.track_request(value->>'request_number',gen_random_uuid()) IS NULL
  FROM test.results WHERE name='request'),'tracking rejects wrong token');
SELECT test.ok((SELECT NOT (public.track_request(value->>'request_number',(value->>'tracking_token')::uuid)
  ?| ARRAY['requester_email','description','requester_name']) FROM test.results WHERE name='request'),
  'public tracking excludes identity and description');
RESET ROLE;

SET ROLE authenticated;
SET request.jwt.claim.sub='10000000-0000-4000-8000-000000000004';
SELECT test.ok((SELECT count(*)=1 FROM public.requests),'active viewer can read workspace');
SELECT test.expect_error($q$SELECT public.create_internal_project('{"title":"No","description":"No",
 "project_type":"development"}',gen_random_uuid())$q$,'42501','viewer cannot create project');
SELECT test.expect_error($q$UPDATE public.users SET role='superadmin' WHERE id=auth.uid()$q$,'42501',
  'viewer cannot update sensitive role column');
SELECT test.expect_error($q$UPDATE public.users SET is_active=true WHERE id=auth.uid()$q$,'42501',
  'viewer cannot update activation column');
UPDATE public.users SET full_name='Nombre ficticio' WHERE id=auth.uid();
SELECT test.ok((SELECT full_name='Nombre ficticio' FROM public.users WHERE id=auth.uid()),'own name can be updated');
UPDATE public.users SET full_name='Cambio ajeno' WHERE id='10000000-0000-4000-8000-000000000003';
SELECT test.ok((SELECT full_name <> 'Cambio ajeno' FROM public.users WHERE id='10000000-0000-4000-8000-000000000003'),
  'own profile RLS prevents editing another user');

SET request.jwt.claim.sub='10000000-0000-4000-8000-000000000003';
INSERT INTO test.results VALUES ('project',public.create_internal_project('{
 "title":"Proyecto ficticio","description":"Descripción ficticia","project_type":"dual",
 "assigned_dev":"10000000-0000-4000-8000-000000000003"}',
 '30000000-0000-4000-8000-000000000003'));
SELECT test.ok((SELECT count(*)=2 FROM public.project_flows WHERE project_id=
  (SELECT (value->>'id')::uuid FROM test.results WHERE name='project')),'dual project has exactly two flows');
SELECT test.ok((SELECT count(*)=35 FROM public.checklist_items i JOIN public.project_flows f ON f.id=i.project_flow_id
  WHERE f.project_id=(SELECT (value->>'id')::uuid FROM test.results WHERE name='project')),'dual project initializes both checklists');
SELECT test.ok((SELECT r.project_id=p.id AND r.request_number=p.project_number AND r.number_series='INT'
  FROM public.projects p JOIN public.requests r ON r.id=p.request_id
  WHERE p.id=(SELECT (value->>'id')::uuid FROM test.results WHERE name='project')),'reciprocal internal links and number');
SELECT public.update_request_details((SELECT (value->>'request_id')::uuid FROM test.results WHERE name='project'),
 'Otra área ficticia','Otra persona ficticia');
SELECT test.ok((SELECT requester_area='Otra área ficticia' FROM public.requests WHERE id=
 (SELECT (value->>'request_id')::uuid FROM test.results WHERE name='project')),'request metadata RPC updates permitted fields');
SELECT test.ok((SELECT r.id=p.request_id FROM public.projects p CROSS JOIN LATERAL public.requests(p) r
 WHERE p.id=(SELECT (value->>'id')::uuid FROM test.results WHERE name='project')),'computed request relationship respects canonical link');
SELECT test.ok((SELECT p.id=r.project_id FROM public.requests r CROSS JOIN LATERAL public.projects(r) p
 WHERE r.id=(SELECT (value->>'request_id')::uuid FROM test.results WHERE name='project')),'computed project relationship respects canonical link');
UPDATE public.checklist_items SET completed=true WHERE id=(SELECT id FROM public.checklist_items LIMIT 1);
SELECT test.ok((SELECT completed_at IS NOT NULL FROM public.checklist_items WHERE completed LIMIT 1),
 'completion timestamp filled by server');
UPDATE public.checklist_items SET completed=false WHERE completed;
SELECT test.ok((SELECT bool_and(completed_at IS NULL) FROM public.checklist_items),
 'completion timestamp cleared on reopen');
SELECT test.expect_error($q$INSERT INTO public.projects(title) VALUES ('Forbidden')$q$,'42501','direct project insert denied');
SELECT test.expect_error($q$INSERT INTO public.project_flows(project_id,flow_type)
 SELECT (value->>'id')::uuid,'development' FROM test.results WHERE name='project'$q$,'42501','direct flow insert denied');
SELECT test.expect_error($q$SELECT public.create_internal_project('{"title":"Rollback ficticio","description":"No parcial",
 "project_type":"dual","assigned_admin":"10000000-0000-4000-8000-000000000004"}',
 '30000000-0000-4000-8000-000000000004')$q$,'23514','invalid assignee rolls back project transaction');
SELECT test.ok((SELECT count(*)=0 FROM public.projects WHERE title='Rollback ficticio'),'failed project left no partial row');
SELECT test.expect_error($q$SELECT public.approve_request((SELECT (value->>'id')::uuid FROM test.results WHERE name='request'),
 '{"project_type":"development"}',gen_random_uuid())$q$,'42501','developer cannot approve requests');
SELECT test.expect_error($q$UPDATE public.projects SET status='deleted'$q$,'42501','developer cannot move project to trash');
SELECT test.expect_error($q$UPDATE public.project_flows SET current_phase='impossible'$q$,'23514','invalid flow phase rejected');
SELECT test.expect_error($q$INSERT INTO public.checklist_items(project_flow_id,phase,description)
 SELECT id,'impossible','Prueba' FROM public.project_flows LIMIT 1$q$,'23514','invalid checklist phase rejected');
INSERT INTO public.comments(project_id,content)
 SELECT (value->>'id')::uuid,'Comentario ficticio' FROM test.results WHERE name='project';
SELECT test.ok((SELECT user_id=auth.uid() FROM public.comments LIMIT 1),'comment author is server default');
SELECT test.expect_error($q$INSERT INTO public.activity_logs(project_id,user_id,action)
 SELECT (value->>'id')::uuid,'10000000-0000-4000-8000-000000000001','forged' FROM test.results WHERE name='project'$q$,
 '42501','cannot impersonate operational activity author');
SELECT public.change_project_type((SELECT (value->>'id')::uuid FROM test.results WHERE name='project'),'development');
SELECT test.ok((SELECT count(*)=1 FROM public.project_flows WHERE project_id=
 (SELECT (value->>'id')::uuid FROM test.results WHERE name='project')),'type change reconciles flows atomically');

SET request.jwt.claim.sub='10000000-0000-4000-8000-000000000002';
SELECT test.expect_error($q$SELECT public.admin_update_user('10000000-0000-4000-8000-000000000004','superadmin',true)$q$,
 '42501','admin cannot promote superadmin');
SELECT public.admin_update_user('10000000-0000-4000-8000-000000000005','developer',false);
INSERT INTO test.results VALUES ('approved',public.approve_request(
 (SELECT (value->>'id')::uuid FROM test.results WHERE name='request'),
 '{"project_type":"administrative","assigned_admin":"10000000-0000-4000-8000-000000000003",
 "sla_target_date":"2099-12-01","sla_formal_days":5}',
 '30000000-0000-4000-8000-000000000005'));
SELECT test.ok((SELECT value=public.approve_request(
 (SELECT (value->>'id')::uuid FROM test.results WHERE name='request'),
 '{"project_type":"administrative","assigned_admin":"10000000-0000-4000-8000-000000000003",
 "sla_target_date":"2099-12-01","sla_formal_days":5}',
 '30000000-0000-4000-8000-000000000005') FROM test.results WHERE name='approved'),'approval retries are idempotent');
SELECT test.ok((SELECT count(*)=1 FROM public.activity_logs WHERE action='sla_started'
 AND project_id=(SELECT (value->>'id')::uuid FROM test.results WHERE name='approved')
 AND details->>'sla_formal_days'='5'),'approval creates SLA history inside the same transaction');
SELECT test.expect_error($q$SELECT public.approve_request((SELECT (value->>'id')::uuid FROM test.results WHERE name='request'),
 '{"project_type":"development"}',gen_random_uuid())$q$,'23514','different key cannot approve twice');
SELECT test.expect_error($q$SELECT public.purge_project((SELECT (value->>'id')::uuid FROM test.results WHERE name='project'))$q$,
 '23514','purge requires trash state');
INSERT INTO public.notifications(user_id,type,title)
 VALUES ('10000000-0000-4000-8000-000000000004','mention','Mensaje ficticio');

SET request.jwt.claim.sub='10000000-0000-4000-8000-000000000004';
SELECT test.ok((SELECT count(*)=1 FROM public.notifications),'recipient reads only own notifications');
UPDATE public.notifications SET read=true;
SELECT test.expect_error($q$UPDATE public.notifications SET user_id='10000000-0000-4000-8000-000000000003'$q$,
 '42501','notification ownership column immutable');
SELECT test.expect_error($q$INSERT INTO public.comments(project_id,content)
 SELECT (value->>'id')::uuid,'No autorizado' FROM test.results WHERE name='project'$q$,'42501','viewer cannot comment');

SET request.jwt.claim.sub='10000000-0000-4000-8000-000000000005';
SELECT test.ok((SELECT count(*)=0 FROM public.users) AND (SELECT count(*)=0 FROM public.projects),
 'inactive JWT cannot read members or projects');
SELECT test.expect_error($q$SELECT public.create_internal_project('{"title":"No","description":"No",
 "project_type":"development"}',gen_random_uuid())$q$,'42501','inactive JWT cannot call editor RPC');
RESET ROLE;

SELECT test.ok((SELECT count(*)=2 FROM public.projects),'no duplicate projects after failures and retries');
SELECT test.ok((SELECT count(*)=2 FROM app_private.rpc_calls WHERE operation='create_internal_project'
 OR operation='approve_request'),'only successful workflows stored idempotency results');
SELECT test.expect_error($q$INSERT INTO public.project_flows(project_id,flow_type)
 SELECT (value->>'id')::uuid,'development' FROM test.results WHERE name='project'$q$,'23505','duplicate project flow rejected');
SELECT test.expect_error($q$UPDATE public.requests SET project_id=gen_random_uuid() WHERE status='approved'$q$,
 '23503','dangling request FK rejected at transaction boundary');
SELECT test.expect_error($q$DELETE FROM public.project_flows WHERE project_id=
 (SELECT (value->>'id')::uuid FROM test.results WHERE name='project')$q$,'23514','project without required flow rejected');

SET ROLE authenticated;
SET request.jwt.claim.sub='10000000-0000-4000-8000-000000000002';
UPDATE public.projects SET status='deleted' WHERE id=(SELECT (value->>'id')::uuid FROM test.results WHERE name='project');
SET request.jwt.claim.sub='10000000-0000-4000-8000-000000000003';
SELECT test.ok((SELECT count(*)=0 FROM public.project_flows WHERE project_id=
 (SELECT (value->>'id')::uuid FROM test.results WHERE name='project')),'developer cannot read deleted project children');
SELECT test.expect_error($q$SELECT public.update_request_details(
 (SELECT (value->>'request_id')::uuid FROM test.results WHERE name='project'),'Oculta','No autorizado')$q$,
 '22023','metadata RPC cannot bypass deleted project visibility');
SET request.jwt.claim.sub='10000000-0000-4000-8000-000000000002';
SELECT public.purge_project((SELECT (value->>'id')::uuid FROM test.results WHERE name='project'));
SELECT test.ok((SELECT count(*)=0 FROM public.projects WHERE id=(SELECT (value->>'id')::uuid
 FROM test.results WHERE name='project')),'admin purges only project in trash');
SELECT test.ok((SELECT status='rejected' AND project_id IS NULL FROM public.requests WHERE id=
 (SELECT (value->>'request_id')::uuid FROM test.results WHERE name='project')),'purge preserves consistent request history');
INSERT INTO test.results VALUES ('to_reject',public.submit_request('{"requester_name":"Persona ficticia",
 "requester_area":"Área ficticia","request_type":"Prueba","description":"Para rechazo"}',gen_random_uuid()));
SELECT public.reject_request((SELECT (value->>'id')::uuid FROM test.results WHERE name='to_reject'),'Motivo ficticio');
SELECT test.ok((SELECT status='rejected' AND rejection_reason='Motivo ficticio' FROM public.requests WHERE id=
 (SELECT (value->>'id')::uuid FROM test.results WHERE name='to_reject')),'admin rejection stores reason without project');
SELECT test.expect_error($q$SELECT public.reject_request((SELECT (value->>'id')::uuid FROM test.results
 WHERE name='to_reject'),'Otra vez')$q$,'23514','rejection requires pending state');
RESET ROLE;
SELECT 'PASS '||count(*)||' SQL assertions' FROM test.checks;
