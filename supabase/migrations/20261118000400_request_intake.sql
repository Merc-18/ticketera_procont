-- Formulario de cliente y validación interna definitivos (aprobados 18/11/2026).
-- El cliente envía: nombre, estudio, proyecto, tipo, título, descripción, evidencias y
-- urgencia solicitada. La clasificación interna (código de estudio, subproyecto, área,
-- subárea), la prioridad, el responsable y el SLA se fijan al validar.
-- No se incorporan plazos ni fórmulas SLA heredados. Las siete migraciones no cambian.
BEGIN;

-- ─── Tipos de solicitud (catálogo administrable por superadmin) ────────────────
CREATE TABLE public.request_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (name = btrim(name) AND length(name) BETWEEN 1 AND 200),
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX request_types_name_idx ON public.request_types (lower(name));
CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.request_types
  FOR EACH ROW EXECUTE FUNCTION app_private.touch_updated_at();
ALTER TABLE public.request_types ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.request_types FROM PUBLIC, anon, authenticated, service_role;
CREATE POLICY public_read_active ON public.request_types FOR SELECT TO anon USING (is_active);
CREATE POLICY member_read_active ON public.request_types FOR SELECT TO authenticated
  USING (is_active AND (SELECT app_private.has_role(ARRAY['superadmin','admin','developer','viewer'])));
CREATE POLICY superadmin_read ON public.request_types FOR SELECT TO authenticated
  USING ((SELECT app_private.has_role(ARRAY['superadmin'])));
CREATE POLICY superadmin_insert ON public.request_types FOR INSERT TO authenticated
  WITH CHECK ((SELECT app_private.has_role(ARRAY['superadmin'])));
CREATE POLICY superadmin_update ON public.request_types FOR UPDATE TO authenticated
  USING ((SELECT app_private.has_role(ARRAY['superadmin'])))
  WITH CHECK ((SELECT app_private.has_role(ARRAY['superadmin'])));
GRANT SELECT (id, name, sort_order, is_active) ON public.request_types TO anon;
GRANT SELECT ON public.request_types TO authenticated;
GRANT INSERT (name, sort_order, is_active), UPDATE (name, sort_order, is_active) ON public.request_types TO authenticated;

INSERT INTO public.request_types (name, sort_order) VALUES
  ('Error / Incidencia', 1), ('Nueva funcionalidad', 2), ('Mejora', 3), ('Soporte técnico', 4),
  ('Acceso / Permisos', 5), ('Reporte / Extracción', 6), ('Integración / Automatización', 7),
  ('Capacitación / Consulta', 8), ('Otros', 9);

-- ─── Datos originales del cliente ──────────────────────────────────────────────
ALTER TABLE public.requests
  ADD COLUMN request_type_id uuid REFERENCES public.request_types(id),
  ADD COLUMN title text CHECK (title IS NULL OR (title = btrim(title) AND length(title) BETWEEN 1 AND 300)),
  ADD COLUMN urgent_requested boolean NOT NULL DEFAULT false;

-- ─── Trazabilidad de solicitudes ───────────────────────────────────────────────
CREATE TABLE public.request_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES public.requests(id),
  actor_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('submitted','classified','approved','rejected','requester_corrected')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX request_events_request_idx ON public.request_events (request_id, created_at);
ALTER TABLE public.request_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.request_events FROM PUBLIC, anon, authenticated, service_role;
CREATE POLICY member_read ON public.request_events FOR SELECT TO authenticated
  USING ((SELECT app_private.has_role(ARRAY['superadmin','admin','developer','viewer'])));
GRANT SELECT ON public.request_events TO authenticated;   -- escritura solo por funciones/triggers

