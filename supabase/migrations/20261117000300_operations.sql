BEGIN;

CREATE FUNCTION app_private.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN NEW.updated_at := clock_timestamp(); RETURN NEW; END $$;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['users','requests','projects','project_flows'] LOOP
    EXECUTE format('CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.%I
      FOR EACH ROW EXECUTE FUNCTION app_private.touch_updated_at()', t);
  END LOOP;
END $$;

-- Explicit owner-only provisioning/refresh after separately authorized Auth administration.
-- No trigger is installed on a platform-owned table. Auth identities are never created here.
CREATE FUNCTION app_private.provision_auth_profile(p_user_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE account_email text; account_name text;
BEGIN
  PERFORM pg_advisory_xact_lock(743921001);
  SELECT email, left(coalesce(nullif(btrim(raw_user_meta_data->>'full_name'),''),'Usuario'),200)
    INTO account_email, account_name FROM auth.users WHERE id=p_user_id;
  IF NOT FOUND OR account_email IS NULL THEN
    RAISE EXCEPTION 'Email Auth user required' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.users(id,email,full_name,role,is_active)
    VALUES (p_user_id,account_email,account_name,'viewer',false)
    ON CONFLICT (id) DO UPDATE SET email=EXCLUDED.email;
  -- Existing name/role/activation are preserved; untrusted metadata never grants a role.
END $$;

-- Owner-only bootstrap. No account or password is created by a migration.
CREATE FUNCTION app_private.bootstrap_superadmin(p_user_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(743921001);
  IF EXISTS (SELECT 1 FROM public.users WHERE role = 'superadmin' AND is_active) THEN
    RAISE EXCEPTION 'An active superadmin already exists' USING ERRCODE = '23514';
  END IF;
  PERFORM app_private.provision_auth_profile(p_user_id);
  UPDATE public.users SET role='superadmin',is_active=true WHERE id=p_user_id;
  INSERT INTO app_private.security_events(subject_id,action) VALUES (p_user_id,'superadmin_bootstrap');
END $$;

CREATE FUNCTION app_private.next_number(p_series text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE y integer := extract(year FROM now() AT TIME ZONE 'America/Lima'); n bigint;
BEGIN
  INSERT INTO app_private.number_counters(series,year,last_value) VALUES (p_series,y,1)
    ON CONFLICT (series,year) DO UPDATE SET last_value = app_private.number_counters.last_value + 1
    RETURNING last_value INTO n;
  RETURN p_series || right(y::text,2) || '-' || lpad(n::text,greatest(3,length(n::text)),'0');
END $$;
CREATE FUNCTION app_private.request_number() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  NEW.request_number := app_private.next_number(NEW.number_series);
  RETURN NEW;
END $$;
CREATE TRIGGER request_number BEFORE INSERT ON public.requests
  FOR EACH ROW EXECUTE FUNCTION app_private.request_number();
CREATE FUNCTION app_private.project_number() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  SELECT request_number INTO NEW.project_number FROM public.requests WHERE id = NEW.request_id;
  RETURN NEW;
END $$;
CREATE TRIGGER project_number BEFORE INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION app_private.project_number();

-- Both FK columns are retained for current TS shapes; enforce reciprocal 1:1.
CREATE FUNCTION app_private.check_request_project() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE rid uuid; r public.requests; p public.projects;
BEGIN
  IF TG_TABLE_NAME = 'requests' THEN rid := coalesce(NEW.id,OLD.id);
  ELSE rid := coalesce(NEW.request_id,OLD.request_id); END IF;
  SELECT * INTO r FROM public.requests WHERE id = rid;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO p FROM public.projects WHERE request_id = rid;
  IF (r.status = 'approved' AND
      (p.id IS NULL OR r.project_id IS DISTINCT FROM p.id OR p.project_number IS DISTINCT FROM r.request_number))
    OR (r.status <> 'approved' AND p.id IS NOT NULL) THEN
    RAISE EXCEPTION 'Request/project links or numbers are inconsistent' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER request_project_consistency AFTER INSERT OR UPDATE OR DELETE ON public.requests
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_private.check_request_project();
CREATE CONSTRAINT TRIGGER project_request_consistency AFTER INSERT OR UPDATE OR DELETE ON public.projects
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_private.check_request_project();

CREATE FUNCTION app_private.check_project_flows() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE pid uuid; p public.projects; actual text[]; expected text[];
BEGIN
  IF TG_TABLE_NAME = 'projects' THEN pid := coalesce(NEW.id,OLD.id);
  ELSE pid := coalesce(NEW.project_id,OLD.project_id); END IF;
  SELECT * INTO p FROM public.projects WHERE id = pid FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  expected := CASE p.project_type WHEN 'dual' THEN ARRAY['administrative','development'] ELSE ARRAY[p.project_type] END;
  SELECT array_agg(flow_type ORDER BY flow_type) INTO actual FROM public.project_flows WHERE project_id = pid;
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'Project must contain exactly its required flows' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER project_flow_consistency AFTER INSERT OR UPDATE ON public.projects
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_private.check_project_flows();
CREATE CONSTRAINT TRIGGER flow_project_consistency AFTER INSERT OR UPDATE OR DELETE ON public.project_flows
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_private.check_project_flows();

CREATE FUNCTION app_private.validate_assignment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to)
    AND NOT EXISTS (SELECT 1 FROM public.users WHERE id = NEW.assigned_to AND is_active
      AND role IN ('superadmin','admin','developer')) THEN
    RAISE EXCEPTION 'Assignee must be an active editor' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validate_assignment BEFORE INSERT OR UPDATE ON public.project_flows
  FOR EACH ROW EXECUTE FUNCTION app_private.validate_assignment();
CREATE FUNCTION app_private.validate_checklist() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE ft text;
BEGIN
  SELECT flow_type INTO ft FROM public.project_flows WHERE id = NEW.project_flow_id;
  IF ft IS NULL OR NOT app_private.valid_phase(ft,NEW.phase) THEN
    RAISE EXCEPTION 'Checklist phase does not belong to flow' USING ERRCODE = '23514';
  END IF;
  NEW.completed_at := CASE WHEN NEW.completed THEN coalesce(NEW.completed_at,clock_timestamp()) ELSE NULL END;
  RETURN NEW;
END $$;
CREATE TRIGGER validate_checklist BEFORE INSERT OR UPDATE ON public.checklist_items
  FOR EACH ROW EXECUTE FUNCTION app_private.validate_checklist();

CREATE FUNCTION app_private.assert_payload(p jsonb, allowed text[]) RETURNS void
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' OR octet_length(p::text) > 50000 THEN
    RAISE EXCEPTION 'Expected bounded JSON object' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p) AS k WHERE NOT k = ANY(allowed)) THEN
    RAISE EXCEPTION 'Unknown or protected payload field' USING ERRCODE = '22023';
  END IF;
END $$;
CREATE FUNCTION app_private.require_role(allowed text[]) RETURNS void
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NOT app_private.has_role(allowed) THEN
    RAISE EXCEPTION 'Active authorized profile required' USING ERRCODE = '42501';
  END IF;
END $$;
CREATE FUNCTION app_private.replay(p_operation text,p_key uuid,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE previous app_private.rpc_calls; actor uuid := coalesce(auth.uid(),'00000000-0000-0000-0000-000000000000');
BEGIN
  IF p_key IS NULL THEN RAISE EXCEPTION 'Idempotency key required' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_operation || ':' || actor::text || ':' || p_key::text,0));
  SELECT * INTO previous FROM app_private.rpc_calls
    WHERE operation=p_operation AND actor_id=actor AND idempotency_key=p_key;
  IF FOUND THEN
    IF previous.payload IS DISTINCT FROM p_payload THEN
      RAISE EXCEPTION 'Idempotency key reused with different payload' USING ERRCODE = '22023';
    END IF;
    RETURN previous.result;
  END IF;
  RETURN NULL;
