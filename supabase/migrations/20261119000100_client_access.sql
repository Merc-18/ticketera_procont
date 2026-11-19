-- M13: independent client sessions. Prepared only; never applied by this task.
-- Existing staff identities, tickets, catalogs and M1-M12 remain unchanged.
BEGIN;

CREATE TABLE app_private.client_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ruc text NOT NULL UNIQUE CHECK (ruc ~ '^[0-9]{11}$'),
  explicit_studio_id uuid REFERENCES public.studios(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE app_private.client_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES app_private.client_companies(id),
  provider text NOT NULL CHECK (provider IN ('quipu','quipufac')),
  subject_source text NOT NULL CHECK (subject_source IN ('provider_id','username','company')),
  subject text NOT NULL CHECK (length(subject) BETWEEN 1 AND 256),
  username text CHECK (length(username) BETWEEN 1 AND 256),
  verified_name text CHECK (length(verified_name) BETWEEN 1 AND 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id,provider,subject_source,subject), UNIQUE(id,company_id),
  CHECK ((provider='quipufac' AND subject_source='company' AND subject='company' AND username IS NULL)
    OR (provider='quipu' AND subject_source IN ('provider_id','username') AND username IS NOT NULL
      AND (subject_source<>'username' OR subject=username)))
);
CREATE TABLE app_private.client_sessions (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  identity_id uuid NOT NULL REFERENCES app_private.client_identities(id),
  entry_context text NOT NULL CHECK (entry_context IN ('direct','platform')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at>created_at AND expires_at<=created_at+interval '24 hours')
);
CREATE INDEX client_sessions_identity_idx ON app_private.client_sessions(identity_id);
CREATE TABLE app_private.client_entry_codes (
  code_hash text PRIMARY KEY CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  identity_id uuid NOT NULL REFERENCES app_private.client_identities(id),
  provider text NOT NULL CHECK (provider IN ('quipu','quipufac')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  CHECK (expires_at>created_at AND expires_at<=created_at+interval '2 minutes')
);
-- Two global product identifiers, never a product/company entitlement matrix.
CREATE TABLE app_private.client_product_bindings (
  provider text PRIMARY KEY CHECK (provider IN ('quipu','quipufac')),
  system_id uuid NOT NULL UNIQUE REFERENCES public.catalog_systems(id)
);
INSERT INTO app_private.client_product_bindings(provider,system_id)
  SELECT 'quipu',id FROM public.catalog_systems WHERE name='Quipu'
  UNION ALL SELECT 'quipufac',id FROM public.catalog_systems WHERE name='Quipu_Fac';
DO $$ BEGIN
  IF (SELECT count(*) FROM app_private.client_product_bindings)<>2 THEN
    RAISE EXCEPTION 'Existing Quipu and Quipu_Fac catalog entries required' USING ERRCODE='23514';
  END IF;
END $$;
CREATE TABLE app_private.client_request_links (
  request_id uuid PRIMARY KEY REFERENCES public.requests(id),
  identity_id uuid NOT NULL,
  company_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('quipu','quipufac')),
  entry_context text NOT NULL CHECK (entry_context IN ('direct','platform')),
  idempotency_key uuid NOT NULL,
  original_payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(identity_id,company_id) REFERENCES app_private.client_identities(id,company_id),
  UNIQUE(identity_id,idempotency_key)
);
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['client_companies','client_identities','client_sessions',
    'client_entry_codes','client_product_bindings','client_request_links'] LOOP
    EXECUTE format('ALTER TABLE app_private.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON app_private.%I FROM PUBLIC,anon,authenticated,service_role',t);
  END LOOP;
END $$;

