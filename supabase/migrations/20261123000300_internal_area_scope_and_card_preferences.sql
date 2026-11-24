-- M17 · Limitar áreas al código interno PROCONT y persistir el color personal del equipo.
-- Aditiva: no reescribe solicitudes, proyectos ni eventos históricos. Las preferencias
-- se inicializan para perfiles activos con una paleta estable y asignación única.
BEGIN;

-- ─── Regla exacta para áreas ───────────────────────────────────────────────────
-- El código se resuelve en studio_codes por UUID y estudio en el servidor.
-- Los formularios antiguos pueden seguir enviando area_id/subarea_id: para cualquier
-- código distinto de PROCONT se descartan, sin intentar interpretar sus valores.

CREATE OR REPLACE FUNCTION app_private.guard_request_classification() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE sys public.catalog_systems; code text; code_changed boolean;
BEGIN
  IF (OLD.studio_id IS NOT NULL AND NEW.studio_id IS DISTINCT FROM OLD.studio_id)
     OR (OLD.system_id IS NOT NULL AND NEW.system_id IS DISTINCT FROM OLD.system_id)
     OR (OLD.request_type_id IS NOT NULL AND ROW(NEW.request_type_id, NEW.title, NEW.description, NEW.urgent_requested)
          IS DISTINCT FROM ROW(OLD.request_type_id, OLD.title, OLD.description, OLD.urgent_requested)) THEN
    RAISE EXCEPTION 'La información original de la solicitud no se modifica' USING ERRCODE='23514';
  END IF;

  code_changed := NEW.studio_code_id IS DISTINCT FROM OLD.studio_code_id;
  IF ROW(NEW.studio_code_id, NEW.subsystem_id, NEW.area_id, NEW.subarea_id)
       IS DISTINCT FROM ROW(OLD.studio_code_id, OLD.subsystem_id, OLD.area_id, OLD.subarea_id)
     AND OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'La clasificación se fija con la decisión' USING ERRCODE='23514';
  END IF;

  IF NEW.studio_code_id IS NOT NULL THEN
    SELECT c.code INTO code FROM public.studio_codes c
      WHERE c.id=NEW.studio_code_id AND c.studio_id=NEW.studio_id AND c.is_active;
    IF NOT FOUND THEN RAISE EXCEPTION 'El código no corresponde al estudio activo' USING ERRCODE='22023'; END IF;
  END IF;

  -- Normaliza solo escrituras de clasificación. Un UPDATE ajeno a la clasificación
  -- no elimina asociaciones históricas existentes.
  IF code IS DISTINCT FROM 'PROCONT' AND
     (code_changed OR NEW.area_id IS DISTINCT FROM OLD.area_id OR NEW.subarea_id IS DISTINCT FROM OLD.subarea_id) THEN
    NEW.area_id := NULL;
    NEW.subarea_id := NULL;
    IF code_changed AND OLD.studio_code_id IS NOT NULL THEN
      SELECT c.code INTO code FROM public.studio_codes c WHERE c.id=OLD.studio_code_id;
      IF code='PROCONT' THEN NEW.requester_area := NULL; END IF;
    END IF;
  ELSIF code='PROCONT' AND (code_changed OR NEW.area_id IS DISTINCT FROM OLD.area_id OR NEW.subarea_id IS DISTINCT FROM OLD.subarea_id) THEN
    IF NEW.area_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.areas a
        WHERE a.id=NEW.area_id AND a.studio_id=NEW.studio_id AND a.parent_id IS NULL AND a.is_active) THEN
      RAISE EXCEPTION 'Área inválida para PROCONT' USING ERRCODE='22023';
    END IF;
    IF NEW.subarea_id IS NOT NULL AND (NEW.area_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.areas a
        WHERE a.id=NEW.subarea_id AND a.studio_id=NEW.studio_id AND a.parent_id=NEW.area_id AND a.is_active)) THEN
      RAISE EXCEPTION 'Subárea inválida para PROCONT' USING ERRCODE='22023';
    END IF;
    IF code_changed AND OLD.studio_code_id IS NOT NULL AND NEW.area_id IS NULL
       AND EXISTS (SELECT 1 FROM public.areas a WHERE a.studio_id=NEW.studio_id AND a.parent_id IS NULL AND a.is_active) THEN
      RAISE EXCEPTION 'Área requerida para PROCONT' USING ERRCODE='23514';
    END IF;
  END IF;

  IF OLD.status='pending' AND NEW.status<>'pending' AND NEW.studio_id IS NOT NULL THEN
    IF NEW.studio_code_id IS NULL THEN
      RAISE EXCEPTION 'Asignar el código interno del estudio antes de aceptar o rechazar' USING ERRCODE='23514';
    END IF;
    IF NEW.status='approved' THEN
      SELECT c.code INTO code FROM public.studio_codes c
        WHERE c.id=NEW.studio_code_id AND c.studio_id=NEW.studio_id AND c.is_active;
      IF code='PROCONT' AND NEW.area_id IS NULL AND EXISTS (SELECT 1 FROM public.areas a
          WHERE a.studio_id=NEW.studio_id AND a.parent_id IS NULL AND a.is_active) THEN
        RAISE EXCEPTION 'Área requerida para aceptar solicitudes del código PROCONT' USING ERRCODE='23514';
      END IF;
      SELECT * INTO sys FROM public.catalog_systems WHERE id=NEW.system_id;
      IF NEW.subsystem_id IS NULL AND sys.requires_subproject AND EXISTS
          (SELECT 1 FROM public.catalog_subsystems WHERE system_id=NEW.system_id AND is_active) THEN
        RAISE EXCEPTION 'Subproyecto requerido para aceptar' USING ERRCODE='23514';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.classify_request(p_request_id uuid, p_classification jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.requests; v_code uuid; v_code_text text; v_sub uuid; v_area uuid; v_subarea uuid;
  v_area_name text; v_event jsonb;
BEGIN
  PERFORM app_private.require_role(ARRAY['superadmin','admin']);
  PERFORM app_private.assert_payload(p_classification, ARRAY['studio_code_id','subsystem_id','area_id','subarea_id']);
  SELECT * INTO r FROM public.requests WHERE id=p_request_id FOR UPDATE;
  IF NOT FOUND OR r.status<>'pending' OR r.studio_id IS NULL THEN
    RAISE EXCEPTION 'Solicitud pendiente con estudio requerida' USING ERRCODE='23514';
  END IF;
  v_code:=nullif(p_classification->>'studio_code_id','')::uuid;
  SELECT c.code INTO v_code_text FROM public.studio_codes c
    WHERE c.id=v_code AND c.studio_id=r.studio_id AND c.is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'El código no corresponde al estudio de la solicitud' USING ERRCODE='22023'; END IF;
  v_sub:=nullif(p_classification->>'subsystem_id','')::uuid;
  IF v_sub IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.catalog_subsystems
       WHERE id=v_sub AND system_id=r.system_id AND is_active) THEN
    RAISE EXCEPTION 'Subproyecto inválido para el proyecto' USING ERRCODE='22023';
  END IF;

  v_area:=NULL; v_subarea:=NULL; v_area_name:=NULL;
  IF v_code_text='PROCONT' THEN
    v_area:=nullif(p_classification->>'area_id','')::uuid;
    v_subarea:=nullif(p_classification->>'subarea_id','')::uuid;
    IF v_area IS NULL AND EXISTS (SELECT 1 FROM public.areas
        WHERE studio_id=r.studio_id AND parent_id IS NULL AND is_active) THEN
      RAISE EXCEPTION 'Área requerida para el código PROCONT' USING ERRCODE='22023';
    END IF;
    IF v_area IS NOT NULL THEN
      SELECT name INTO v_area_name FROM public.areas WHERE id=v_area AND studio_id=r.studio_id
        AND parent_id IS NULL AND is_active;
      IF NOT FOUND THEN RAISE EXCEPTION 'Área inválida para PROCONT' USING ERRCODE='22023'; END IF;
    END IF;
    IF v_subarea IS NOT NULL AND (v_area IS NULL OR NOT EXISTS (SELECT 1 FROM public.areas
        WHERE id=v_subarea AND studio_id=r.studio_id AND parent_id=v_area AND is_active)) THEN
      RAISE EXCEPTION 'Subárea inválida para PROCONT' USING ERRCODE='22023';
    END IF;
  END IF;

  UPDATE public.requests SET studio_code_id=v_code, subsystem_id=v_sub, area_id=v_area, subarea_id=v_subarea,
      requester_area=CASE WHEN v_code_text='PROCONT' THEN v_area_name ELSE NULL END,
      classified_by=auth.uid(), classified_at=now()
    WHERE id=r.id;
  v_event:=jsonb_build_object('studio_code_id',v_code,'subsystem_id',v_sub,'area_id',v_area,'subarea_id',v_subarea);
  INSERT INTO public.request_events(request_id,actor_id,action,details)
    VALUES(r.id,auth.uid(),'classified',v_event);
