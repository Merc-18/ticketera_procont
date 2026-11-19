-- M15 · Close legacy request-creation bypasses. No application-data changes.
-- M1-M14 remain unchanged. Apply only after separate review/remote authorization.
BEGIN;

-- M13 client_submit_request is SECURITY DEFINER with the same owner as this helper.
-- Keep its internal call; deny direct invocation, including inherited PUBLIC grants.
REVOKE EXECUTE ON FUNCTION public.submit_client_request(jsonb,uuid)
  FROM PUBLIC,anon,authenticated,service_role;

-- Preserve the internal intake/Planner signatures and validation. Use the existing
-- active-editor policy (same roles as canEdit); Planner UI remains admin/superadmin.
CREATE OR REPLACE FUNCTION public.submit_request(p_payload jsonb,p_idempotency_key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb; r public.requests; token uuid;
BEGIN
  -- Check authorization before validation or idempotent replay.
  PERFORM app_private.require_role(ARRAY['superadmin','admin','developer']);
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

CREATE OR REPLACE FUNCTION public.submit_classified_request(p_payload jsonb, p_classification jsonb, p_idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb; input jsonb; st public.studios; sy public.catalog_systems; r public.requests; token uuid;
  v_sub uuid; v_area public.areas; v_subarea public.areas;
BEGIN
  -- Check authorization before validation or idempotent replay.
  PERFORM app_private.require_role(ARRAY['superadmin','admin','developer']);
  PERFORM app_private.assert_payload(p_payload, ARRAY['requester_name','requester_email','request_type','origin',
    'data_system_involved','description','observations','request_date','requested_date','needs_code']);
  PERFORM app_private.assert_payload(p_classification, ARRAY['studio_id','system_id','subsystem_id','area_id','subarea_id']);
  input := jsonb_build_object('payload', p_payload, 'classification', p_classification);
  result := app_private.replay('submit_classified_request', p_idempotency_key, input);
  IF result IS NOT NULL THEN RETURN result; END IF;

  SELECT * INTO st FROM public.studios WHERE id = nullif(p_classification->>'studio_id','')::uuid AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Estudio activo requerido' USING ERRCODE='22023'; END IF;
  SELECT * INTO sy FROM public.catalog_systems WHERE id = nullif(p_classification->>'system_id','')::uuid AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proyecto activo requerido' USING ERRCODE='22023'; END IF;
  v_sub := nullif(p_classification->>'subsystem_id','')::uuid;
  IF v_sub IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.catalog_subsystems
       WHERE id = v_sub AND system_id = sy.id AND is_active) THEN
    RAISE EXCEPTION 'Subproyecto inválido' USING ERRCODE='22023';
  END IF;
  IF v_sub IS NULL AND sy.requires_subproject AND EXISTS (SELECT 1 FROM public.catalog_subsystems
       WHERE system_id = sy.id AND is_active) THEN
    RAISE EXCEPTION 'Subproyecto requerido' USING ERRCODE='22023';
  END IF;

  IF EXISTS (SELECT 1 FROM public.areas WHERE studio_id = st.id AND parent_id IS NULL AND is_active) THEN
    -- Estudio con áreas (BUSINESS ACCOMPANYING SAC): área obligatoria, subárea opcional.
    SELECT * INTO v_area FROM public.areas WHERE id = nullif(p_classification->>'area_id','')::uuid
      AND studio_id = st.id AND parent_id IS NULL AND is_active;
    IF NOT FOUND THEN RAISE EXCEPTION 'Área requerida para este estudio' USING ERRCODE='22023'; END IF;
    IF nullif(p_classification->>'subarea_id','') IS NOT NULL THEN
      SELECT * INTO v_subarea FROM public.areas WHERE id = (p_classification->>'subarea_id')::uuid
        AND parent_id = v_area.id AND is_active;
      IF NOT FOUND THEN RAISE EXCEPTION 'Subárea inválida' USING ERRCODE='22023'; END IF;
    END IF;
  ELSIF nullif(p_classification->>'area_id','') IS NOT NULL OR nullif(p_classification->>'subarea_id','') IS NOT NULL THEN
    RAISE EXCEPTION 'Este estudio no tiene áreas' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.requests(requester_name,requester_email,requester_area,request_type,origin,
    data_system_involved,description,observations,request_date,requested_date,needs_code,
    studio_id,system_id,subsystem_id,area_id,subarea_id)
  VALUES (btrim(p_payload->>'requester_name'),nullif(p_payload->>'requester_email',''),v_area.name,
    btrim(p_payload->>'request_type'),coalesce(p_payload->>'origin','Interno'),p_payload->>'data_system_involved',
    btrim(p_payload->>'description'),p_payload->>'observations',nullif(p_payload->>'request_date','')::date,
    nullif(p_payload->>'requested_date','')::date,coalesce((p_payload->>'needs_code')::boolean,false),
    st.id,sy.id,v_sub,v_area.id,v_subarea.id) RETURNING * INTO r;
  INSERT INTO app_private.request_access(request_id) VALUES (r.id) RETURNING tracking_token INTO token;
  result := jsonb_build_object('id',r.id,'request_number',r.request_number,'tracking_token',token);
  RETURN app_private.remember('submit_classified_request', p_idempotency_key, input, result);
END $$;

-- Do not inherit public/default EXECUTE; authenticated callers also pass require_role.
REVOKE EXECUTE ON FUNCTION public.submit_request(jsonb,uuid),
  public.submit_classified_request(jsonb,jsonb,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.submit_request(jsonb,uuid),
  public.submit_classified_request(jsonb,jsonb,uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
