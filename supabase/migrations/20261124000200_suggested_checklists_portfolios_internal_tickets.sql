-- M19 (24/11/2026): checklist solo sugerido (3 por fase), Portafolio (fase 1) y creación interna completa.
-- Requiere M18. Transaccional e idempotente. No modifica checklists, proyectos ni solicitudes existentes.
--
-- A. Checklist: `add_flows` deja de copiar plantillas a los proyectos nuevos (las tareas se SUGIEREN y se agregan
--    con una acción explícita). `checklist_templates` pasa a tener exactamente 3 tareas por fase real (8 Development,
--    7 Administrative), idénticas a src/lib/checklist-defaults.ts. Es catálogo de referencia: ningún checklist_item cambia.
-- B. Portafolio: `portfolios` (nivel superior, p. ej. «Gestión») e `portfolio_initiatives` (trabajo de largo alcance,
--    p. ej. «Beneficiarios finales»). `projects.portfolio_id` / `projects.initiative_id` opcionales (NULL en todo lo
--    existente). Lectura para el personal interno; escritura solo por RPC con auditoría en activity_logs.
-- C. `create_internal_ticket`: alta interna con dos modos. «client» registra una solicitud de un cliente con los mismos
--    datos que el portal (estudio, producto, subproyecto, tipo, prioridad solicitada) y la clasifica y aprueba en la
--    misma transacción reutilizando classify_request (regla de área solo para el código exacto PROCONT) y
--    approve_request. «internal» reutiliza create_internal_project. Ambos admiten Portafolio y fase inicial.
BEGIN;

DO $$ BEGIN
  IF to_regclass('public.checklist_templates') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='app_private'
                    AND table_name='internal_card_color_catalog' AND column_name='offered') THEN
    RAISE EXCEPTION 'M19 requires M18' USING ERRCODE='55000';
  END IF;
END $$;

