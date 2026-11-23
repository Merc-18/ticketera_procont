-- M16: client identity isolation and independent original request inputs.
-- LOCAL ONLY. No application-row UPDATE/DELETE/backfill; M1-M15 are unchanged.
BEGIN;

ALTER TABLE public.requests
  ADD COLUMN requested_priority text CHECK (requested_priority IN ('low','medium','high','urgent')),
  ADD COLUMN requested_subsystem_id uuid,
  ADD COLUMN requester_name_source text CHECK (requester_name_source IN ('verified_name','username','declared','internal_correction')),
  ADD CONSTRAINT requests_requested_subsystem_fkey FOREIGN KEY (requested_subsystem_id,system_id)
    REFERENCES public.catalog_subsystems(id,system_id);
-- Set the default separately: existing rows must remain NULL, not invented medium.
ALTER TABLE public.requests ALTER COLUMN requested_priority SET DEFAULT 'medium';
ALTER TABLE app_private.client_request_links ADD COLUMN authenticated_username text
  CHECK (length(authenticated_username) BETWEEN 1 AND 256);
ALTER TABLE app_private.client_sessions ADD COLUMN authenticated_username text
  CHECK (length(authenticated_username) BETWEEN 1 AND 256);
ALTER TABLE app_private.client_entry_codes ADD COLUMN authenticated_username text
  CHECK (length(authenticated_username) BETWEEN 1 AND 256);

-- A provider_id is not permission to replace an exact authenticated username.
DO $$ DECLARE old_key text; BEGIN
  SELECT conname INTO STRICT old_key FROM pg_constraint
    WHERE conrelid='app_private.client_identities'::regclass AND contype='u'
      AND pg_get_constraintdef(oid)='UNIQUE (company_id, provider, subject_source, subject)';
  EXECUTE format('ALTER TABLE app_private.client_identities DROP CONSTRAINT %I',old_key);
END $$;
ALTER TABLE app_private.client_identities ADD CONSTRAINT client_identities_scoped_subject_username_key
  UNIQUE NULLS NOT DISTINCT(company_id,provider,subject_source,subject,username);

CREATE FUNCTION app_private.guard_client_identity_scope() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF ROW(NEW.id,NEW.company_id,NEW.provider,NEW.subject_source,NEW.subject,NEW.username)
    IS DISTINCT FROM ROW(OLD.id,OLD.company_id,OLD.provider,OLD.subject_source,OLD.subject,OLD.username) THEN
    RAISE EXCEPTION 'Client identity scope is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER client_identity_scope_immutable BEFORE UPDATE ON app_private.client_identities
  FOR EACH ROW EXECUTE FUNCTION app_private.guard_client_identity_scope();

CREATE FUNCTION app_private.guard_client_request_link() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE i app_private.client_identities;
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Client ticket ownership is immutable' USING ERRCODE='23514'; END IF;
  SELECT * INTO i FROM app_private.client_identities WHERE id=NEW.identity_id;
  IF NOT FOUND OR NEW.company_id IS DISTINCT FROM i.company_id OR NEW.provider IS DISTINCT FROM i.provider
    OR NEW.authenticated_username IS DISTINCT FROM (CASE WHEN i.provider='quipu' THEN i.username END) THEN
    RAISE EXCEPTION 'Verified ticket identity required' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER client_request_link_scope BEFORE INSERT OR UPDATE OR DELETE ON app_private.client_request_links
  FOR EACH ROW EXECUTE FUNCTION app_private.guard_client_request_link();

-- Existing provider_id links have no reliable username snapshot after an M13
-- collision. Preserve them, but fail closed; never guess or reassign ownership.
CREATE FUNCTION app_private.client_owns_request(p_identity_id uuid,p_request_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM app_private.client_request_links l
    JOIN app_private.client_identities i ON i.id=l.identity_id
    WHERE l.request_id=p_request_id AND i.id=p_identity_id AND l.company_id=i.company_id AND l.provider=i.provider
      AND (i.provider='quipufac' OR l.authenticated_username=i.username
        OR (l.authenticated_username IS NULL AND i.provider='quipu' AND i.subject_source='username' AND i.subject=i.username)));
$$;

