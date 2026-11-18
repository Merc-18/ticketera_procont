-- Trazabilidad y seguimiento por estados generales (aprobado 18/11/2026).
-- Estados: received → in_review → approved_backlog → in_progress → done; alternativo: rejected;
-- temporal: blocked (desde backlog o en proceso). Se calculan en el servidor a partir de los datos
-- existentes (solicitud, eventos, proyecto, fases y bloqueo) y cada transición se registra en
-- public.request_events. No se modifican tickets existentes ni las nueve migraciones previas.
BEGIN;

-- ─── Eventos nuevos en la auditoría existente ──────────────────────────────────
DO $$ DECLARE c text; BEGIN
  SELECT conname INTO c FROM pg_constraint
   WHERE conrelid = 'public.request_events'::regclass AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%requester_corrected%';
  EXECUTE format('ALTER TABLE public.request_events DROP CONSTRAINT %I', c);
END $$;
ALTER TABLE public.request_events ADD CONSTRAINT request_events_action_check CHECK (action IN (
  'submitted','classified','approved','rejected','requester_corrected',
  'review_started','status_changed','phase_changed','blocked','unblocked'));

-- ─── Estado general calculado ──────────────────────────────────────────────────
CREATE FUNCTION app_private.final_phase(p_flow_type text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE p_flow_type WHEN 'development' THEN 'done' WHEN 'administrative' THEN 'deployed' END;
$$;

CREATE FUNCTION app_private.request_general_status(p_request_id uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.requests; p public.projects; n int; finished int; active int;
BEGIN
  SELECT * INTO r FROM public.requests WHERE id = p_request_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF r.status = 'rejected' THEN RETURN 'rejected'; END IF;
  IF r.status = 'pending' THEN
    RETURN CASE WHEN EXISTS (SELECT 1 FROM public.request_events WHERE request_id = r.id
                              AND action IN ('review_started','classified')) THEN 'in_review' ELSE 'received' END;
  END IF;
  SELECT * INTO p FROM public.projects WHERE id = r.project_id;
  IF NOT FOUND THEN RETURN 'approved_backlog'; END IF;
  SELECT count(*), count(*) FILTER (WHERE current_phase = app_private.final_phase(flow_type)),
         count(*) FILTER (WHERE current_phase <> 'backlog')
    INTO n, finished, active FROM public.project_flows WHERE project_id = p.id;
  IF p.status = 'completed' OR (n > 0 AND finished = n) THEN RETURN 'done'; END IF;
  IF p.is_blocked THEN RETURN 'blocked'; END IF;      -- temporal: no altera la fase técnica
  IF active > 0 THEN RETURN 'in_progress'; END IF;    -- cualquier fase distinta de Backlog
  RETURN 'approved_backlog';
END $$;

-- Registra la transición si el estado calculado difiere del último registrado.
CREATE FUNCTION app_private.sync_request_status(p_request_id uuid, p_cause jsonb DEFAULT '{}'::jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE current_status text; last_status text;
BEGIN
  IF p_request_id IS NULL THEN RETURN; END IF;
  current_status := app_private.request_general_status(p_request_id);
  SELECT details->>'to' INTO last_status FROM public.request_events
   WHERE request_id = p_request_id AND action = 'status_changed' ORDER BY id DESC LIMIT 1;
  IF current_status IS DISTINCT FROM last_status THEN
    INSERT INTO public.request_events(request_id, actor_id, action, details)
      VALUES (p_request_id, auth.uid(), 'status_changed',
              jsonb_build_object('from', last_status, 'to', current_status) || coalesce(p_cause, '{}'::jsonb));
  END IF;
END $$;

-- ─── Disparadores sobre los mecanismos existentes ──────────────────────────────
CREATE FUNCTION app_private.trg_request_status() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app_private.sync_request_status(NEW.id, jsonb_build_object('cause', lower(TG_OP)));
  RETURN NULL;
END $$;
CREATE TRIGGER sync_request_status AFTER INSERT OR UPDATE OF status, project_id ON public.requests
  FOR EACH ROW EXECUTE FUNCTION app_private.trg_request_status();

CREATE FUNCTION app_private.trg_review_event_status() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app_private.sync_request_status(NEW.request_id, jsonb_build_object('cause', NEW.action));
  RETURN NULL;
END $$;
CREATE TRIGGER sync_review_status AFTER INSERT ON public.request_events
  FOR EACH ROW WHEN (NEW.action IN ('review_started','classified'))
  EXECUTE FUNCTION app_private.trg_review_event_status();

CREATE FUNCTION app_private.trg_flow_phase() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE rid uuid;
BEGIN
  SELECT request_id INTO rid FROM public.projects WHERE id = NEW.project_id;
  IF TG_OP = 'UPDATE' AND NEW.current_phase IS DISTINCT FROM OLD.current_phase THEN
    INSERT INTO public.request_events(request_id, actor_id, action, details)
      VALUES (rid, auth.uid(), 'phase_changed', jsonb_build_object('project_id', NEW.project_id,
        'flow_type', NEW.flow_type, 'from', OLD.current_phase, 'to', NEW.current_phase));
  END IF;
  PERFORM app_private.sync_request_status(rid, jsonb_build_object('cause', 'phase', 'flow_type', NEW.flow_type,
    'phase', NEW.current_phase));
  RETURN NULL;
END $$;
CREATE TRIGGER sync_flow_phase AFTER INSERT OR UPDATE OF current_phase ON public.project_flows
  FOR EACH ROW EXECUTE FUNCTION app_private.trg_flow_phase();

-- Reutiliza projects.is_blocked/blocked_reason/blocked_since: historial permanente en request_events.
CREATE FUNCTION app_private.trg_project_block() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.is_blocked AND NOT OLD.is_blocked THEN
    INSERT INTO public.request_events(request_id, actor_id, action, details)
      VALUES (NEW.request_id, auth.uid(), 'blocked', jsonb_build_object('project_id', NEW.id,
        'reason', NEW.blocked_reason, 'blocked_since', coalesce(NEW.blocked_since, now())));
  ELSIF OLD.is_blocked AND NOT NEW.is_blocked THEN
    INSERT INTO public.request_events(request_id, actor_id, action, details)
      VALUES (NEW.request_id, auth.uid(), 'unblocked', jsonb_build_object('project_id', NEW.id,
        'reason', OLD.blocked_reason, 'blocked_since', OLD.blocked_since, 'unblocked_at', now()));
  END IF;
  PERFORM app_private.sync_request_status(NEW.request_id, jsonb_build_object('cause', 'project'));
  RETURN NULL;
END $$;
CREATE TRIGGER sync_project_block AFTER UPDATE OF is_blocked, status ON public.projects
  FOR EACH ROW EXECUTE FUNCTION app_private.trg_project_block();

-- ─── Inicio de revisión (revisión y clasificación son una sola etapa) ──────────
CREATE FUNCTION public.start_request_review(p_request_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app_private.require_role(ARRAY['superadmin','admin']);
  PERFORM 1 FROM public.requests WHERE id = p_request_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;   -- idempotente: sin efecto si ya se decidió
  IF NOT EXISTS (SELECT 1 FROM public.request_events WHERE request_id = p_request_id
                   AND action IN ('review_started','classified')) THEN
    INSERT INTO public.request_events(request_id, actor_id, action) VALUES (p_request_id, auth.uid(), 'review_started');
  END IF;
END $$;

-- ─── Seguimiento público solo por número REQ, con límite de frecuencia ─────────
CREATE TABLE app_private.public_tracking_hits (
  bucket text NOT NULL,
  window_start timestamptz NOT NULL,
  hits integer NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window_start)
);
ALTER TABLE app_private.public_tracking_hits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.public_tracking_hits FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.track_request_status(p_request_number text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE headers jsonb; client text; win timestamptz := date_trunc('minute', now());
  per_client integer; total integer; rid uuid; normalized text := upper(btrim(coalesce(p_request_number, '')));
BEGIN
  BEGIN headers := nullif(current_setting('request.headers', true), '')::jsonb;
  EXCEPTION WHEN others THEN headers := NULL; END;
  client := coalesce(nullif(headers->>'cf-connecting-ip',''), nullif(btrim(split_part(headers->>'x-forwarded-for', ',', 1)),''),
                     nullif(headers->>'x-real-ip',''), 'unknown');
  INSERT INTO app_private.public_tracking_hits(bucket, window_start, hits) VALUES ('ip:' || md5(client), win, 1)
    ON CONFLICT (bucket, window_start) DO UPDATE SET hits = public_tracking_hits.hits + 1 RETURNING hits INTO per_client;
  INSERT INTO app_private.public_tracking_hits(bucket, window_start, hits) VALUES ('global', win, 1)
    ON CONFLICT (bucket, window_start) DO UPDATE SET hits = public_tracking_hits.hits + 1 RETURNING hits INTO total;
  IF random() < 0.02 THEN DELETE FROM app_private.public_tracking_hits WHERE window_start < now() - interval '1 hour'; END IF;
  IF per_client > 10 OR total > 300 THEN RETURN jsonb_build_object('rate_limited', true); END IF;
  IF normalized !~ '^REQ[0-9]{2}-[0-9]{3,}$' THEN RETURN NULL; END IF;
  SELECT id INTO rid FROM public.requests WHERE request_number = normalized AND number_series = 'REQ';
  IF NOT FOUND THEN RETURN NULL; END IF;
  -- Respuesta mínima: solo número y estado general.
  RETURN jsonb_build_object('request_number', normalized, 'status', app_private.request_general_status(rid));
END $$;

-- ─── Permisos ──────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION app_private.final_phase(text), app_private.request_general_status(uuid),
  app_private.sync_request_status(uuid, jsonb), app_private.trg_request_status(), app_private.trg_review_event_status(),
  app_private.trg_flow_phase(), app_private.trg_project_block(), public.start_request_review(uuid),
  public.track_request_status(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.track_request_status(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_request_review(uuid) TO authenticated;

-- ─── Estado inicial de solicitudes existentes (solo eventos; los tickets no se modifican) ─
INSERT INTO public.request_events(request_id, action, details)
  SELECT id, 'status_changed', jsonb_build_object('from', NULL, 'to', app_private.request_general_status(id), 'cause', 'baseline')
  FROM public.requests;

NOTIFY pgrst, 'reload schema';
COMMIT;