-- ─── A. Checklist solo sugerido ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app_private.add_flows(p_project uuid,p_type text,p_dev uuid DEFAULT NULL,p_admin uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- Igual que antes, salvo que ya NO materializa las plantillas: el tablero las sugiere por fase.
  INSERT INTO public.project_flows(project_id,flow_type,assigned_to)
    SELECT p_project,ft,CASE ft WHEN 'development' THEN p_dev ELSE p_admin END
    FROM unnest(CASE p_type WHEN 'dual' THEN ARRAY['development','administrative'] ELSE ARRAY[p_type] END) ft
    ON CONFLICT (project_id,flow_type) DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION app_private.add_flows(uuid,text,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE TEMP TABLE m19_templates(flow_type text,phase text,order_index int,description text) ON COMMIT DROP;
INSERT INTO m19_templates VALUES
  ('development','backlog',0,'Definir requerimientos con el solicitante'),
  ('development','backlog',1,'Estimar horas de desarrollo'),
  ('development','backlog',2,'Priorizar en el sprint'),
  ('development','analysis',0,'Revisar el requerimiento y aclarar dudas con el solicitante'),
  ('development','analysis',1,'Identificar dependencias y sistemas afectados'),
  ('development','analysis',2,'Definir criterios de aceptación'),
  ('development','design',0,'Crear wireframes o mockups'),
  ('development','design',1,'Revisar diseño con el equipo'),
  ('development','design',2,'Aprobar diseño final'),
  ('development','dev',0,'Implementar la funcionalidad'),
  ('development','dev',1,'Pruebas unitarias'),
  ('development','dev',2,'Actualizar la documentación técnica'),
  ('development','code_review',0,'Revisar el diff y la lógica implementada'),
  ('development','code_review',1,'Validar estándares, seguridad y manejo de errores'),
  ('development','code_review',2,'Resolver las observaciones de la revisión'),
  ('development','testing',0,'Pruebas funcionales completas'),
  ('development','testing',1,'Pruebas de regresión'),
  ('development','testing',2,'Documentar resultados'),
  ('development','deploy',0,'Preparar release notes'),
  ('development','deploy',1,'Deploy a producción'),
  ('development','deploy',2,'Smoke test en producción'),
  ('development','done',0,'Notificar al solicitante'),
  ('development','done',1,'Confirmar la conformidad del solicitante'),
  ('development','done',2,'Cerrar el ticket'),
  ('administrative','backlog',0,'Revisar la solicitud'),
  ('administrative','backlog',1,'Definir alcance'),
  ('administrative','backlog',2,'Asignar responsable'),
  ('administrative','ready_to_start',0,'Confirmar recursos disponibles'),
  ('administrative','ready_to_start',1,'Notificar inicio al solicitante'),
  ('administrative','ready_to_start',2,'Acordar fechas objetivo'),
  ('administrative','discovery',0,'Levantar información del proceso'),
  ('administrative','discovery',1,'Identificar stakeholders'),
  ('administrative','discovery',2,'Documentar proceso actual (AS-IS)'),
  ('administrative','design',0,'Diseñar solución (TO-BE)'),
  ('administrative','design',1,'Validar con stakeholders'),
  ('administrative','design',2,'Aprobar diseño de la solución'),
  ('administrative','build',0,'Ejecutar plan de acción'),
  ('administrative','build',1,'Documentar avances'),
  ('administrative','build',2,'Validar avances con el solicitante'),
  ('administrative','uat_validation',0,'Pruebas con usuario final'),
  ('administrative','uat_validation',1,'Validar resultados con el solicitante'),
  ('administrative','uat_validation',2,'Obtener firma de conformidad'),
  ('administrative','deployed',0,'Entregar al usuario'),
  ('administrative','deployed',1,'Documentar solución final'),
  ('administrative','deployed',2,'Cerrar el ticket');
DELETE FROM public.checklist_templates t
 WHERE NOT EXISTS (SELECT 1 FROM m19_templates v WHERE v.flow_type=t.flow_type AND v.phase=t.phase AND v.order_index=t.order_index);
INSERT INTO public.checklist_templates(flow_type,phase,order_index,description)
  SELECT flow_type,phase,order_index,description FROM m19_templates
  ON CONFLICT (flow_type,phase,order_index) DO UPDATE SET description=EXCLUDED.description
  WHERE public.checklist_templates.description IS DISTINCT FROM EXCLUDED.description;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.checklist_templates) <> 45 OR EXISTS (
      SELECT 1 FROM public.checklist_templates GROUP BY flow_type,phase HAVING count(*) <> 3) THEN
    RAISE EXCEPTION 'M19 expects exactly 3 templates for each of the 15 real phases' USING ERRCODE='23514';
  END IF;
END $$;

-- ─── B. Portafolio (fase 1) ─────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.portfolios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  description text CHECK (description IS NULL OR length(description) <= 2000),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS portfolios_name_key ON public.portfolios (lower(btrim(name)));
CREATE TABLE IF NOT EXISTS public.portfolio_initiatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES public.portfolios(id),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 160),
  description text CHECK (description IS NULL OR length(description) <= 4000),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT portfolio_initiatives_id_portfolio_key UNIQUE (id, portfolio_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS portfolio_initiatives_name_key ON public.portfolio_initiatives (portfolio_id, lower(btrim(name)));
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS portfolio_id uuid;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS initiative_id uuid;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='projects_portfolio_fkey') THEN
    ALTER TABLE public.projects ADD CONSTRAINT projects_portfolio_fkey FOREIGN KEY (portfolio_id) REFERENCES public.portfolios(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='projects_initiative_fkey') THEN
    ALTER TABLE public.projects ADD CONSTRAINT projects_initiative_fkey FOREIGN KEY (initiative_id, portfolio_id)
      REFERENCES public.portfolio_initiatives(id, portfolio_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='projects_initiative_needs_portfolio') THEN
    ALTER TABLE public.projects ADD CONSTRAINT projects_initiative_needs_portfolio CHECK (initiative_id IS NULL OR portfolio_id IS NOT NULL);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS projects_portfolio_idx ON public.projects (portfolio_id, initiative_id);

ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_initiatives ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.portfolios, public.portfolio_initiatives FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.portfolios, public.portfolio_initiatives TO authenticated;
DROP POLICY IF EXISTS portfolios_internal_read ON public.portfolios;
CREATE POLICY portfolios_internal_read ON public.portfolios FOR SELECT TO authenticated
  USING ((SELECT app_private.has_role(ARRAY['superadmin','admin','developer','viewer'])));