-- ─── Reglas de clasificación y decisión (reemplaza la versión de 20261118000300) ─
CREATE OR REPLACE FUNCTION app_private.guard_request_classification() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE sys public.catalog_systems;
BEGIN
  -- Datos de origen del cliente: inmutables.
  IF (OLD.studio_id IS NOT NULL AND NEW.studio_id IS DISTINCT FROM OLD.studio_id)
     OR (OLD.system_id IS NOT NULL AND NEW.system_id IS DISTINCT FROM OLD.system_id)
     OR (OLD.request_type_id IS NOT NULL AND ROW(NEW.request_type_id, NEW.title, NEW.description, NEW.urgent_requested)
          IS DISTINCT FROM ROW(OLD.request_type_id, OLD.title, OLD.description, OLD.urgent_requested)) THEN
    RAISE EXCEPTION 'La información original de la solicitud no se modifica' USING ERRCODE='23514';
  END IF;
  -- Clasificación interna: editable solo mientras está pendiente.
  IF ROW(NEW.studio_code_id, NEW.subsystem_id, NEW.area_id, NEW.subarea_id)
       IS DISTINCT FROM ROW(OLD.studio_code_id, OLD.subsystem_id, OLD.area_id, OLD.subarea_id)
     AND OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'La clasificación se fija con la decisión' USING ERRCODE='23514';
  END IF;
  -- Requisitos para decidir.
  IF OLD.status = 'pending' AND NEW.status <> 'pending' AND NEW.studio_id IS NOT NULL THEN
    IF NEW.studio_code_id IS NULL THEN
      RAISE EXCEPTION 'Asignar el código interno del estudio antes de aceptar o rechazar' USING ERRCODE='23514';
    END IF;
    IF NEW.status = 'approved' THEN
      IF NEW.area_id IS NULL AND EXISTS (SELECT 1 FROM public.areas
           WHERE studio_id = NEW.studio_id AND parent_id IS NULL AND is_active) THEN
        RAISE EXCEPTION 'Área requerida para aceptar solicitudes de este estudio' USING ERRCODE='23514';
      END IF;
      SELECT * INTO sys FROM public.catalog_systems WHERE id = NEW.system_id;
      IF NEW.subsystem_id IS NULL AND sys.requires_subproject AND EXISTS (SELECT 1 FROM public.catalog_subsystems
           WHERE system_id = NEW.system_id AND is_active) THEN
        RAISE EXCEPTION 'Subproyecto requerido para aceptar' USING ERRCODE='23514';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION app_private.log_request_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.request_events(request_id, actor_id, action, details)
      VALUES (NEW.id, auth.uid(), 'submitted', jsonb_build_object('request_number', NEW.request_number));
  ELSIF OLD.status = 'pending' AND NEW.status IN ('approved','rejected') THEN
    INSERT INTO public.request_events(request_id, actor_id, action, details)
      VALUES (NEW.id, auth.uid(), NEW.status, jsonb_build_object('studio_code_id', NEW.studio_code_id,
        'subsystem_id', NEW.subsystem_id, 'area_id', NEW.area_id, 'subarea_id', NEW.subarea_id,
        'project_id', NEW.project_id, 'rejection_reason', NEW.rejection_reason));
  ELSIF ROW(NEW.requester_name, NEW.requester_area) IS DISTINCT FROM ROW(OLD.requester_name, OLD.requester_area)
        AND NEW.classified_at IS NOT DISTINCT FROM OLD.classified_at THEN  -- la clasificación ya se registra aparte
    INSERT INTO public.request_events(request_id, actor_id, action, details)
      VALUES (NEW.id, auth.uid(), 'requester_corrected', jsonb_build_object(
        'previous_requester_name', OLD.requester_name, 'previous_requester_area', OLD.requester_area));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER log_request_event AFTER INSERT OR UPDATE ON public.requests
  FOR EACH ROW EXECUTE FUNCTION app_private.log_request_event();

