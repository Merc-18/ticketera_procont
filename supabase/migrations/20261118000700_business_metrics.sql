-- Reglas y métricas aprobadas: sin plazos SLA nuevos ni cambios de tickets existentes.
-- M11, pendiente de autorización remota. Reutiliza eventos confiables de M10.
BEGIN;

-- Normalización SOLO para comparación. El valor original se conserva al guardar.
-- NFKC, espacios Unicode/ASCII colapsados, extremos eliminados y minúsculas.
-- No elimina tildes ni hace coincidencias difusas.
CREATE FUNCTION app_private.normalize_requester_name(p_name text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT SET search_path = '' AS $$
  SELECT nullif(lower(btrim(regexp_replace(normalize(p_name, NFKC),
    U&'[[:space:]\200B\FEFF]+', ' ', 'g'))), '');
$$;

-- También cubre los puntos de entrada públicos anteriores, sin validar ni
-- modificar filas preexistentes. Los proyectos internos INT conservan su contrato.
CREATE FUNCTION app_private.require_public_requester_name() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.number_series = 'REQ' AND app_private.normalize_requester_name(NEW.requester_name) IS NULL THEN
    RAISE EXCEPTION 'Nombre del solicitante requerido' USING ERRCODE='22023';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER require_public_requester_name BEFORE INSERT ON public.requests
  FOR EACH ROW EXECUTE FUNCTION app_private.require_public_requester_name();

CREATE OR REPLACE FUNCTION public.submit_client_request(p_payload jsonb, p_idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb; st public.studios; sy public.catalog_systems; rt public.request_types;
  r public.requests; token uuid;
BEGIN
  PERFORM app_private.assert_payload(p_payload, ARRAY['requester_name','studio_id','system_id',
    'request_type_id','title','description','urgent_requested']);
  IF jsonb_typeof(p_payload->'requester_name') IS DISTINCT FROM 'string'
     OR app_private.normalize_requester_name(p_payload->>'requester_name') IS NULL THEN
    RAISE EXCEPTION 'Nombre del solicitante requerido' USING ERRCODE='22023';
  END IF;
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
    VALUES (p_payload->>'requester_name', NULL, rt.name, rt.id, btrim(p_payload->>'title'),
      btrim(p_payload->>'description'), coalesce((p_payload->>'urgent_requested')::boolean, false),
      st.id, sy.id, (now() AT TIME ZONE 'America/Lima')::date)
    RETURNING * INTO r;
  INSERT INTO app_private.request_access(request_id) VALUES (r.id) RETURNING tracking_token INTO token;
  result := jsonb_build_object('id', r.id, 'request_number', r.request_number, 'tracking_token', token);
  RETURN app_private.remember('submit_client_request', p_idempotency_key, p_payload, result);
END $$;

-- Serializa fases de flujos hermanos ANTES de modificarlas: evita perder el
-- último estado done cuando dos flujos terminan en transacciones concurrentes.
CREATE FUNCTION app_private.lock_flow_project_metrics() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM 1 FROM public.projects WHERE id = NEW.project_id FOR NO KEY UPDATE;
  RETURN NEW;
END $$;
CREATE TRIGGER serialize_flow_metrics BEFORE INSERT OR UPDATE OF current_phase ON public.project_flows
  FOR EACH ROW EXECUTE FUNCTION app_private.lock_flow_project_metrics();

-- Mantiene los contratos/eventos de M10. El reloj de eventos nuevos corresponde
-- al cambio efectivo, no al comienzo de una transacción que pudo esperar locks.
CREATE OR REPLACE FUNCTION app_private.sync_request_status(p_request_id uuid, p_cause jsonb DEFAULT '{}'::jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE current_status text; last_status text;
BEGIN
  IF p_request_id IS NULL THEN RETURN; END IF;
  PERFORM 1 FROM public.projects WHERE request_id = p_request_id FOR NO KEY UPDATE;
  current_status := app_private.request_general_status(p_request_id);
  SELECT details->>'to' INTO last_status FROM public.request_events
   WHERE request_id = p_request_id AND action = 'status_changed' ORDER BY id DESC LIMIT 1;
  IF current_status IS DISTINCT FROM last_status THEN
    INSERT INTO public.request_events(request_id, actor_id, action, details, created_at)
      VALUES (p_request_id, auth.uid(), 'status_changed',
              jsonb_build_object('from', last_status, 'to', current_status) || coalesce(p_cause, '{}'::jsonb), clock_timestamp());
  END IF;
END $$;

CREATE OR REPLACE FUNCTION app_private.trg_flow_phase() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE rid uuid;
BEGIN
  SELECT request_id INTO rid FROM public.projects WHERE id = NEW.project_id;
  IF TG_OP = 'UPDATE' AND NEW.current_phase IS DISTINCT FROM OLD.current_phase THEN
    INSERT INTO public.request_events(request_id, actor_id, action, details, created_at)
      VALUES (rid, auth.uid(), 'phase_changed', jsonb_build_object('project_id', NEW.project_id,
        'flow_type', NEW.flow_type, 'from', OLD.current_phase, 'to', NEW.current_phase), clock_timestamp());
  END IF;
  PERFORM app_private.sync_request_status(rid, jsonb_build_object('cause', 'phase', 'flow_type', NEW.flow_type,
    'phase', NEW.current_phase));
  RETURN NULL;
END $$;

-- Una fila por solicitud, nunca una suma de flujos ni un cálculo con SLA.
-- No reconstruye fechas históricas a partir de updated_at ni eventos baseline.
CREATE FUNCTION app_private.ticket_performance(p_studio_id uuid)
RETURNS TABLE (
  request_id uuid, request_number text, project_id uuid, studio_id uuid,
  general_status text, first_started_at timestamptz, completed_at timestamptz,
  cycle_time_seconds numeric, lead_time_seconds numeric, metric_status text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH events AS (
    SELECT r.id AS request_id, r.request_number, p.id AS project_id, r.studio_id,
      r.created_at AS requested_at, app_private.request_general_status(r.id) AS general_status,
      started.created_at AS first_started_at,
      CASE WHEN finished.details->>'to' = 'done'
             AND finished.details->>'cause' IS DISTINCT FROM 'baseline'
           THEN finished.created_at END AS recorded_completion
    FROM public.requests r LEFT JOIN public.projects p ON p.id = r.project_id
    LEFT JOIN LATERAL (
      SELECT e.created_at FROM public.request_events e
      WHERE e.request_id = r.id AND e.action = 'phase_changed'
        AND e.details->>'project_id' = p.id::text AND e.details->>'from' = 'backlog'
        AND e.details->>'to' IS NOT NULL AND e.details->>'to' <> 'backlog'
      ORDER BY e.id LIMIT 1
    ) started ON true
    LEFT JOIN LATERAL (
      SELECT e.created_at, e.details FROM public.request_events e
      WHERE e.request_id = r.id AND e.action = 'status_changed'
      ORDER BY e.id DESC LIMIT 1
    ) finished ON true
    WHERE (p_studio_id IS NULL OR r.studio_id = p_studio_id)
      AND (p.id IS NULL OR p.status <> 'deleted')
  ), times AS (
    SELECT *, CASE WHEN general_status = 'done' THEN recorded_completion END AS completed_at
    FROM events
  )
  SELECT request_id, request_number, project_id, studio_id, general_status, first_started_at, completed_at,
    CASE WHEN completed_at >= first_started_at AND first_started_at >= requested_at
         THEN extract(epoch FROM completed_at - first_started_at) END AS cycle_time_seconds,
    CASE WHEN completed_at >= requested_at
         THEN extract(epoch FROM completed_at - requested_at) END AS lead_time_seconds,
    CASE WHEN general_status <> 'done' THEN 'not_completed'
         WHEN completed_at IS NULL THEN 'missing_completion'
         WHEN completed_at < requested_at OR first_started_at < requested_at
              OR first_started_at > completed_at THEN 'invalid_timeline'
         WHEN first_started_at IS NULL THEN 'missing_start'
         ELSE 'complete' END AS metric_status
  FROM times;
$$;

CREATE FUNCTION public.get_ticket_performance(p_studio_id uuid DEFAULT NULL)
RETURNS TABLE (
  request_id uuid, request_number text, project_id uuid, studio_id uuid,
  general_status text, first_started_at timestamptz, completed_at timestamptz,
  cycle_time_seconds numeric, lead_time_seconds numeric, metric_status text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app_private.require_role(ARRAY['superadmin','admin','developer','viewer']);
  RETURN QUERY SELECT * FROM app_private.ticket_performance(p_studio_id);
END $$;

CREATE FUNCTION public.get_ticket_performance_summary(p_studio_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
  PERFORM app_private.require_role(ARRAY['superadmin','admin','developer','viewer']);
  SELECT jsonb_build_object(
    'unit', 'seconds', 'calendar', 'elapsed',
    'total_tickets', count(*),
    'completed_tickets', count(*) FILTER (WHERE general_status = 'done'),
    'cycle_sample_size', count(cycle_time_seconds), 'lead_sample_size', count(lead_time_seconds),
    'avg_cycle_time_seconds', avg(cycle_time_seconds),
    'avg_lead_time_seconds', avg(lead_time_seconds),
    'incomplete_completed_tickets', count(*) FILTER (WHERE general_status = 'done' AND metric_status <> 'complete')
  ) INTO result FROM app_private.ticket_performance(p_studio_id);
  RETURN result;
END $$;

-- Identidad estadística = estudio canónico UUID + nombre normalizado.
-- Incluye pendientes/aceptadas/rechazadas. No infiere urgencia de la prioridad.
CREATE FUNCTION public.get_requester_urgency_month(p_month date DEFAULT NULL, p_studio_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE month_start date; result jsonb;
BEGIN
  PERFORM app_private.require_role(ARRAY['superadmin','admin']);
  month_start := date_trunc('month', coalesce(p_month,
    (current_timestamp AT TIME ZONE 'America/Lima')::date)::timestamp)::date;
  WITH monthly AS MATERIALIZED (
    SELECT r.id, r.studio_id, r.requester_name, r.created_at, r.urgent_requested,
      app_private.normalize_requester_name(r.requester_name) AS requester_key
    FROM public.requests r
    WHERE r.number_series = 'REQ'
      AND r.created_at >= (month_start::timestamp AT TIME ZONE 'America/Lima')
      AND r.created_at < ((month_start::timestamp + interval '1 month') AT TIME ZONE 'America/Lima')
      AND (p_studio_id IS NULL OR r.studio_id = p_studio_id)
  ), grouped AS (
    SELECT studio_id, requester_key,
      (array_agg(requester_name ORDER BY created_at DESC, id DESC))[1] AS requester_name,
      count(*) AS total_requests, count(*) FILTER (WHERE urgent_requested) AS urgent_requests,
      round(100.0 * count(*) FILTER (WHERE urgent_requested) / count(*), 2) AS urgent_percentage
    FROM monthly WHERE studio_id IS NOT NULL AND requester_key IS NOT NULL
    GROUP BY studio_id, requester_key
  )
  SELECT jsonb_build_object(
    'month', month_start, 'timezone', 'America/Lima',
    'total_requests', (SELECT count(*) FROM monthly),
    'urgent_requests', (SELECT count(*) FROM monthly WHERE urgent_requested),
    'urgent_percentage', (SELECT round(100.0 * count(*) FILTER (WHERE urgent_requested) / nullif(count(*), 0), 2) FROM monthly),
    'unattributed_requests', (SELECT count(*) FROM monthly WHERE studio_id IS NULL OR requester_key IS NULL),
    'requesters', coalesce((SELECT jsonb_agg(to_jsonb(g) ORDER BY g.studio_id, g.requester_key) FROM grouped g), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END $$;

REVOKE ALL ON FUNCTION app_private.normalize_requester_name(text), app_private.require_public_requester_name(),
  app_private.lock_flow_project_metrics(), app_private.ticket_performance(uuid),
  public.get_ticket_performance(uuid), public.get_ticket_performance_summary(uuid),
  public.get_requester_urgency_month(date, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_ticket_performance(uuid),
  public.get_ticket_performance_summary(uuid), public.get_requester_urgency_month(date, uuid) TO authenticated;
-- Las tres RPC públicas validan además perfil activo y rol; authenticated por sí solo no autoriza.
-- submit_client_request conserva sus grants anteriores y el tracking público no cambia.
-- Consultas para la interfaz de Claude 42b5af7. Reutilizan los cálculos anteriores;
-- no cambian componentes, nombres provisionales ni validadores del frontend.
CREATE FUNCTION app_private.metrics_month(p_month text) RETURNS date
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
BEGIN
  IF p_month IS NULL THEN RETURN (current_timestamp AT TIME ZONE 'America/Lima')::date; END IF;
  IF p_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'Mes requerido en formato YYYY-MM' USING ERRCODE='22023';
  END IF;
  RETURN (p_month || '-01')::date;
END $$;

CREATE FUNCTION public.metrics_monthly_urgency(p_month text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE source jsonb; result jsonb;
BEGIN
  source := public.get_requester_urgency_month(app_private.metrics_month(p_month), NULL);
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'requester_name', item->>'requester_name', 'studio_id', item->>'studio_id',
    'studio_name', s.name, 'month', left(source->>'month', 7),
    'total_requests', item->'total_requests', 'urgent_requests', item->'urgent_requests',
    'urgent_pct', item->'urgent_percentage') ORDER BY s.id, item->>'requester_key'), '[]'::jsonb)
  INTO result FROM jsonb_array_elements(source->'requesters') item
  JOIN public.studios s ON s.id = (item->>'studio_id')::uuid;
  RETURN result;
END $$;

CREATE FUNCTION public.metrics_requester_urgency(p_request_id uuid, p_month text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.requests; source jsonb; entry jsonb; normalized text; month_date date;
BEGIN
  PERFORM app_private.require_role(ARRAY['superadmin','admin']);
  month_date := app_private.metrics_month(p_month);
  SELECT * INTO r FROM public.requests WHERE id = p_request_id AND number_series = 'REQ';
  IF NOT FOUND OR r.studio_id IS NULL THEN RETURN NULL; END IF;
  normalized := app_private.normalize_requester_name(r.requester_name);
  IF normalized IS NULL THEN RETURN NULL; END IF;
  source := public.get_requester_urgency_month(month_date, r.studio_id);
  SELECT item INTO entry FROM jsonb_array_elements(source->'requesters') item
    WHERE item->>'requester_key' = normalized;
  RETURN jsonb_build_object(
    'requester_name', r.requester_name, 'studio_id', r.studio_id,
    'studio_name', (SELECT name FROM public.studios WHERE id = r.studio_id),
    'month', left(source->>'month', 7),
    'total_requests', coalesce(entry->'total_requests', '0'::jsonb),
    'urgent_requests', coalesce(entry->'urgent_requests', '0'::jsonb),
    'urgent_pct', entry->'urgent_percentage');
END $$;

CREATE FUNCTION public.metrics_time_averages(p_period_days integer DEFAULT NULL, p_studio_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
  PERFORM app_private.require_role(ARRAY['superadmin','admin','developer','viewer']);
  IF p_period_days IS NOT NULL AND p_period_days <= 0 THEN
    RAISE EXCEPTION 'El período debe ser positivo o null' USING ERRCODE='22023';
  END IF;
  -- Cohorte comparable: ambos promedios sobre los MISMOS tickets terminados con Cycle y Lead válidos
  -- (metric_status = 'complete'), de modo que el promedio de Lead nunca queda por debajo del de Cycle
  -- por mezclar poblaciones. Los terminados sin inicio registrado o con cronología inválida se
  -- informan aparte (excluded_count) y no entran en ninguno de los dos promedios.
  SELECT jsonb_build_object(
    'completed_count', count(*),
    'avg_cycle_time_days', avg(cycle_time_seconds) FILTER (WHERE metric_status = 'complete') / 86400::numeric,
    'avg_lead_time_days', avg(lead_time_seconds) FILTER (WHERE metric_status = 'complete') / 86400::numeric,
    'cycle_sample_size', count(*) FILTER (WHERE metric_status = 'complete'),
    'lead_sample_size', count(*) FILTER (WHERE metric_status = 'complete'),
    'excluded_count', count(*) FILTER (WHERE metric_status <> 'complete'),
    'cohort', 'paired_complete'
  ) INTO result FROM app_private.ticket_performance(p_studio_id)
  WHERE general_status = 'done'
    AND (p_period_days IS NULL OR completed_at >= current_timestamp - make_interval(days => p_period_days));
  RETURN result;
END $$;

REVOKE ALL ON FUNCTION app_private.metrics_month(text), public.metrics_monthly_urgency(text),
  public.metrics_requester_urgency(uuid, text), public.metrics_time_averages(integer, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.metrics_monthly_urgency(text), public.metrics_requester_urgency(uuid, text),
  public.metrics_time_averages(integer, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