DROP POLICY IF EXISTS portfolio_initiatives_internal_read ON public.portfolio_initiatives;
CREATE POLICY portfolio_initiatives_internal_read ON public.portfolio_initiatives FOR SELECT TO authenticated
  USING ((SELECT app_private.has_role(ARRAY['superadmin','admin','developer','viewer'])));

-- Valores iniciales pedidos por el usuario (catálogo, no datos de tickets).
INSERT INTO public.portfolios(name,description,sort_order)
  SELECT 'Gestión','Portafolio de iniciativas de gestión de largo alcance.',1
  WHERE NOT EXISTS (SELECT 1 FROM public.portfolios WHERE lower(btrim(name))='gestión');
INSERT INTO public.portfolio_initiatives(portfolio_id,name,description,sort_order)
  SELECT p.id,'Beneficiarios finales','Iniciativa de largo alcance; sus tickets del tablero se asocian aquí.',1
    FROM public.portfolios p WHERE lower(btrim(p.name))='gestión'
     AND NOT EXISTS (SELECT 1 FROM public.portfolio_initiatives i WHERE i.portfolio_id=p.id AND lower(btrim(i.name))='beneficiarios finales');

CREATE OR REPLACE FUNCTION public.save_portfolio(p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.portfolios; v_id uuid;
BEGIN
  PERFORM app_private.require_role(ARRAY['superadmin','admin']);
  PERFORM app_private.assert_payload(p_payload,ARRAY['id','name','description','is_active','sort_order']);
  IF nullif(btrim(p_payload->>'name'),'') IS NULL THEN RAISE EXCEPTION 'Nombre del portafolio requerido' USING ERRCODE='22023'; END IF;
  v_id:=nullif(p_payload->>'id','')::uuid;
  IF v_id IS NULL THEN
    INSERT INTO public.portfolios(name,description,is_active,sort_order)
      VALUES(btrim(p_payload->>'name'),nullif(btrim(p_payload->>'description'),''),coalesce((p_payload->>'is_active')::boolean,true),
        coalesce((p_payload->>'sort_order')::int,0)) RETURNING * INTO r;
  ELSE
    UPDATE public.portfolios SET name=btrim(p_payload->>'name'),description=nullif(btrim(p_payload->>'description'),''),
        is_active=coalesce((p_payload->>'is_active')::boolean,is_active),sort_order=coalesce((p_payload->>'sort_order')::int,sort_order),
        updated_at=clock_timestamp()
      WHERE id=v_id RETURNING * INTO r;
    IF NOT FOUND THEN RAISE EXCEPTION 'Portafolio no encontrado' USING ERRCODE='22023'; END IF;
  END IF;
  RETURN to_jsonb(r);
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'Ya existe un portafolio con ese nombre' USING ERRCODE='23505';
END $$;

CREATE OR REPLACE FUNCTION public.save_portfolio_initiative(p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.portfolio_initiatives; v_id uuid; v_portfolio uuid;
BEGIN
  PERFORM app_private.require_role(ARRAY['superadmin','admin']);
  PERFORM app_private.assert_payload(p_payload,ARRAY['id','portfolio_id','name','description','is_active','sort_order']);
  IF nullif(btrim(p_payload->>'name'),'') IS NULL THEN RAISE EXCEPTION 'Nombre de la iniciativa requerido' USING ERRCODE='22023'; END IF;
  v_id:=nullif(p_payload->>'id','')::uuid; v_portfolio:=nullif(p_payload->>'portfolio_id','')::uuid;
  IF v_id IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.portfolios WHERE id=v_portfolio AND is_active) THEN
      RAISE EXCEPTION 'Portafolio activo requerido' USING ERRCODE='22023'; END IF;
    INSERT INTO public.portfolio_initiatives(portfolio_id,name,description,is_active,sort_order)
      VALUES(v_portfolio,btrim(p_payload->>'name'),nullif(btrim(p_payload->>'description'),''),
        coalesce((p_payload->>'is_active')::boolean,true),coalesce((p_payload->>'sort_order')::int,0)) RETURNING * INTO r;
  ELSE
    -- La iniciativa no cambia de portafolio: sus tickets quedarían incoherentes.
    UPDATE public.portfolio_initiatives SET name=btrim(p_payload->>'name'),description=nullif(btrim(p_payload->>'description'),''),
        is_active=coalesce((p_payload->>'is_active')::boolean,is_active),sort_order=coalesce((p_payload->>'sort_order')::int,sort_order),
        updated_at=clock_timestamp()
      WHERE id=v_id AND (v_portfolio IS NULL OR portfolio_id=v_portfolio) RETURNING * INTO r;
    IF NOT FOUND THEN RAISE EXCEPTION 'Iniciativa no encontrada en ese portafolio' USING ERRCODE='22023'; END IF;
  END IF;
  RETURN to_jsonb(r);
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'Ya existe una iniciativa con ese nombre en el portafolio' USING ERRCODE='23505';
END $$;

CREATE OR REPLACE FUNCTION public.set_project_portfolio(p_project_id uuid,p_portfolio_id uuid,p_initiative_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE p public.projects; v_portfolio uuid:=p_portfolio_id;
BEGIN
  PERFORM app_private.require_role(ARRAY['superadmin','admin','developer']);
  SELECT * INTO p FROM public.projects WHERE id=p_project_id AND status<>'deleted' FOR UPDATE;
  IF NOT FOUND OR NOT app_private.can_read_project(p_project_id) THEN RAISE EXCEPTION 'Proyecto no encontrado' USING ERRCODE='22023'; END IF;
  IF p_initiative_id IS NOT NULL THEN
    SELECT portfolio_id INTO v_portfolio FROM public.portfolio_initiatives
      WHERE id=p_initiative_id AND (is_active OR id IS NOT DISTINCT FROM p.initiative_id);
    IF NOT FOUND OR (p_portfolio_id IS NOT NULL AND p_portfolio_id<>v_portfolio) THEN
      RAISE EXCEPTION 'La iniciativa no pertenece al portafolio indicado' USING ERRCODE='22023'; END IF;
  END IF;
  IF v_portfolio IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.portfolios
      WHERE id=v_portfolio AND (is_active OR id IS NOT DISTINCT FROM p.portfolio_id)) THEN
    RAISE EXCEPTION 'Portafolio activo requerido' USING ERRCODE='22023'; END IF;
  IF ROW(v_portfolio,p_initiative_id) IS DISTINCT FROM ROW(p.portfolio_id,p.initiative_id) THEN
    UPDATE public.projects SET portfolio_id=v_portfolio,initiative_id=p_initiative_id,updated_at=now() WHERE id=p.id;
    INSERT INTO public.activity_logs(project_id,user_id,action,details)
      VALUES(p.id,auth.uid(),'portfolio_changed',jsonb_build_object('from',jsonb_build_object('portfolio_id',p.portfolio_id,'initiative_id',p.initiative_id),
        'to',jsonb_build_object('portfolio_id',v_portfolio,'initiative_id',p_initiative_id)));
  END IF;
  RETURN jsonb_build_object('project_id',p.id,'portfolio_id',v_portfolio,'initiative_id',p_initiative_id);
END $$;

-- ─── C. Creación interna con paridad funcional ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_internal_ticket(p_payload jsonb,p_idempotency_key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb; mode text; proj jsonb; pid uuid; flow uuid; phase text; st public.studios; sy public.catalog_systems;
  rt public.request_types; r public.requests; v_sub uuid; v_prio text;
  k_sub uuid:=md5(p_idempotency_key::text||':create')::uuid; k_move uuid:=md5(p_idempotency_key::text||':move')::uuid;
BEGIN
  PERFORM app_private.require_role(ARRAY['superadmin','admin']);
  PERFORM app_private.assert_payload(p_payload,ARRAY['mode','title','description','priority','assigned_dev','start_date','due_date',
    'requester_name','requester_email','portfolio_id','initiative_id','initial_phase',
    'studio_id','studio_code_id','system_id','subsystem_id','request_type_id','requested_priority','area_id','subarea_id']);
  IF p_idempotency_key IS NULL THEN RAISE EXCEPTION 'Idempotency key required' USING ERRCODE='22023'; END IF;
  result:=app_private.replay('create_internal_ticket',p_idempotency_key,p_payload);
  IF result IS NOT NULL THEN RETURN result; END IF;
  mode:=coalesce(p_payload->>'mode','internal');
  phase:=nullif(p_payload->>'initial_phase','');
  IF phase IS NOT NULL AND (NOT app_private.valid_phase('development',phase) OR phase='done') THEN
    RAISE EXCEPTION 'Fase inicial inválida' USING ERRCODE='22023'; END IF;
  IF nullif(btrim(p_payload->>'title'),'') IS NULL OR nullif(btrim(p_payload->>'description'),'') IS NULL THEN
    RAISE EXCEPTION 'Título y descripción requeridos' USING ERRCODE='22023'; END IF;

  IF mode='internal' THEN
    IF (SELECT bool_or(p_payload ? k) FROM unnest(ARRAY['studio_id','studio_code_id','system_id','subsystem_id','request_type_id',
        'requested_priority','area_id','subarea_id']) k) THEN
      RAISE EXCEPTION 'Los datos de cliente solo aplican al modo cliente' USING ERRCODE='22023'; END IF;
    proj:=public.create_internal_project(jsonb_build_object('title',p_payload->>'title','description',p_payload->>'description',
      'project_type','development','priority',coalesce(p_payload->>'priority','medium'),'start_date',p_payload->>'start_date',
      'due_date',p_payload->>'due_date','requester_name',p_payload->>'requester_name','assigned_dev',p_payload->>'assigned_dev'),k_sub);
  ELSIF mode='client' THEN
    SELECT * INTO st FROM public.studios WHERE id=nullif(p_payload->>'studio_id','')::uuid AND is_active;
    IF NOT FOUND THEN RAISE EXCEPTION 'Estudio activo requerido' USING ERRCODE='22023'; END IF;
    SELECT * INTO sy FROM public.catalog_systems WHERE id=nullif(p_payload->>'system_id','')::uuid AND is_active;
    IF NOT FOUND THEN RAISE EXCEPTION 'Producto activo requerido' USING ERRCODE='22023'; END IF;
    v_sub:=nullif(p_payload->>'subsystem_id','')::uuid;
    IF v_sub IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.catalog_subsystems WHERE id=v_sub AND system_id=sy.id AND is_active) THEN
      RAISE EXCEPTION 'Subproyecto inválido' USING ERRCODE='22023'; END IF;
    IF v_sub IS NULL AND sy.requires_subproject AND EXISTS(SELECT 1 FROM public.catalog_subsystems WHERE system_id=sy.id AND is_active) THEN
      RAISE EXCEPTION 'Subproyecto requerido' USING ERRCODE='22023'; END IF;
    SELECT * INTO rt FROM public.request_types WHERE id=nullif(p_payload->>'request_type_id','')::uuid AND is_active;
    IF NOT FOUND THEN RAISE EXCEPTION 'Tipo de solicitud activo requerido' USING ERRCODE='22023'; END IF;
    IF nullif(btrim(p_payload->>'requester_name'),'') IS NULL THEN RAISE EXCEPTION 'Solicitante requerido' USING ERRCODE='22023'; END IF;
    v_prio:=coalesce(nullif(p_payload->>'requested_priority',''),'medium');
    IF v_prio NOT IN ('low','medium','high','urgent') THEN RAISE EXCEPTION 'Prioridad solicitada inválida' USING ERRCODE='22023'; END IF;
    -- Misma forma que una solicitud del portal, registrada por TI (origen «Cliente»).
    INSERT INTO public.requests(requester_name,requester_email,requester_area,request_type,request_type_id,title,description,origin,
        needs_code,studio_id,system_id,subsystem_id,requested_subsystem_id,requested_priority,request_date)
      VALUES(btrim(p_payload->>'requester_name'),nullif(btrim(p_payload->>'requester_email'),''),NULL,rt.name,rt.id,btrim(p_payload->>'title'),
        btrim(p_payload->>'description'),'Cliente',false,st.id,sy.id,v_sub,v_sub,v_prio,current_date) RETURNING * INTO r;
    INSERT INTO app_private.request_access(request_id) VALUES(r.id);   -- el evento «submitted» lo registra el trigger existente
    -- Clasificación con la regla vigente (área solo para el código exacto PROCONT) y aprobación en la misma transacción.
    PERFORM public.classify_request(r.id,jsonb_build_object('studio_code_id',p_payload->>'studio_code_id','subsystem_id',v_sub,
      'area_id',nullif(p_payload->>'area_id',''),'subarea_id',nullif(p_payload->>'subarea_id','')));
    proj:=public.approve_request(r.id,jsonb_build_object('title',btrim(p_payload->>'title'),'project_type','development',
      'priority',coalesce(p_payload->>'priority','medium'),'start_date',p_payload->>'start_date','due_date',p_payload->>'due_date',
      'assigned_dev',p_payload->>'assigned_dev'),k_sub);
  ELSE
    RAISE EXCEPTION 'Modo inválido' USING ERRCODE='22023';
  END IF;

  pid:=(proj->>'id')::uuid;
  IF nullif(p_payload->>'portfolio_id','') IS NOT NULL OR nullif(p_payload->>'initiative_id','') IS NOT NULL THEN
    PERFORM public.set_project_portfolio(pid,nullif(p_payload->>'portfolio_id','')::uuid,nullif(p_payload->>'initiative_id','')::uuid);
  END IF;
  IF phase IS NOT NULL AND phase<>'backlog' THEN
    SELECT id INTO flow FROM public.project_flows WHERE project_id=pid AND flow_type='development';
    PERFORM public.operate_board_ticket(pid,'move_phase',jsonb_build_object('flow_id',flow,'to_phase',phase),k_move);
  END IF;
  SELECT jsonb_build_object('project',to_jsonb(p),'request_number',q.request_number,'request_id',q.id) INTO result
    FROM public.projects p JOIN public.requests q ON q.id=p.request_id WHERE p.id=pid;
  RETURN app_private.remember('create_internal_ticket',p_idempotency_key,p_payload,result);
END $$;

REVOKE ALL ON FUNCTION public.save_portfolio(jsonb), public.save_portfolio_initiative(jsonb),
  public.set_project_portfolio(uuid,uuid,uuid), public.create_internal_ticket(jsonb,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_portfolio(jsonb), public.save_portfolio_initiative(jsonb),
  public.set_project_portfolio(uuid,uuid,uuid), public.create_internal_ticket(jsonb,uuid) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
