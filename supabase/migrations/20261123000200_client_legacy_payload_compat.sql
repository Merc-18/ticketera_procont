-- CANDIDATE (experiment only, not a repository migration).
-- M16 compatibility: Quipu ignores any client-supplied requester_name and always
-- derives it from the authenticated identity. QuipuFac unchanged (declared, required).
-- Replaces public.submit_client_request (owner-only) and public.client_submit_request; owner/ACL survive CREATE OR REPLACE.
BEGIN;
-- Legacy payloads (no 'subsystem_id' key) keep today's M11 behavior: NULL accepted at creation,
-- still required by guard_request_classification before approval. Membership always validated.
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
  IF v_sub IS NULL AND sy.requires_subproject AND p_payload ? 'subsystem_id' AND EXISTS(SELECT 1 FROM public.catalog_subsystems WHERE system_id=sy.id AND is_active) THEN
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
  previous app_private.client_request_links; result jsonb; input jsonb; v_name text; v_source text; v_payload jsonb;
BEGIN
  PERFORM 1 FROM app_private.client_sessions WHERE token_hash=app_private.client_token_hash(p_session_token) FOR SHARE;
  s:=app_private.client_session(p_session_token);
  SELECT * INTO i FROM app_private.client_identities WHERE id=s.identity_id FOR SHARE;
  PERFORM app_private.assert_payload(p_payload,ARRAY['requester_name','system_id','subsystem_id','request_type_id','title',
    'description','urgent_requested','requested_priority']);
  IF p_idempotency_key IS NULL THEN RAISE EXCEPTION 'Idempotency key required' USING ERRCODE='22023'; END IF;
  IF i.provider='quipu' THEN
    -- Legacy clients may still send a typed name. Validate its shape only, never use or store it.
    IF p_payload ? 'requester_name' AND (jsonb_typeof(p_payload->'requester_name') IS DISTINCT FROM 'string'
      OR length(p_payload->>'requester_name') NOT BETWEEN 1 AND 200) THEN
      RAISE EXCEPTION 'Invalid legacy requester name' USING ERRCODE='22023'; END IF;
    v_payload:=p_payload-'requester_name';
  ELSE
    v_payload:=p_payload;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('client_request:'||i.id::text||':'||p_idempotency_key::text,0));
  SELECT * INTO previous FROM app_private.client_request_links WHERE identity_id=i.id AND idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF NOT app_private.client_owns_request(i.id,previous.request_id) THEN
      RAISE EXCEPTION 'Client ticket unavailable' USING ERRCODE='PT404'; END IF;
    IF (CASE WHEN i.provider='quipu' THEN previous.original_payload-'requester_name' ELSE previous.original_payload END)
      IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'Idempotency key reused with different payload' USING ERRCODE='22023'; END IF;
    SELECT jsonb_build_object('id',r.id,'request_number',r.request_number,'tracking_token',a.tracking_token) INTO result
      FROM public.requests r JOIN app_private.request_access a ON a.request_id=r.id WHERE r.id=previous.request_id;
    RETURN result;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.client_products(p_session_token)) p WHERE p->>'id'=v_payload->>'system_id') THEN
    RAISE EXCEPTION 'Product unavailable for this entry context' USING ERRCODE='PT403'; END IF;
  study:=app_private.client_studio(i.company_id);
  IF study IS NULL THEN RAISE EXCEPTION 'Explicit study mapping required' USING ERRCODE='23514'; END IF;
  IF i.provider='quipu' THEN
    v_name:=coalesce(i.verified_name,i.username);
    v_source:=CASE WHEN i.verified_name IS NOT NULL THEN 'verified_name' ELSE 'username' END;
    IF app_private.normalize_requester_name(v_name) IS NULL THEN
      RAISE EXCEPTION 'Authenticated Quipu identity has no usable name' USING ERRCODE='22023'; END IF;
  ELSE
    v_name:=btrim(v_payload->>'requester_name'); v_source:='declared';
    IF jsonb_typeof(v_payload->'requester_name') IS DISTINCT FROM 'string' OR app_private.normalize_requester_name(v_name) IS NULL THEN
      RAISE EXCEPTION 'Declared requester name required' USING ERRCODE='22023'; END IF;
  END IF;
  input:=v_payload||jsonb_build_object('studio_id',study,'requester_name',v_name,'requester_name_source',v_source);
  result:=public.submit_client_request(input,gen_random_uuid());
  INSERT INTO app_private.client_request_links(request_id,identity_id,company_id,provider,entry_context,idempotency_key,original_payload,authenticated_username)
    VALUES((result->>'id')::uuid,i.id,i.company_id,i.provider,s.entry_context,p_idempotency_key,v_payload,CASE WHEN i.provider='quipu' THEN i.username END);
  RETURN result;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;