CREATE FUNCTION app_private.client_token_hash(p_token text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Client session unavailable' USING ERRCODE='42501';
  END IF;
  RETURN encode(sha256(convert_to(p_token,'UTF8')),'hex');
END $$;
CREATE FUNCTION app_private.client_session(p_token text) RETURNS app_private.client_sessions
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE s app_private.client_sessions;
BEGIN
  SELECT * INTO s FROM app_private.client_sessions WHERE token_hash=app_private.client_token_hash(p_token)
    AND revoked_at IS NULL AND expires_at>clock_timestamp();
  IF NOT FOUND THEN RAISE EXCEPTION 'Client session unavailable' USING ERRCODE='42501'; END IF;
  RETURN s;
END $$;
CREATE FUNCTION app_private.client_identity(p_provider text,p_ruc text,p_subject text,
  p_subject_source text,p_username text,p_verified_name text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE company uuid; identity_id uuid;
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
  INSERT INTO app_private.client_identities(company_id,provider,subject_source,subject,username,verified_name)
    VALUES(company,p_provider,p_subject_source,p_subject,p_username,nullif(btrim(p_verified_name),''))
    ON CONFLICT(company_id,provider,subject_source,subject) DO UPDATE
      SET username=excluded.username,verified_name=excluded.verified_name RETURNING id INTO identity_id;
  RETURN identity_id;
END $$;
CREATE FUNCTION app_private.client_studio(p_company uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT CASE WHEN c.explicit_studio_id IS NOT NULL THEN
    (SELECT id FROM public.studios WHERE id=c.explicit_studio_id AND is_active)
  ELSE (SELECT CASE WHEN count(*)=1 THEN (array_agg(id))[1] END
    FROM public.studios WHERE ruc=c.ruc AND is_active) END
  FROM app_private.client_companies c WHERE c.id=p_company;
$$;
CREATE FUNCTION public.set_client_company_studio(p_ruc text,p_studio_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM app_private.require_role(ARRAY['superadmin','admin']);
  IF p_ruc IS NULL OR p_ruc !~ '^[0-9]{11}$' OR (p_studio_id IS NOT NULL AND NOT EXISTS
    (SELECT 1 FROM public.studios WHERE id=p_studio_id AND is_active AND (ruc=p_ruc OR ruc IS NULL))) THEN
    RAISE EXCEPTION 'Explicit study mapping invalid' USING ERRCODE='22023';
  END IF;
  INSERT INTO app_private.client_companies(ruc,explicit_studio_id) VALUES(p_ruc,p_studio_id)
    ON CONFLICT(ruc) DO UPDATE SET explicit_studio_id=excluded.explicit_studio_id;
END $$;
CREATE FUNCTION public.client_session_info(p_session_token text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE s app_private.client_sessions; result jsonb;
BEGIN
  s:=app_private.client_session(p_session_token);
  SELECT jsonb_build_object('expires_at',s.expires_at,'entry_context',s.entry_context,
    'identity',jsonb_build_object('id',i.id,'provider',i.provider,'kind',CASE WHEN i.provider='quipu' THEN 'user' ELSE 'company' END,
      'username',i.username,'subject_source',i.subject_source,'verified_name',i.verified_name,'name_verified',i.verified_name IS NOT NULL),
    'company',jsonb_build_object('ruc',c.ruc,'studio_id',app_private.client_studio(c.id),
      'studio_mapping',CASE WHEN app_private.client_studio(c.id) IS NULL THEN 'required' ELSE 'resolved' END)) INTO result
    FROM app_private.client_identities i JOIN app_private.client_companies c ON c.id=i.company_id WHERE i.id=s.identity_id;
  RETURN result;
END $$;
-- Only the Edge Function's service client may mint authenticated sessions or codes.
CREATE FUNCTION public.client_open_session(p_provider text,p_ruc text,p_subject text,p_subject_source text,
  p_username text,p_verified_name text,p_token_hash text,p_expires_at timestamptz) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE identity_id uuid;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' OR p_expires_at IS NULL
    OR p_expires_at<=clock_timestamp() OR p_expires_at>now()+interval '24 hours' THEN
    RAISE EXCEPTION 'Invalid session lifetime or digest' USING ERRCODE='22023'; END IF;
  identity_id:=app_private.client_identity(p_provider,p_ruc,p_subject,p_subject_source,p_username,p_verified_name);
  INSERT INTO app_private.client_sessions(token_hash,identity_id,entry_context,expires_at)
    VALUES(p_token_hash,identity_id,'direct',p_expires_at);
END $$;
CREATE FUNCTION public.client_issue_entry_code(p_provider text,p_ruc text,p_subject text,p_subject_source text,
  p_username text,p_verified_name text,p_code_hash text,p_expires_at timestamptz) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE identity_id uuid;
BEGIN
  IF p_code_hash IS NULL OR p_code_hash !~ '^[0-9a-f]{64}$' OR p_expires_at IS NULL
    OR p_expires_at<=clock_timestamp() OR p_expires_at>now()+interval '2 minutes' THEN
    RAISE EXCEPTION 'Invalid entry code lifetime or digest' USING ERRCODE='22023'; END IF;
  identity_id:=app_private.client_identity(p_provider,p_ruc,p_subject,p_subject_source,p_username,p_verified_name);
  INSERT INTO app_private.client_entry_codes(code_hash,identity_id,provider,expires_at)
    VALUES(p_code_hash,identity_id,p_provider,p_expires_at);
END $$;
CREATE FUNCTION public.client_exchange_entry_code(p_provider text,p_code_hash text,p_token_hash text,p_expires_at timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE identity_id uuid;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' OR p_expires_at IS NULL
    OR p_expires_at<=clock_timestamp() OR p_expires_at>now()+interval '24 hours' THEN
    RAISE EXCEPTION 'Invalid session lifetime or digest' USING ERRCODE='22023'; END IF;
  UPDATE app_private.client_entry_codes SET used_at=clock_timestamp()
    WHERE code_hash=p_code_hash AND provider=p_provider AND used_at IS NULL AND expires_at>clock_timestamp()
    RETURNING client_entry_codes.identity_id INTO identity_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Entry code unavailable' USING ERRCODE='42501'; END IF;
  INSERT INTO app_private.client_sessions(token_hash,identity_id,entry_context,expires_at)
    VALUES(p_token_hash,identity_id,'platform',p_expires_at);
END $$;
CREATE FUNCTION public.client_logout(p_session_token text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  UPDATE app_private.client_sessions SET revoked_at=coalesce(revoked_at,clock_timestamp())
    WHERE token_hash=app_private.client_token_hash(p_session_token);
END $$;
CREATE FUNCTION public.client_products(p_session_token text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE s app_private.client_sessions; v_provider text; result jsonb;
BEGIN
  s:=app_private.client_session(p_session_token);
  SELECT i.provider INTO v_provider FROM app_private.client_identities i WHERE i.id=s.identity_id;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'requires_subproject',c.requires_subproject)
    ORDER BY c.sort_order,c.name),'[]'::jsonb) INTO result FROM public.catalog_systems c WHERE c.is_active
    AND ((s.entry_context='platform' AND c.id=(SELECT system_id FROM app_private.client_product_bindings b WHERE b.provider=v_provider))
      OR (s.entry_context='direct' AND (v_provider='quipu' OR c.id<>(SELECT system_id FROM app_private.client_product_bindings WHERE client_product_bindings.provider='quipu'))));
  RETURN result;
END $$;
CREATE FUNCTION public.client_submit_request(p_session_token text,p_payload jsonb,p_idempotency_key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s app_private.client_sessions; i app_private.client_identities; study uuid;
  previous app_private.client_request_links; result jsonb; input jsonb;
BEGIN
  -- Serialize revocation against new ticket creation; no client GUC is trusted.
  PERFORM 1 FROM app_private.client_sessions WHERE token_hash=app_private.client_token_hash(p_session_token) FOR SHARE;
  s:=app_private.client_session(p_session_token);
  SELECT * INTO i FROM app_private.client_identities WHERE id=s.identity_id;
  PERFORM app_private.assert_payload(p_payload,ARRAY['requester_name','system_id','request_type_id','title','description','urgent_requested']);
  IF p_idempotency_key IS NULL THEN RAISE EXCEPTION 'Idempotency key required' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('client_request:'||i.id::text||':'||p_idempotency_key::text,0));
  SELECT * INTO previous FROM app_private.client_request_links WHERE identity_id=i.id AND idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF previous.original_payload IS DISTINCT FROM p_payload THEN
      RAISE EXCEPTION 'Idempotency key reused with different payload' USING ERRCODE='22023'; END IF;
    SELECT jsonb_build_object('id',r.id,'request_number',r.request_number,'tracking_token',a.tracking_token) INTO result
      FROM public.requests r JOIN app_private.request_access a ON a.request_id=r.id WHERE r.id=previous.request_id;
    RETURN result;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.client_products(p_session_token)) p
      WHERE p->>'id'=p_payload->>'system_id') THEN
    RAISE EXCEPTION 'Product unavailable for this entry context' USING ERRCODE='42501'; END IF;
  study:=app_private.client_studio(i.company_id);
  IF study IS NULL THEN RAISE EXCEPTION 'Explicit study mapping required' USING ERRCODE='23514'; END IF;
  input:=p_payload||jsonb_build_object('studio_id',study);
  -- Reuse all existing validation, REQ numbering, events, urgency and upload capability.
  -- The legacy replay key is server generated and never exposed; identity-scoped
  -- retries above cannot collide with anonymous callers or other client identities.
  result:=public.submit_client_request(input,gen_random_uuid());
  INSERT INTO app_private.client_request_links(request_id,identity_id,company_id,provider,entry_context,idempotency_key,original_payload)
    VALUES((result->>'id')::uuid,i.id,i.company_id,i.provider,s.entry_context,p_idempotency_key,p_payload);
  RETURN result;
END $$;
CREATE FUNCTION app_private.client_ticket_summary(p_request_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object('id',r.id,'request_number',r.request_number,'title',r.title,'created_at',r.created_at,
    'status',r.status,'general_status',app_private.request_general_status(r.id),'system_id',r.system_id,
    'requester_name',r.requester_name,'requester_name_verified',false)
  FROM public.requests r WHERE r.id=p_request_id;
$$;
CREATE FUNCTION public.client_reserve_attachments(p_session_token text,p_request_id uuid,p_files jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s app_private.client_sessions; tracking uuid;
BEGIN
  PERFORM 1 FROM app_private.client_sessions WHERE token_hash=app_private.client_token_hash(p_session_token) FOR SHARE;
  s:=app_private.client_session(p_session_token);
  SELECT a.tracking_token INTO tracking FROM app_private.client_request_links l
    JOIN app_private.request_access a ON a.request_id=l.request_id
    WHERE l.request_id=p_request_id AND l.identity_id=s.identity_id;
  IF tracking IS NULL THEN RAISE EXCEPTION 'Client ticket unavailable' USING ERRCODE='42501'; END IF;
  RETURN public.reserve_request_attachments(p_request_id,tracking,p_files);
END $$;
CREATE FUNCTION public.client_list_tickets(p_session_token text,p_limit integer DEFAULT 50,p_offset integer DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE s app_private.client_sessions; result jsonb;
BEGIN
  s:=app_private.client_session(p_session_token);
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR p_offset IS NULL OR p_offset<0 OR p_offset>100000 THEN
    RAISE EXCEPTION 'Invalid pagination' USING ERRCODE='22023'; END IF;
  SELECT coalesce(jsonb_agg(item ORDER BY created_at DESC,request_id DESC),'[]'::jsonb) INTO result FROM (
    SELECT l.request_id,r.created_at,app_private.client_ticket_summary(r.id) AS item FROM app_private.client_request_links l
    JOIN public.requests r ON r.id=l.request_id WHERE l.identity_id=s.identity_id
      AND NOT EXISTS(SELECT 1 FROM public.projects WHERE id=r.project_id AND status='deleted')
    ORDER BY r.created_at DESC,r.id DESC LIMIT p_limit OFFSET p_offset) q;
  RETURN result;
END $$;
CREATE FUNCTION public.client_ticket_detail(p_session_token text,p_request_id uuid) RETURNS jsonb
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
    WHERE r.id=p_request_id AND l.identity_id=s.identity_id
      AND NOT EXISTS(SELECT 1 FROM public.projects WHERE id=r.project_id AND status='deleted');
  IF result IS NULL THEN RAISE EXCEPTION 'Client ticket unavailable' USING ERRCODE='42501'; END IF;
  RETURN result;
END $$;

-- Never inherit permissive default EXECUTE grants, including service_role.
DO $$ DECLARE fn regprocedure; BEGIN
  FOR fn IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE (n.nspname='app_private' AND p.proname LIKE 'client_%')
      OR (n.nspname='public' AND (p.proname LIKE 'client_%' OR p.proname='set_client_company_studio')) LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',fn);
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.client_open_session(text,text,text,text,text,text,text,timestamptz),
  public.client_issue_entry_code(text,text,text,text,text,text,text,timestamptz),
  public.client_exchange_entry_code(text,text,text,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.client_session_info(text),public.client_logout(text),public.client_products(text),
  public.client_submit_request(text,jsonb,uuid),public.client_list_tickets(text,integer,integer),
  public.client_ticket_detail(text,uuid),public.client_reserve_attachments(text,uuid,jsonb) TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.set_client_company_studio(text,uuid) TO authenticated;
COMMIT;