-- ─── Envío del cliente ─────────────────────────────────────────────────────────
CREATE FUNCTION public.submit_client_request(p_payload jsonb, p_idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb; st public.studios; sy public.catalog_systems; rt public.request_types;
  r public.requests; token uuid;
BEGIN
  PERFORM app_private.assert_payload(p_payload, ARRAY['requester_name','studio_id','system_id',
    'request_type_id','title','description','urgent_requested']);
  result := app_private.replay('submit_client_request', p_idempotency_key, p_payload);
  IF result IS NOT NULL THEN RETURN result; END IF;
  SELECT * INTO st FROM public.studios WHERE id = nullif(p_payload->>'studio_id','')::uuid AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Estudio activo requerido' USING ERRCODE='22023'; END IF;
  SELECT * INTO sy FROM public.catalog_systems WHERE id = nullif(p_payload->>'system_id','')::uuid AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proyecto activo requerido' USING ERRCODE='22023'; END IF;
  SELECT * INTO rt FROM public.request_types WHERE id = nullif(p_payload->>'request_type_id','')::uuid AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tipo de solicitud activo requerido' USING ERRCODE='22023'; END IF;
  IF nullif(btrim(p_payload->>'title'),'') IS NULL OR nullif(btrim(p_payload->>'description'),'') IS NULL
     OR nullif(btrim(p_payload->>'requester_name'),'') IS NULL THEN
    RAISE EXCEPTION 'Nombre, título y descripción requeridos' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.requests(requester_name, requester_area, request_type, request_type_id, title, description,
      urgent_requested, studio_id, system_id, request_date)
    VALUES (btrim(p_payload->>'requester_name'), NULL, rt.name, rt.id, btrim(p_payload->>'title'),
      btrim(p_payload->>'description'), coalesce((p_payload->>'urgent_requested')::boolean, false),
      st.id, sy.id, (now() AT TIME ZONE 'America/Lima')::date)
    RETURNING * INTO r;
  INSERT INTO app_private.request_access(request_id) VALUES (r.id) RETURNING tracking_token INTO token;
  result := jsonb_build_object('id', r.id, 'request_number', r.request_number, 'tracking_token', token);
  RETURN app_private.remember('submit_client_request', p_idempotency_key, p_payload, result);
END $$;

-- ─── Clasificación interna (validador) ─────────────────────────────────────────
CREATE FUNCTION public.classify_request(p_request_id uuid, p_classification jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.requests; v_code uuid; v_sub uuid; v_area uuid; v_subarea uuid; has_areas boolean;
BEGIN
  PERFORM app_private.require_role(ARRAY['superadmin','admin']);
  PERFORM app_private.assert_payload(p_classification, ARRAY['studio_code_id','subsystem_id','area_id','subarea_id']);
  SELECT * INTO r FROM public.requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR r.status <> 'pending' OR r.studio_id IS NULL THEN
    RAISE EXCEPTION 'Solicitud pendiente con estudio requerida' USING ERRCODE='23514';
  END IF;
  v_code := nullif(p_classification->>'studio_code_id','')::uuid;
  v_sub := nullif(p_classification->>'subsystem_id','')::uuid;
  v_area := nullif(p_classification->>'area_id','')::uuid;
  v_subarea := nullif(p_classification->>'subarea_id','')::uuid;
  IF v_code IS NULL OR NOT EXISTS (SELECT 1 FROM public.studio_codes WHERE id = v_code AND studio_id = r.studio_id AND is_active) THEN
    RAISE EXCEPTION 'El código no corresponde al estudio de la solicitud' USING ERRCODE='22023';
  END IF;
  IF v_sub IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.catalog_subsystems
       WHERE id = v_sub AND system_id = r.system_id AND is_active) THEN
    RAISE EXCEPTION 'Subproyecto inválido para el proyecto' USING ERRCODE='22023';
  END IF;
  has_areas := EXISTS (SELECT 1 FROM public.areas WHERE studio_id = r.studio_id AND parent_id IS NULL AND is_active);
  IF NOT has_areas AND (v_area IS NOT NULL OR v_subarea IS NOT NULL) THEN
    RAISE EXCEPTION 'Área no aplicable a este estudio' USING ERRCODE='22023';
  END IF;
  IF v_area IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.areas
       WHERE id = v_area AND studio_id = r.studio_id AND parent_id IS NULL AND is_active) THEN
    RAISE EXCEPTION 'Área inválida' USING ERRCODE='22023';
  END IF;
  IF v_subarea IS NOT NULL AND (v_area IS NULL OR NOT EXISTS (SELECT 1 FROM public.areas
       WHERE id = v_subarea AND parent_id = v_area AND is_active)) THEN
    RAISE EXCEPTION 'Subárea inválida' USING ERRCODE='22023';
  END IF;
  UPDATE public.requests SET studio_code_id = v_code, subsystem_id = v_sub, area_id = v_area, subarea_id = v_subarea,
      requester_area = CASE WHEN v_area IS NULL THEN requester_area ELSE (SELECT name FROM public.areas WHERE id = v_area) END,
      classified_by = auth.uid(), classified_at = now()
    WHERE id = r.id;
  INSERT INTO public.request_events(request_id, actor_id, action, details)
    VALUES (r.id, auth.uid(), 'classified', p_classification);