END $$;

CREATE OR REPLACE FUNCTION public.assign_request_studio_code(p_request_id uuid, p_studio_code_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.requests; v_code text;
BEGIN
  PERFORM app_private.require_role(ARRAY['superadmin','admin']);
  SELECT * INTO r FROM public.requests WHERE id=p_request_id FOR UPDATE;
  IF NOT FOUND OR r.status<>'pending' THEN RAISE EXCEPTION 'Solicitud pendiente requerida' USING ERRCODE='23514'; END IF;
  SELECT code INTO v_code FROM public.studio_codes WHERE id=p_studio_code_id
    AND studio_id=r.studio_id AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'El código no corresponde al estudio de la solicitud' USING ERRCODE='22023'; END IF;
  UPDATE public.requests SET studio_code_id=p_studio_code_id,
      area_id=CASE WHEN v_code='PROCONT' THEN area_id ELSE NULL END,
      subarea_id=CASE WHEN v_code='PROCONT' THEN subarea_id ELSE NULL END,
      requester_area=CASE WHEN v_code='PROCONT' THEN requester_area
        WHEN EXISTS (SELECT 1 FROM public.studio_codes old WHERE old.id=r.studio_code_id AND old.code='PROCONT') THEN NULL
        ELSE requester_area END,
      classified_by=auth.uid(), classified_at=now()
    WHERE id=r.id;
END $$;

-- El intake Planner anterior no conoce un código interno; no puede asociar área.
-- Conserva firmas y parámetros permitidos, pero limpia las áreas heredadas antes de replay.
CREATE OR REPLACE FUNCTION public.submit_request(p_payload jsonb,p_idempotency_key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb; input jsonb; r public.requests; token uuid;
BEGIN
  PERFORM app_private.require_role(ARRAY['superadmin','admin','developer']);
  PERFORM app_private.assert_payload(p_payload,ARRAY['requester_name','requester_email','requester_area',
    'request_type','origin','data_system_involved','description','observations','request_date','requested_date','needs_code']);
  -- Replay se evalúa sobre el payload histórico exacto antes de normalizar el área,
  -- de modo que reintentos pendientes de la versión anterior sigan siendo idempotentes.
  result:=app_private.replay('submit_request',p_idempotency_key,p_payload);
  IF result IS NOT NULL THEN RETURN result; END IF;
  IF p_payload ? 'requester_area' AND jsonb_typeof(p_payload->'requester_area') NOT IN ('string','null') THEN
    RAISE EXCEPTION 'Invalid requester area' USING ERRCODE='22023';
  END IF;
  input:=p_payload;
  IF nullif(btrim(p_payload->>'requester_name'),'') IS NULL OR nullif(btrim(p_payload->>'request_type'),'') IS NULL
    OR nullif(btrim(p_payload->>'description'),'') IS NULL THEN
    RAISE EXCEPTION 'Requester, type and description required' USING ERRCODE='22023'; END IF;
  INSERT INTO public.requests(requester_name,requester_email,requester_area,request_type,origin,
    data_system_involved,description,observations,request_date,requested_date,needs_code)
  VALUES(btrim(p_payload->>'requester_name'),nullif(p_payload->>'requester_email',''),NULL,btrim(p_payload->>'request_type'),
    coalesce(p_payload->>'origin','Interno'),p_payload->>'data_system_involved',btrim(p_payload->>'description'),
    p_payload->>'observations',nullif(p_payload->>'request_date','')::date,nullif(p_payload->>'requested_date','')::date,
    coalesce((p_payload->>'needs_code')::boolean,false)) RETURNING * INTO r;
  INSERT INTO app_private.request_access(request_id) VALUES(r.id) RETURNING tracking_token INTO token;
  result:=jsonb_build_object('id',r.id,'request_number',r.request_number,'tracking_token',token);
  RETURN app_private.remember('submit_request',p_idempotency_key,input,result);
END $$;

-- submit_classified_request recibe estudio/producto, pero todavía no asigna un código.
-- Por lo tanto descarta las áreas y deja que classify_request las resuelva al conocerlo.
CREATE OR REPLACE FUNCTION public.submit_classified_request(p_payload jsonb,p_classification jsonb,p_idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb; input jsonb; original_classification jsonb; st public.studios; sy public.catalog_systems; r public.requests; token uuid; v_sub uuid;
BEGIN
  PERFORM app_private.require_role(ARRAY['superadmin','admin','developer']);
  PERFORM app_private.assert_payload(p_payload,ARRAY['requester_name','requester_email','request_type','origin',
    'data_system_involved','description','observations','request_date','requested_date','needs_code']);
  PERFORM app_private.assert_payload(p_classification,ARRAY['studio_id','system_id','subsystem_id','area_id','subarea_id']);
  original_classification:=p_classification;
  input:=jsonb_build_object('payload',p_payload,'classification',original_classification);
  result:=app_private.replay('submit_classified_request',p_idempotency_key,input);
  IF result IS NOT NULL THEN RETURN result; END IF;
  p_classification:=p_classification||jsonb_build_object('area_id',NULL,'subarea_id',NULL);
  SELECT * INTO st FROM public.studios WHERE id=nullif(p_classification->>'studio_id','')::uuid AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Estudio activo requerido' USING ERRCODE='22023'; END IF;
  SELECT * INTO sy FROM public.catalog_systems WHERE id=nullif(p_classification->>'system_id','')::uuid AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proyecto activo requerido' USING ERRCODE='22023'; END IF;
  v_sub:=nullif(p_classification->>'subsystem_id','')::uuid;
  IF v_sub IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.catalog_subsystems
      WHERE id=v_sub AND system_id=sy.id AND is_active) THEN RAISE EXCEPTION 'Subproyecto inválido' USING ERRCODE='22023'; END IF;
  IF v_sub IS NULL AND sy.requires_subproject AND EXISTS(SELECT 1 FROM public.catalog_subsystems
      WHERE system_id=sy.id AND is_active) THEN RAISE EXCEPTION 'Subproyecto requerido' USING ERRCODE='22023'; END IF;
  IF nullif(btrim(p_payload->>'requester_name'),'') IS NULL OR nullif(btrim(p_payload->>'request_type'),'') IS NULL
    OR nullif(btrim(p_payload->>'description'),'') IS NULL THEN
    RAISE EXCEPTION 'Requester, type and description required' USING ERRCODE='22023'; END IF;
  INSERT INTO public.requests(requester_name,requester_email,requester_area,request_type,origin,data_system_involved,
    description,observations,request_date,requested_date,needs_code,studio_id,system_id,subsystem_id,area_id,subarea_id)
  VALUES(btrim(p_payload->>'requester_name'),nullif(p_payload->>'requester_email',''),NULL,btrim(p_payload->>'request_type'),
    coalesce(p_payload->>'origin','Interno'),p_payload->>'data_system_involved',btrim(p_payload->>'description'),
    p_payload->>'observations',nullif(p_payload->>'request_date','')::date,nullif(p_payload->>'requested_date','')::date,
    coalesce((p_payload->>'needs_code')::boolean,false),st.id,sy.id,v_sub,NULL,NULL) RETURNING * INTO r;
  INSERT INTO app_private.request_access(request_id) VALUES(r.id) RETURNING tracking_token INTO token;
  result:=jsonb_build_object('id',r.id,'request_number',r.request_number,'tracking_token',token);
  RETURN app_private.remember('submit_classified_request',p_idempotency_key,input,result);
END $$;

-- Nuevos proyectos internos no tienen código de estudio y, por tanto, no llevan área.
CREATE OR REPLACE FUNCTION app_private.board_creation_payload(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF coalesce(p->>'project_type','development')<>'development' THEN
    RAISE EXCEPTION 'New projects support Development only' USING ERRCODE='22023'; END IF;
  IF nullif(p->>'assigned_dev','') IS NULL THEN RAISE EXCEPTION 'Principal assignee required' USING ERRCODE='22023'; END IF;
  IF p->>'assigned_admin' IS NOT NULL AND p->>'assigned_admin'<>p->>'assigned_dev' THEN
    RAISE EXCEPTION 'New tickets have one principal assignee' USING ERRCODE='22023'; END IF;
  IF p->>'sla_target_date' IS NOT NULL OR p->>'sla_formal_days' IS NOT NULL THEN
    RAISE EXCEPTION 'No SLA is configured for new work' USING ERRCODE='22023'; END IF;
  RETURN (p-'area')||jsonb_build_object('project_type','development','assigned_admin',NULL,'area',NULL);
END $$;

CREATE OR REPLACE FUNCTION public.create_internal_project(p_payload jsonb,p_idempotency_key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb; input jsonb; rid uuid:=gen_random_uuid(); pid uuid:=gen_random_uuid(); p public.projects;
BEGIN
  PERFORM app_private.require_role(ARRAY['superadmin','admin','developer']);
  PERFORM app_private.assert_payload(p_payload,ARRAY['title','description','project_type','priority','start_date',
    'due_date','sla_target_date','area','requester_name','assigned_dev','assigned_admin']);
  result:=app_private.replay('create_internal_project',p_idempotency_key,p_payload);
  IF result IS NOT NULL THEN RETURN result; END IF;
  input:=p_payload;
  p_payload:=app_private.board_creation_payload(p_payload);
  IF nullif(btrim(p_payload->>'title'),'') IS NULL OR nullif(btrim(p_payload->>'description'),'') IS NULL THEN
    RAISE EXCEPTION 'Title and description required' USING ERRCODE='22023'; END IF;
  INSERT INTO public.requests(id,number_series,requester_name,requester_area,request_type,description,status,project_id)
    VALUES(rid,'INT',coalesce(nullif(btrim(p_payload->>'requester_name'),''),
      (SELECT full_name FROM public.users WHERE id=auth.uid())),NULL,'INT',btrim(p_payload->>'description'),'approved',pid);
  INSERT INTO public.projects(id,request_id,title,description,project_type,priority,start_date,due_date,sla_target_date)
    VALUES(pid,rid,btrim(p_payload->>'title'),btrim(p_payload->>'description'),p_payload->>'project_type',
      coalesce(p_payload->>'priority','medium'),nullif(p_payload->>'start_date','')::date,
      nullif(p_payload->>'due_date','')::date,NULL) RETURNING * INTO p;
  PERFORM app_private.add_flows(pid,p.project_type,nullif(p_payload->>'assigned_dev','')::uuid,
    nullif(p_payload->>'assigned_admin','')::uuid);
  INSERT INTO public.activity_logs(project_id,user_id,action,details)
    VALUES(pid,auth.uid(),'created',jsonb_build_object('title',p.title));
  result:=to_jsonb(p);
  RETURN app_private.remember('create_internal_project',p_idempotency_key,input,result);
END $$;

-- El detalle interno no es una vía alternativa para asociar áreas. En PROCONT el texto
-- siempre se deriva de la clasificación catalogada; para otros códigos se preserva el
-- histórico sin aceptar una asociación nueva desde el payload.
CREATE OR REPLACE FUNCTION public.update_request_details(p_request_id uuid,p_area text,p_requester_name text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.requests; code text;
BEGIN
  PERFORM app_private.require_role(ARRAY['superadmin','admin','developer']);
  SELECT * INTO r FROM public.requests WHERE id=p_request_id
    AND (project_id IS NULL OR app_private.can_read_project(project_id)) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found' USING ERRCODE='22023'; END IF;
  SELECT c.code INTO code FROM public.studio_codes c
    WHERE c.id=r.studio_code_id AND c.studio_id=r.studio_id AND c.is_active;
  IF code='PROCONT' THEN
    UPDATE public.requests SET requester_area=coalesce((SELECT a.name FROM public.areas a
      WHERE a.id=r.area_id AND a.studio_id=r.studio_id AND a.parent_id IS NULL AND a.is_active),NULL),
      requester_name=btrim(p_requester_name) WHERE id=r.id;
  ELSE
    UPDATE public.requests SET requester_name=btrim(p_requester_name) WHERE id=r.id;
  END IF;
END $$;

-- ─── Preferencias compartidas de color del responsable ─────────────────────────
CREATE TABLE app_private.internal_card_color_catalog (
  color_id text PRIMARY KEY,
  label text NOT NULL,
  sort_order smallint NOT NULL UNIQUE
);
INSERT INTO app_private.internal_card_color_catalog(color_id,label,sort_order) VALUES
 ('azul','Azul Procont',1),('azul-claro','Azul claro',2),('azul-oscuro','Azul profundo',3),('azul-acero','Azul acero',4),
 ('celeste','Celeste',5),('celeste-claro','Celeste claro',6),('celeste-oscuro','Celeste intenso',7),('celeste-acero','Celeste acero',8),
 ('dorado','Dorado',9),('dorado-claro','Dorado claro',10),('dorado-oscuro','Dorado tostado',11),('dorado-ocre','Dorado ocre',12),
 ('ambar','Ámbar',13),('ambar-claro','Ámbar claro',14),('ambar-oscuro','Ámbar profundo',15),('ambar-bronce','Ámbar bronce',16),
 ('grafito','Grafito',17),('grafito-claro','Grafito claro',18),('grafito-oscuro','Grafito oscuro',19),('grafito-humo','Grafito humo',20),
 ('pizarra','Pizarra',21),('pizarra-claro','Pizarra claro',22),('pizarra-oscuro','Pizarra oscuro',23),('pizarra-acero','Pizarra acero',24);
REVOKE ALL ON app_private.internal_card_color_catalog FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE public.internal_card_preferences (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  color_id text NOT NULL REFERENCES app_private.internal_card_color_catalog(color_id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT internal_card_preferences_color_unique UNIQUE(color_id)
);
ALTER TABLE public.internal_card_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.internal_card_preferences FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.internal_card_preferences TO authenticated;
CREATE POLICY internal_card_preferences_team_read ON public.internal_card_preferences FOR SELECT TO authenticated
  USING ((SELECT app_private.has_role(ARRAY['superadmin','admin','developer','viewer'])));
CREATE POLICY internal_card_preferences_self_insert ON public.internal_card_preferences FOR INSERT TO authenticated
  WITH CHECK (user_id=(SELECT auth.uid()) AND (SELECT app_private.has_role(ARRAY['superadmin','admin','developer','viewer'])));
CREATE POLICY internal_card_preferences_self_update ON public.internal_card_preferences FOR UPDATE TO authenticated
  USING (user_id=(SELECT auth.uid()) AND (SELECT app_private.has_role(ARRAY['superadmin','admin','developer','viewer'])))
  WITH CHECK (user_id=(SELECT auth.uid()) AND (SELECT app_private.has_role(ARRAY['superadmin','admin','developer','viewer'])));

CREATE FUNCTION app_private.ensure_internal_card_color(p_user_id uuid,p_requested_color_id text DEFAULT NULL) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE active boolean; selected text; existing text;
BEGIN
  SELECT u.is_active INTO active FROM public.users u WHERE u.id=p_user_id FOR UPDATE;
  IF NOT FOUND OR NOT active THEN RAISE EXCEPTION 'Active internal profile required' USING ERRCODE='42501'; END IF;
  LOCK TABLE public.internal_card_preferences IN EXCLUSIVE MODE;
  SELECT color_id INTO existing FROM public.internal_card_preferences WHERE user_id=p_user_id;
  IF p_requested_color_id IS NULL AND existing IS NOT NULL THEN RETURN existing; END IF;
  IF p_requested_color_id IS NULL THEN
    SELECT c.color_id INTO selected FROM app_private.internal_card_color_catalog c
      WHERE NOT EXISTS (SELECT 1 FROM public.internal_card_preferences p WHERE p.color_id=c.color_id)
      ORDER BY c.sort_order LIMIT 1;
    IF selected IS NULL THEN RAISE EXCEPTION 'No internal card color available' USING ERRCODE='23514'; END IF;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM app_private.internal_card_color_catalog c WHERE c.color_id=p_requested_color_id) THEN
      RAISE EXCEPTION 'Invalid internal card color' USING ERRCODE='22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.internal_card_preferences p WHERE p.color_id=p_requested_color_id AND p.user_id<>p_user_id) THEN
      RAISE EXCEPTION 'Internal card color is already assigned' USING ERRCODE='23505';
    END IF;
    selected:=p_requested_color_id;
  END IF;
  INSERT INTO public.internal_card_preferences(user_id,color_id,updated_at) VALUES(p_user_id,selected,clock_timestamp())
    ON CONFLICT(user_id) DO UPDATE SET color_id=EXCLUDED.color_id,updated_at=EXCLUDED.updated_at;
  RETURN selected;
END $$;
REVOKE ALL ON FUNCTION app_private.ensure_internal_card_color(uuid,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION app_private.card_color_profile_sync() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.is_active THEN PERFORM app_private.ensure_internal_card_color(NEW.id,NULL);
  ELSE DELETE FROM public.internal_card_preferences WHERE user_id=NEW.id; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app_private.card_color_profile_sync() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER internal_card_color_profile_sync AFTER INSERT OR UPDATE OF is_active ON public.users
  FOR EACH ROW EXECUTE FUNCTION app_private.card_color_profile_sync();

CREATE FUNCTION public.internal_card_colors() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
  IF NOT app_private.has_role(ARRAY['superadmin','admin','developer','viewer']) THEN
    RAISE EXCEPTION 'Active internal profile required' USING ERRCODE='42501';
  END IF;
  SELECT jsonb_build_object(
    'user_id',auth.uid(),
    'colors',coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.color_id,'label',c.label,
      'assigned_to',p.user_id) ORDER BY c.sort_order)
      FROM app_private.internal_card_color_catalog c LEFT JOIN public.internal_card_preferences p ON p.color_id=c.color_id),'[]'::jsonb),
    'assignments',coalesce((SELECT jsonb_object_agg(p.user_id::text,p.color_id)
      FROM public.internal_card_preferences p JOIN public.users u ON u.id=p.user_id WHERE u.is_active),'{}'::jsonb)
  ) INTO result;
  RETURN result;
END $$;

CREATE FUNCTION public.set_my_internal_card_color(p_color_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE selected text;
BEGIN
  IF NOT app_private.has_role(ARRAY['superadmin','admin','developer','viewer']) THEN
    RAISE EXCEPTION 'Active internal profile required' USING ERRCODE='42501';
  END IF;
  selected:=app_private.ensure_internal_card_color(auth.uid(),p_color_id);
  RETURN jsonb_build_object('user_id',auth.uid(),'color_id',selected);
END $$;

REVOKE ALL ON FUNCTION public.internal_card_colors(),public.set_my_internal_card_color(text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.internal_card_colors(),public.set_my_internal_card_color(text) TO authenticated;

-- Asigna colores de forma determinista a los perfiles que ya están activos.
DO $$ DECLARE u record; BEGIN
  FOR u IN SELECT id FROM public.users WHERE is_active ORDER BY id LOOP
    PERFORM app_private.ensure_internal_card_color(u.id,NULL);
  END LOOP;
END $$;

NOTIFY pgrst,'reload schema';
COMMIT;