END $$;
CREATE FUNCTION app_private.remember(p_operation text,p_key uuid,p_payload jsonb,p_result jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO app_private.rpc_calls(operation,actor_id,idempotency_key,payload,result)
    VALUES (p_operation,coalesce(auth.uid(),'00000000-0000-0000-0000-000000000000'),p_key,p_payload,p_result);
  RETURN p_result;
END $$;

CREATE FUNCTION app_private.add_flows(p_project uuid,p_type text,p_dev uuid DEFAULT NULL,p_admin uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.project_flows(project_id,flow_type,assigned_to)
    SELECT p_project,ft,CASE ft WHEN 'development' THEN p_dev ELSE p_admin END
    FROM unnest(CASE p_type WHEN 'dual' THEN ARRAY['development','administrative'] ELSE ARRAY[p_type] END) ft
    ON CONFLICT (project_id,flow_type) DO NOTHING;
  INSERT INTO public.checklist_items(project_flow_id,phase,description,order_index)
    SELECT f.id,t.phase,t.description,t.order_index
    FROM public.project_flows f JOIN public.checklist_templates t ON t.flow_type=f.flow_type
    WHERE f.project_id=p_project AND NOT EXISTS
      (SELECT 1 FROM public.checklist_items i WHERE i.project_flow_id=f.id);
END $$;

CREATE FUNCTION public.submit_request(p_payload jsonb,p_idempotency_key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb; r public.requests; token uuid;
BEGIN
  PERFORM app_private.assert_payload(p_payload,ARRAY['requester_name','requester_email','requester_area',
    'request_type','origin','data_system_involved','description','observations','request_date','requested_date','needs_code']);
  result := app_private.replay('submit_request',p_idempotency_key,p_payload);
  IF result IS NOT NULL THEN RETURN result; END IF;
  IF nullif(btrim(p_payload->>'requester_area'),'') IS NULL THEN
    RAISE EXCEPTION 'Requester area required' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.requests(requester_name,requester_email,requester_area,request_type,origin,
    data_system_involved,description,observations,request_date,requested_date,needs_code)
  VALUES (btrim(p_payload->>'requester_name'),nullif(p_payload->>'requester_email',''),btrim(p_payload->>'requester_area'),
    btrim(p_payload->>'request_type'),coalesce(p_payload->>'origin','Interno'),p_payload->>'data_system_involved',
    btrim(p_payload->>'description'),p_payload->>'observations',nullif(p_payload->>'request_date','')::date,
    nullif(p_payload->>'requested_date','')::date,coalesce((p_payload->>'needs_code')::boolean,false)) RETURNING * INTO r;
  INSERT INTO app_private.request_access(request_id) VALUES (r.id) RETURNING tracking_token INTO token;
  result := jsonb_build_object('id',r.id,'request_number',r.request_number,'tracking_token',token);
  RETURN app_private.remember('submit_request',p_idempotency_key,p_payload,result);
END $$;

CREATE FUNCTION public.track_request(p_request_number text,p_tracking_token uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object('request_number',r.request_number,'status',r.status,'created_at',r.created_at,
    'rejection_reason',r.rejection_reason,'project_status',p.status,'sla_target_date',p.sla_target_date,
    'flows',coalesce((SELECT jsonb_agg(jsonb_build_object('flow_type',f.flow_type,'current_phase',f.current_phase,
      'progress',f.progress) ORDER BY f.flow_type) FROM public.project_flows f WHERE f.project_id=p.id),'[]'::jsonb))
  FROM public.requests r JOIN app_private.request_access a ON a.request_id=r.id
  LEFT JOIN public.projects p ON p.id=r.project_id
  WHERE r.request_number=p_request_number AND a.tracking_token=p_tracking_token;
$$;

CREATE FUNCTION public.create_internal_project(p_payload jsonb,p_idempotency_key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb; rid uuid := gen_random_uuid(); pid uuid := gen_random_uuid(); p public.projects;
BEGIN
  PERFORM app_private.require_role(ARRAY['superadmin','admin','developer']);
  PERFORM app_private.assert_payload(p_payload,ARRAY['title','description','project_type','priority','start_date',
    'due_date','sla_target_date','area','requester_name','assigned_dev','assigned_admin']);
  result := app_private.replay('create_internal_project',p_idempotency_key,p_payload);
  IF result IS NOT NULL THEN RETURN result; END IF;
  INSERT INTO public.requests(id,number_series,requester_name,requester_area,request_type,description,status,project_id)
    VALUES (rid,'INT',coalesce(nullif(btrim(p_payload->>'requester_name'),''),
      (SELECT full_name FROM public.users WHERE id=auth.uid())),nullif(btrim(p_payload->>'area'),''),
      'INT',btrim(p_payload->>'description'),'approved',pid);
  INSERT INTO public.projects(id,request_id,title,description,project_type,priority,start_date,due_date,sla_target_date)
    VALUES (pid,rid,btrim(p_payload->>'title'),btrim(p_payload->>'description'),p_payload->>'project_type',
      coalesce(p_payload->>'priority','medium'),nullif(p_payload->>'start_date','')::date,
      nullif(p_payload->>'due_date','')::date,nullif(p_payload->>'sla_target_date','')::date) RETURNING * INTO p;
  PERFORM app_private.add_flows(pid,p.project_type,nullif(p_payload->>'assigned_dev','')::uuid,
    nullif(p_payload->>'assigned_admin','')::uuid);
  INSERT INTO public.activity_logs(project_id,user_id,action,details)
    VALUES (pid,auth.uid(),'created',jsonb_build_object('title',p.title));
  result := to_jsonb(p);
  RETURN app_private.remember('create_internal_project',p_idempotency_key,p_payload,result);
END $$;

CREATE FUNCTION public.approve_request(p_request_id uuid,p_payload jsonb,p_idempotency_key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb; input jsonb; r public.requests; p public.projects; pid uuid := gen_random_uuid();
BEGIN
  PERFORM app_private.require_role(ARRAY['superadmin','admin']);
  PERFORM app_private.assert_payload(p_payload,ARRAY['title','project_type','priority','start_date','due_date',
    'sla_target_date','sla_formal_days','assigned_dev','assigned_admin']);
  IF p_payload->>'sla_target_date' IS NOT NULL AND
    (p_payload->>'sla_formal_days' IS NULL OR (p_payload->>'sla_formal_days')::integer NOT BETWEEN 1 AND 3650) THEN
    RAISE EXCEPTION 'SLA target requires formal days between 1 and 3650' USING ERRCODE='22023';
  END IF;
  input := jsonb_build_object('request_id',p_request_id,'data',p_payload);
  result := app_private.replay('approve_request',p_idempotency_key,input);
  IF result IS NOT NULL THEN RETURN result; END IF;
  SELECT * INTO r FROM public.requests WHERE id=p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found' USING ERRCODE='22023'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'Request is not pending' USING ERRCODE='23514'; END IF;
  INSERT INTO public.projects(id,request_id,title,description,project_type,priority,start_date,due_date,sla_target_date)
    VALUES (pid,r.id,coalesce(nullif(btrim(p_payload->>'title'),''),r.request_type),r.description,
      p_payload->>'project_type',coalesce(p_payload->>'priority','medium'),nullif(p_payload->>'start_date','')::date,
      nullif(p_payload->>'due_date','')::date,nullif(p_payload->>'sla_target_date','')::date) RETURNING * INTO p;
  PERFORM app_private.add_flows(pid,p.project_type,nullif(p_payload->>'assigned_dev','')::uuid,
    nullif(p_payload->>'assigned_admin','')::uuid);
  UPDATE public.requests SET status='approved',project_id=pid WHERE id=r.id;
  INSERT INTO public.activity_logs(project_id,user_id,action,details)
    VALUES (pid,auth.uid(),'created',jsonb_build_object('request_number',r.request_number));
  IF p.priority <> 'low' AND p.sla_target_date IS NOT NULL THEN
    INSERT INTO public.activity_logs(project_id,user_id,action,details)
      VALUES (pid,auth.uid(),'sla_started',jsonb_build_object('request_number',r.request_number,
        'sla_formal_days',(p_payload->>'sla_formal_days')::integer,'sla_target_date',p.sla_target_date));
  ELSIF p.priority='low' THEN
    UPDATE public.projects SET sla_target_date=NULL WHERE id=pid RETURNING * INTO p;
  END IF;
  INSERT INTO public.notifications(user_id,type,title,message,project_id)
    SELECT DISTINCT assigned_to,'project_assigned','Proyecto asignado',p.title,pid
    FROM public.project_flows WHERE project_id=pid AND assigned_to IS NOT NULL;
  result := to_jsonb(p);
  RETURN app_private.remember('approve_request',p_idempotency_key,input,result);
END $$;

CREATE FUNCTION public.reject_request(p_request_id uuid,p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app_private.require_role(ARRAY['superadmin','admin']);
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 5000 THEN
    RAISE EXCEPTION 'Rejection reason required' USING ERRCODE='22023'; END IF;
  UPDATE public.requests SET status='rejected',rejection_reason=btrim(p_reason)
    WHERE id=p_request_id AND status='pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Pending request required' USING ERRCODE='23514'; END IF;
END $$;

CREATE FUNCTION public.change_project_type(p_project_id uuid,p_project_type text) RETURNS public.projects
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE p public.projects;
BEGIN
  PERFORM app_private.require_role(ARRAY['superadmin','admin','developer']);
  SELECT * INTO p FROM public.projects WHERE id=p_project_id FOR UPDATE;
  IF NOT FOUND OR p.status='deleted' THEN RAISE EXCEPTION 'Project unavailable' USING ERRCODE='22023'; END IF;
  UPDATE public.projects SET project_type=p_project_type WHERE id=p.id;
  DELETE FROM public.project_flows WHERE project_id=p.id AND p_project_type <> 'dual' AND flow_type <> p_project_type;
  PERFORM app_private.add_flows(p.id,p_project_type);
  INSERT INTO public.activity_logs(project_id,user_id,action,details)
    VALUES (p.id,auth.uid(),'type_changed',jsonb_build_object('from',p.project_type,'to',p_project_type));
  SELECT * INTO p FROM public.projects WHERE id=p.id;
  RETURN p;
END $$;

CREATE FUNCTION public.update_request_details(p_request_id uuid,p_area text,p_requester_name text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app_private.require_role(ARRAY['superadmin','admin','developer']);
  UPDATE public.requests SET requester_area=nullif(btrim(p_area),''),requester_name=btrim(p_requester_name)
    WHERE id=p_request_id AND (project_id IS NULL OR app_private.can_read_project(project_id));
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found' USING ERRCODE='22023'; END IF;
END $$;

CREATE FUNCTION public.admin_update_user(p_user_id uuid,p_role text,p_is_active boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE target public.users; is_super boolean;
BEGIN
  PERFORM app_private.require_role(ARRAY['superadmin','admin']);
  PERFORM pg_advisory_xact_lock(743921001);
  is_super := app_private.has_role(ARRAY['superadmin']);
  SELECT * INTO target FROM public.users WHERE id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found' USING ERRCODE='22023'; END IF;
  IF NOT is_super AND (target.role IN ('superadmin','admin') OR p_role NOT IN ('developer','viewer')) THEN
    RAISE EXCEPTION 'Only superadmin can manage administrative roles' USING ERRCODE='42501'; END IF;
  IF target.role='superadmin' AND target.is_active AND (p_role <> 'superadmin' OR NOT p_is_active)
    AND (SELECT count(*) FROM public.users WHERE role='superadmin' AND is_active) <= 1 THEN
    RAISE EXCEPTION 'Cannot remove the last active superadmin' USING ERRCODE='23514'; END IF;
  UPDATE public.users SET role=p_role,is_active=p_is_active WHERE id=p_user_id;
  INSERT INTO app_private.security_events(actor_id,subject_id,action,details)
    VALUES (auth.uid(),p_user_id,'profile_permissions_changed',jsonb_build_object('role',p_role,'is_active',p_is_active));
END $$;

CREATE FUNCTION public.purge_project(p_project_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE p public.projects;
BEGIN
  PERFORM app_private.require_role(ARRAY['superadmin','admin']);
  SELECT * INTO p FROM public.projects WHERE id=p_project_id FOR UPDATE;
  IF NOT FOUND OR p.status <> 'deleted' THEN RAISE EXCEPTION 'Project must be in trash' USING ERRCODE='23514'; END IF;
  UPDATE public.requests SET project_id=NULL,status='rejected',rejection_reason='Proyecto eliminado definitivamente'
    WHERE id=p.request_id;
  DELETE FROM public.projects WHERE id=p.id;
  INSERT INTO app_private.security_events(actor_id,subject_id,action) VALUES (auth.uid(),p.id,'project_purged');
END $$;

-- Explicit computed relationships override the two FK paths for PostgREST.
-- SECURITY INVOKER: the caller's table privileges and RLS still apply.
CREATE FUNCTION public.requests(public.projects) RETURNS SETOF public.requests ROWS 1
LANGUAGE sql STABLE SET search_path = '' AS $$ SELECT r.* FROM public.requests r WHERE r.id=($1).request_id $$;
CREATE FUNCTION public.projects(public.requests) RETURNS SETOF public.projects ROWS 1
LANGUAGE sql STABLE SET search_path = '' AS $$ SELECT p.* FROM public.projects p WHERE p.request_id=($1).id $$;

DO $$ DECLARE f record; BEGIN
  FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='app_private' OR (n.nspname='public' AND p.proname = ANY (ARRAY[
      'submit_request','track_request','create_internal_project','approve_request','reject_request',
      'change_project_type','update_request_details','admin_update_user','purge_project','requests','projects'])) LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role',f.signature);
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION app_private.has_role(text[]),app_private.valid_phase(text,text),
  app_private.can_read_project(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_request(jsonb,uuid),public.track_request(text,uuid) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_internal_project(jsonb,uuid),public.approve_request(uuid,jsonb,uuid),
  public.reject_request(uuid,text),public.change_project_type(uuid,text),public.update_request_details(uuid,text,text),
  public.admin_update_user(uuid,text,boolean),public.purge_project(uuid),
  public.requests(public.projects),public.projects(public.requests) TO authenticated;

-- Supabase owns the publication; no external connection or data is required.
DO $$ DECLARE t text; BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
    FOREACH t IN ARRAY ARRAY['projects','project_flows','notifications'] LOOP
      IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',t);
      END IF;
    END LOOP;
  END IF;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