END $$;

-- ─── Seguimiento público: solo estado, sin SLA ni clasificación interna ─────────
CREATE OR REPLACE FUNCTION public.track_request(p_request_number text, p_tracking_token uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object('request_number', r.request_number, 'status', r.status, 'created_at', r.created_at,
    'title', r.title, 'rejection_reason', r.rejection_reason)
  FROM public.requests r JOIN app_private.request_access a ON a.request_id = r.id
  WHERE r.request_number = p_request_number AND a.tracking_token = p_tracking_token;
$$;

-- ─── Evidencias: bucket privado; el cliente adjunta solo a su solicitud recién creada ─
CREATE FUNCTION public.request_attachment_allowed(p_name text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE parts text[] := string_to_array(p_name, '/'); rid uuid;
BEGIN
  IF array_length(parts, 1) <> 2 OR parts[1] !~ '^[0-9a-f-]{36}$' OR length(parts[2]) NOT BETWEEN 1 AND 200 THEN
    RETURN false;
  END IF;
  rid := parts[1]::uuid;
  RETURN EXISTS (SELECT 1 FROM public.requests WHERE id = rid AND status = 'pending'
                   AND request_type_id IS NOT NULL AND created_at > now() - interval '30 minutes')
     AND (SELECT count(*) FROM storage.objects WHERE bucket_id = 'request-attachments' AND name LIKE rid::text || '/%') < 5;
END $$;

DO $$ BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('request-attachments', 'request-attachments', false, 10485760, ARRAY[
      'image/png','image/jpeg','image/webp','image/gif','application/pdf','text/plain','text/csv',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel','application/msword'])
    ON CONFLICT (id) DO NOTHING;
    CREATE POLICY procont_request_attachments_insert ON storage.objects FOR INSERT TO anon, authenticated
      WITH CHECK (bucket_id = 'request-attachments' AND public.request_attachment_allowed(name));
    CREATE POLICY procont_request_attachments_read ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id = 'request-attachments'
             AND (SELECT app_private.has_role(ARRAY['superadmin','admin','developer','viewer'])));
  END IF;
END $$;

-- ─── Permisos de funciones ─────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.submit_client_request(jsonb,uuid), public.classify_request(uuid,jsonb),
  public.request_attachment_allowed(text), app_private.log_request_event()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_client_request(jsonb,uuid), public.request_attachment_allowed(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.classify_request(uuid,jsonb) TO authenticated;
-- Un único contrato público: los envíos anónimos anteriores dejan de estar expuestos.
-- submit_request sigue disponible para usuarios internos (importador Planner).
REVOKE EXECUTE ON FUNCTION public.submit_request(jsonb,uuid), public.submit_classified_request(jsonb,jsonb,uuid) FROM anon;

NOTIFY pgrst, 'reload schema';
COMMIT;