CREATE FUNCTION app_private.guard_original_client_inputs() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    NEW.requested_priority:=coalesce(NEW.requested_priority,'medium');
  ELSE
    IF ROW(NEW.requested_priority,NEW.requested_subsystem_id)
      IS DISTINCT FROM ROW(OLD.requested_priority,OLD.requested_subsystem_id) THEN
      RAISE EXCEPTION 'Original client priority and subproject are immutable' USING ERRCODE='23514';
    END IF;
    IF NEW.requester_name IS DISTINCT FROM OLD.requester_name THEN
      NEW.requester_name_source:=CASE WHEN OLD.requester_name_source IS NOT NULL THEN 'internal_correction' END;
    ELSIF NEW.requester_name_source IS DISTINCT FROM OLD.requester_name_source THEN
      RAISE EXCEPTION 'Requester provenance cannot be forged' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_original_client_inputs BEFORE INSERT OR UPDATE ON public.requests
  FOR EACH ROW EXECUTE FUNCTION app_private.guard_original_client_inputs();

CREATE FUNCTION public.client_subprojects(p_session_token text,p_system_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  PERFORM app_private.client_session(p_session_token);
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.client_products(p_session_token)) p WHERE p->>'id'=p_system_id::text) THEN
    RAISE EXCEPTION 'Product unavailable for this entry context' USING ERRCODE='PT403';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'system_id',system_id,'name',name) ORDER BY name,id),'[]'::jsonb)
    INTO result FROM public.catalog_subsystems WHERE system_id=p_system_id AND is_active;
  RETURN result;
END $$;

-- Remains inaccessible to public application roles under M15. Called by owner only.
CREATE OR REPLACE FUNCTION public.submit_client_request(p_payload jsonb,p_idempotency_key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; st public.studios; sy public.catalog_systems; rt public.request_types;
  r public.requests; token uuid; v_sub uuid; v_priority text; v_source text; v_urgent boolean;
BEGIN
  PERFORM app_private.assert_payload(p_payload,ARRAY['requester_name','studio_id','system_id','subsystem_id',
    'request_type_id','title','description','urgent_requested','requested_priority','requester_name_source']);
  IF jsonb_typeof(p_payload->'requester_name') IS DISTINCT FROM 'string'
    OR app_private.normalize_requester_name(p_payload->>'requester_name') IS NULL
    OR length(p_payload->>'requester_name') NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Requester name required within limits' USING ERRCODE='22023';
  END IF;
  v_priority:=CASE WHEN p_payload ? 'requested_priority' THEN p_payload->>'requested_priority' ELSE 'medium' END;
  IF v_priority IS NULL OR v_priority NOT IN ('low','medium','high','urgent')
    OR (p_payload ? 'requested_priority' AND jsonb_typeof(p_payload->'requested_priority')<>'string') THEN
    RAISE EXCEPTION 'Invalid requested priority' USING ERRCODE='22023';
  END IF;
  IF p_payload ? 'urgent_requested' AND jsonb_typeof(p_payload->'urgent_requested') IS DISTINCT FROM 'boolean' THEN
    RAISE EXCEPTION 'Urgency must be boolean' USING ERRCODE='22023';
  END IF;
  -- Deliberately independent; no conversion between urgency and requested priority.
  v_urgent:=coalesce((p_payload->>'urgent_requested')::boolean,false);
  v_source:=p_payload->>'requester_name_source';
  IF v_source IS NOT NULL AND v_source NOT IN ('verified_name','username','declared') THEN
    RAISE EXCEPTION 'Invalid requester provenance' USING ERRCODE='22023';
  END IF;
  result:=app_private.replay('submit_client_request',p_idempotency_key,p_payload);
  IF result IS NOT NULL THEN RETURN result; END IF;
  BEGIN
    SELECT * INTO st FROM public.studios WHERE id=(p_payload->>'studio_id')::uuid AND is_active;
    IF NOT FOUND THEN RAISE EXCEPTION 'Active study required' USING ERRCODE='22023'; END IF;
    SELECT * INTO sy FROM public.catalog_systems WHERE id=(p_payload->>'system_id')::uuid AND is_active;
    IF NOT FOUND THEN RAISE EXCEPTION 'Active product required' USING ERRCODE='22023'; END IF;
    SELECT * INTO rt FROM public.request_types WHERE id=(p_payload->>'request_type_id')::uuid AND is_active;
    IF NOT FOUND THEN RAISE EXCEPTION 'Active request type required' USING ERRCODE='22023'; END IF;
    v_sub:=nullif(p_payload->>'subsystem_id','')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Invalid catalog identifier' USING ERRCODE='22023';
  END;
  IF (p_payload ? 'subsystem_id' AND jsonb_typeof(p_payload->'subsystem_id') NOT IN ('null','string')) OR p_payload->>'subsystem_id'='' THEN
    RAISE EXCEPTION 'Invalid subproject identifier' USING ERRCODE='22023';
  END IF;
  IF v_sub IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.catalog_subsystems WHERE id=v_sub AND system_id=sy.id AND is_active) THEN
    RAISE EXCEPTION 'Subproject must be active and belong to product' USING ERRCODE='22023';
  END IF;
  IF v_sub IS NULL AND sy.requires_subproject AND EXISTS(SELECT 1 FROM public.catalog_subsystems WHERE system_id=sy.id AND is_active) THEN
    RAISE EXCEPTION 'Subproject required' USING ERRCODE='22023';
  END IF;
  IF jsonb_typeof(p_payload->'title') IS DISTINCT FROM 'string' OR length(btrim(p_payload->>'title')) NOT BETWEEN 1 AND 300
    OR jsonb_typeof(p_payload->'description') IS DISTINCT FROM 'string' OR length(btrim(p_payload->>'description')) NOT BETWEEN 1 AND 20000 THEN
    RAISE EXCEPTION 'Title and description required within limits' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.requests(requester_name,requester_area,request_type,request_type_id,title,description,
    urgent_requested,studio_id,system_id,subsystem_id,requested_subsystem_id,requested_priority,requester_name_source,request_date)
  VALUES(p_payload->>'requester_name',NULL,rt.name,rt.id,btrim(p_payload->>'title'),btrim(p_payload->>'description'),
    v_urgent,st.id,sy.id,v_sub,v_sub,v_priority,v_source,(now() AT TIME ZONE 'America/Lima')::date)
    RETURNING * INTO r;
  INSERT INTO app_private.request_access(request_id) VALUES(r.id) RETURNING tracking_token INTO token;
  result:=jsonb_build_object('id',r.id,'request_number',r.request_number,'tracking_token',token);
  RETURN app_private.remember('submit_client_request',p_idempotency_key,p_payload,result);
END $$;

CREATE OR REPLACE FUNCTION public.client_submit_request(p_session_token text,p_payload jsonb,p_idempotency_key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s app_private.client_sessions; i app_private.client_identities; study uuid;
  previous app_private.client_request_links; result jsonb; input jsonb; v_name text; v_source text;
BEGIN
  PERFORM 1 FROM app_private.client_sessions WHERE token_hash=app_private.client_token_hash(p_session_token) FOR SHARE;
  s:=app_private.client_session(p_session_token);
  SELECT * INTO i FROM app_private.client_identities WHERE id=s.identity_id FOR SHARE;
  PERFORM app_private.assert_payload(p_payload,ARRAY['requester_name','system_id','subsystem_id','request_type_id','title',
    'description','urgent_requested','requested_priority']);
  IF p_idempotency_key IS NULL THEN RAISE EXCEPTION 'Idempotency key required' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('client_request:'||i.id::text||':'||p_idempotency_key::text,0));
  SELECT * INTO previous FROM app_private.client_request_links WHERE identity_id=i.id AND idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF NOT app_private.client_owns_request(i.id,previous.request_id) THEN
      RAISE EXCEPTION 'Client ticket unavailable' USING ERRCODE='PT404'; END IF;
    IF previous.original_payload IS DISTINCT FROM p_payload THEN
      RAISE EXCEPTION 'Idempotency key reused with different payload' USING ERRCODE='22023'; END IF;
    SELECT jsonb_build_object('id',r.id,'request_number',r.request_number,'tracking_token',a.tracking_token) INTO result
      FROM public.requests r JOIN app_private.request_access a ON a.request_id=r.id WHERE r.id=previous.request_id;
    RETURN result;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.client_products(p_session_token)) p WHERE p->>'id'=p_payload->>'system_id') THEN
    RAISE EXCEPTION 'Product unavailable for this entry context' USING ERRCODE='PT403'; END IF;
  study:=app_private.client_studio(i.company_id);
  IF study IS NULL THEN RAISE EXCEPTION 'Explicit study mapping required' USING ERRCODE='23514'; END IF;
  IF i.provider='quipu' THEN
    v_name:=coalesce(i.verified_name,i.username);
    v_source:=CASE WHEN i.verified_name IS NOT NULL THEN 'verified_name' ELSE 'username' END;
    IF app_private.normalize_requester_name(v_name) IS NULL OR (p_payload ? 'requester_name'
      AND (jsonb_typeof(p_payload->'requester_name') IS DISTINCT FROM 'string' OR p_payload->>'requester_name' IS DISTINCT FROM v_name)) THEN
      RAISE EXCEPTION 'Requester must match authenticated Quipu identity' USING ERRCODE='22023'; END IF;
  ELSE
    v_name:=btrim(p_payload->>'requester_name'); v_source:='declared';
    IF jsonb_typeof(p_payload->'requester_name') IS DISTINCT FROM 'string' OR app_private.normalize_requester_name(v_name) IS NULL THEN
      RAISE EXCEPTION 'Declared requester name required' USING ERRCODE='22023'; END IF;
  END IF;
  input:=p_payload||jsonb_build_object('studio_id',study,'requester_name',v_name,'requester_name_source',v_source);
  result:=public.submit_client_request(input,gen_random_uuid());
  INSERT INTO app_private.client_request_links(request_id,identity_id,company_id,provider,entry_context,idempotency_key,original_payload,authenticated_username)
    VALUES((result->>'id')::uuid,i.id,i.company_id,i.provider,s.entry_context,p_idempotency_key,p_payload,CASE WHEN i.provider='quipu' THEN i.username END);
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION app_private.client_identity(p_provider text,p_ruc text,p_subject text,
  p_subject_source text,p_username text,p_verified_name text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE company uuid; identity_id uuid; candidates uuid[];
BEGIN
  IF p_provider IS NULL OR p_provider NOT IN ('quipu','quipufac') OR p_ruc IS NULL OR p_ruc !~ '^[0-9]{11}$'
    OR p_subject IS NULL OR length(p_subject) NOT BETWEEN 1 AND 256
    OR p_subject_source IS NULL OR p_subject_source NOT IN ('provider_id','username','company')
    OR (p_verified_name IS NOT NULL AND length(btrim(p_verified_name)) NOT BETWEEN 1 AND 300) THEN
    RAISE EXCEPTION 'Invalid verified client identity' USING ERRCODE='22023';
  END IF;
  IF (p_provider='quipu' AND (p_subject_source NOT IN ('provider_id','username')
      OR p_username IS NULL OR length(p_username) NOT BETWEEN 1 AND 256
      OR (p_subject_source='username' AND p_subject IS DISTINCT FROM p_username)))
    OR (p_provider='quipufac' AND (p_subject_source<>'company' OR p_subject<>'company' OR p_username IS NOT NULL)) THEN
    RAISE EXCEPTION 'Invalid identity scope' USING ERRCODE='22023';
  END IF;
  INSERT INTO app_private.client_companies(ruc) VALUES(p_ruc)
    ON CONFLICT(ruc) DO UPDATE SET ruc=excluded.ruc RETURNING id INTO company;
  -- Company-row lock from the UPSERT serializes identity resolution. The same
  -- exact Quipu username is one account even when direct/platform subjects differ.
  -- Multiple historical candidates cannot be merged or chosen arbitrarily.
  SELECT array_agg(id ORDER BY id) INTO candidates FROM app_private.client_identities
    WHERE company_id=company AND provider=p_provider AND username IS NOT DISTINCT FROM p_username;
  IF cardinality(candidates)>1 THEN
    RAISE EXCEPTION 'Ambiguous client identity requires explicit review' USING ERRCODE='22023';
  ELSIF cardinality(candidates)=1 THEN
    UPDATE app_private.client_identities SET verified_name=nullif(btrim(p_verified_name),'')
      WHERE id=candidates[1] RETURNING id INTO identity_id;
    RETURN identity_id;
  END IF;
  INSERT INTO app_private.client_identities(company_id,provider,subject_source,subject,username,verified_name)
    VALUES(company,p_provider,p_subject_source,p_subject,p_username,nullif(btrim(p_verified_name),''))
    ON CONFLICT(company_id,provider,subject_source,subject,username) DO UPDATE
      SET verified_name=excluded.verified_name RETURNING id INTO identity_id;
  RETURN identity_id;
END $$;

CREATE OR REPLACE FUNCTION app_private.client_session(p_token text) RETURNS app_private.client_sessions
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE s app_private.client_sessions;
BEGIN
  SELECT c.* INTO s FROM app_private.client_sessions c JOIN app_private.client_identities i ON i.id=c.identity_id
    WHERE c.token_hash=app_private.client_token_hash(p_token) AND c.revoked_at IS NULL AND c.expires_at>clock_timestamp()
      AND (i.provider='quipufac' OR c.authenticated_username=i.username
        OR (c.authenticated_username IS NULL AND i.subject_source='username' AND i.subject=i.username));
  IF NOT FOUND THEN RAISE EXCEPTION 'Client session unavailable' USING ERRCODE='PT401'; END IF;
  RETURN s;
END $$;

CREATE OR REPLACE FUNCTION public.client_open_session(p_provider text,p_ruc text,p_subject text,p_subject_source text,
  p_username text,p_verified_name text,p_token_hash text,p_expires_at timestamptz) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE identity_id uuid;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' OR p_expires_at IS NULL
    OR p_expires_at<=clock_timestamp() OR p_expires_at>now()+interval '24 hours' THEN
    RAISE EXCEPTION 'Invalid session lifetime or digest' USING ERRCODE='22023'; END IF;
  identity_id:=app_private.client_identity(p_provider,p_ruc,p_subject,p_subject_source,p_username,p_verified_name);
  INSERT INTO app_private.client_sessions(token_hash,identity_id,entry_context,expires_at,authenticated_username)
    VALUES(p_token_hash,identity_id,'direct',p_expires_at,p_username);
END $$;
CREATE OR REPLACE FUNCTION public.client_issue_entry_code(p_provider text,p_ruc text,p_subject text,p_subject_source text,
  p_username text,p_verified_name text,p_code_hash text,p_expires_at timestamptz) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE identity_id uuid;
BEGIN
  IF p_code_hash IS NULL OR p_code_hash !~ '^[0-9a-f]{64}$' OR p_expires_at IS NULL
    OR p_expires_at<=clock_timestamp() OR p_expires_at>now()+interval '2 minutes' THEN
    RAISE EXCEPTION 'Invalid entry code lifetime or digest' USING ERRCODE='22023'; END IF;
  identity_id:=app_private.client_identity(p_provider,p_ruc,p_subject,p_subject_source,p_username,p_verified_name);
  INSERT INTO app_private.client_entry_codes(code_hash,identity_id,provider,expires_at,authenticated_username)
    VALUES(p_code_hash,identity_id,p_provider,p_expires_at,p_username);
END $$;
CREATE OR REPLACE FUNCTION public.client_exchange_entry_code(p_provider text,p_code_hash text,p_token_hash text,p_expires_at timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE identity_id uuid; authenticated_user text;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' OR p_expires_at IS NULL
    OR p_expires_at<=clock_timestamp() OR p_expires_at>now()+interval '24 hours' THEN
    RAISE EXCEPTION 'Invalid session lifetime or digest' USING ERRCODE='22023'; END IF;
  UPDATE app_private.client_entry_codes c SET used_at=clock_timestamp()
    WHERE code_hash=p_code_hash AND provider=p_provider AND used_at IS NULL AND expires_at>clock_timestamp()
      AND EXISTS(SELECT 1 FROM app_private.client_identities i WHERE i.id=c.identity_id AND i.provider=c.provider
        AND (i.provider='quipufac' OR c.authenticated_username=i.username
          OR (c.authenticated_username IS NULL AND i.subject_source='username' AND i.subject=i.username)))
    RETURNING c.identity_id,c.authenticated_username INTO identity_id,authenticated_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'Entry code unavailable' USING ERRCODE='42501'; END IF;
  INSERT INTO app_private.client_sessions(token_hash,identity_id,entry_context,expires_at,authenticated_username)
    VALUES(p_token_hash,identity_id,'platform',p_expires_at,authenticated_user);
END $$;

CREATE OR REPLACE FUNCTION app_private.client_ticket_summary(p_request_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object('id',r.id,'request_number',r.request_number,'title',r.title,'created_at',r.created_at,
    'status',r.status,'general_status',app_private.request_general_status(r.id),'system_id',r.system_id,
    'requester_name',r.requester_name,'requester_name_verified',coalesce(r.requester_name_source='verified_name',false),
    'requester_name_source',r.requester_name_source,'requested_priority',r.requested_priority,'requested_subsystem_id',r.requested_subsystem_id)
  FROM public.requests r WHERE r.id=p_request_id;
$$;
CREATE OR REPLACE FUNCTION public.client_reserve_attachments(p_session_token text,p_request_id uuid,p_files jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s app_private.client_sessions; tracking uuid;
BEGIN
  PERFORM 1 FROM app_private.client_sessions WHERE token_hash=app_private.client_token_hash(p_session_token) FOR SHARE;
  s:=app_private.client_session(p_session_token);
  SELECT a.tracking_token INTO tracking FROM app_private.client_request_links l
    JOIN app_private.request_access a ON a.request_id=l.request_id
    WHERE l.request_id=p_request_id AND l.identity_id=s.identity_id AND app_private.client_owns_request(s.identity_id,l.request_id);
  IF tracking IS NULL THEN RAISE EXCEPTION 'Client ticket unavailable' USING ERRCODE='PT404'; END IF;
  RETURN public.reserve_request_attachments(p_request_id,tracking,p_files);
END $$;
CREATE OR REPLACE FUNCTION public.client_list_tickets(p_session_token text,p_limit integer DEFAULT 50,p_offset integer DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE s app_private.client_sessions; result jsonb;
BEGIN
  s:=app_private.client_session(p_session_token);
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR p_offset IS NULL OR p_offset<0 OR p_offset>100000 THEN
    RAISE EXCEPTION 'Invalid pagination' USING ERRCODE='22023'; END IF;
  SELECT coalesce(jsonb_agg(item ORDER BY created_at DESC,request_id DESC),'[]'::jsonb) INTO result FROM (
    SELECT l.request_id,r.created_at,app_private.client_ticket_summary(r.id) AS item FROM app_private.client_request_links l
    JOIN public.requests r ON r.id=l.request_id WHERE l.identity_id=s.identity_id AND app_private.client_owns_request(s.identity_id,l.request_id)
      AND NOT EXISTS(SELECT 1 FROM public.projects WHERE id=r.project_id AND status='deleted')
    ORDER BY r.created_at DESC,r.id DESC LIMIT p_limit OFFSET p_offset) q;
  RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.client_ticket_detail(p_session_token text,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE s app_private.client_sessions; result jsonb;
BEGIN
  s:=app_private.client_session(p_session_token);
  SELECT app_private.client_ticket_summary(r.id)||jsonb_build_object('description',r.description,
    'urgent_requested',r.urgent_requested,'rejection_reason',CASE WHEN r.status='rejected' THEN r.public_rejection_reason END,
    'timeline',coalesce((SELECT jsonb_agg(jsonb_build_object('action',e.action,'created_at',e.created_at,
      'general_status',e.details->>'to') ORDER BY e.created_at,e.id) FROM public.request_events e
      WHERE e.request_id=r.id AND e.action IN ('submitted','review_started','approved','rejected','status_changed')),'[]'::jsonb))
    INTO result FROM public.requests r JOIN app_private.client_request_links l ON l.request_id=r.id
    WHERE r.id=p_request_id AND l.identity_id=s.identity_id AND app_private.client_owns_request(s.identity_id,l.request_id)
      AND NOT EXISTS(SELECT 1 FROM public.projects WHERE id=r.project_id AND status='deleted');
  IF result IS NULL THEN RAISE EXCEPTION 'Client ticket unavailable' USING ERRCODE='PT404'; END IF;
  RETURN result;
END $$;

-- Existing function owners and ACLs survive CREATE OR REPLACE. New functions do
-- not inherit permissive PUBLIC/default execution. No new table grants or RLS bypass.
REVOKE ALL ON FUNCTION app_private.guard_client_identity_scope(),app_private.guard_client_request_link(),
  app_private.client_owns_request(uuid,uuid),app_private.guard_original_client_inputs()
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.client_subprojects(text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.client_subprojects(text,uuid) TO anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.submit_client_request(jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
