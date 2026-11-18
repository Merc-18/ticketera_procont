-- Prepared only. Requires separate authorization before remote application.
-- Catálogos de clasificación de tickets: sistemas/subproyectos, estudios y sus
-- códigos internos, jerarquía de áreas por estudio, y clasificación/validación
-- de solicitudes. No modifica funciones existentes ni borra datos.
BEGIN;

-- ─── Sistemas (catálogo de productos; distinto de public.projects operativos) ──
CREATE TABLE public.catalog_systems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (name = btrim(name) AND length(name) BETWEEN 1 AND 200),
  requires_subproject boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX catalog_systems_name_idx ON public.catalog_systems (lower(name));

CREATE TABLE public.catalog_subsystems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  system_id uuid NOT NULL REFERENCES public.catalog_systems(id),
  name text NOT NULL CHECK (name = btrim(name) AND length(name) BETWEEN 1 AND 200),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, system_id)
);
CREATE UNIQUE INDEX catalog_subsystems_name_idx ON public.catalog_subsystems (system_id, lower(name));

-- ─── Estudios y códigos internos ───────────────────────────────────────────────
CREATE TABLE public.studios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (name = btrim(name) AND length(name) BETWEEN 1 AND 300),
  ruc text CHECK (ruc ~ '^[0-9]{11}$'),            -- no único: puede repetirse (ver review_note)
  review_note text CHECK (length(review_note) <= 1000),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX studios_name_idx ON public.studios (lower(name));

CREATE TABLE public.studio_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id uuid NOT NULL REFERENCES public.studios(id),
  code text NOT NULL CHECK (code ~ '^[A-Z0-9_]{1,50}$'),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, studio_id)
);
CREATE UNIQUE INDEX studio_codes_code_idx ON public.studio_codes (code);

-- ─── Áreas: jerarquía área → subárea, con código y estudio ─────────────────────
ALTER TABLE public.areas
  ADD COLUMN code text CHECK (code ~ '^[A-Z0-9]{1,20}$'),
  ADD COLUMN studio_id uuid REFERENCES public.studios(id),
  ADD COLUMN parent_id uuid REFERENCES public.areas(id);
DROP INDEX public.areas_name_unique_idx;
CREATE UNIQUE INDEX areas_scope_name_idx ON public.areas (
  coalesce(studio_id,'00000000-0000-0000-0000-000000000000'),
  coalesce(parent_id,'00000000-0000-0000-0000-000000000000'), lower(name));
CREATE UNIQUE INDEX areas_scope_code_idx ON public.areas (
  coalesce(studio_id,'00000000-0000-0000-0000-000000000000'), code) WHERE code IS NOT NULL;

CREATE FUNCTION app_private.check_area_hierarchy() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE parent public.areas;
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    SELECT * INTO parent FROM public.areas WHERE id = NEW.parent_id;
    IF NOT FOUND OR parent.parent_id IS NOT NULL OR NEW.parent_id = NEW.id
       OR parent.studio_id IS DISTINCT FROM NEW.studio_id THEN
      RAISE EXCEPTION 'Subárea inválida: el padre debe ser un área principal del mismo estudio' USING ERRCODE='23514';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.studio_id IS DISTINCT FROM OLD.studio_id OR NEW.parent_id IS DISTINCT FROM OLD.parent_id) THEN
    RAISE EXCEPTION 'El estudio y el área padre no se modifican; crear una nueva área' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER check_area_hierarchy BEFORE INSERT OR UPDATE ON public.areas
  FOR EACH ROW EXECUTE FUNCTION app_private.check_area_hierarchy();

-- ─── Clasificación en solicitudes (texto histórico requester_area se conserva) ──
ALTER TABLE public.requests
  ADD COLUMN studio_id uuid REFERENCES public.studios(id),
  ADD COLUMN system_id uuid REFERENCES public.catalog_systems(id),
  ADD COLUMN subsystem_id uuid,
  ADD COLUMN area_id uuid REFERENCES public.areas(id),
  ADD COLUMN subarea_id uuid REFERENCES public.areas(id),
  ADD COLUMN studio_code_id uuid,
  ADD COLUMN classified_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN classified_at timestamptz,
  ADD CONSTRAINT requests_subsystem_fkey FOREIGN KEY (subsystem_id, system_id)
    REFERENCES public.catalog_subsystems(id, system_id),
  ADD CONSTRAINT requests_studio_code_fkey FOREIGN KEY (studio_code_id, studio_id)
    REFERENCES public.studio_codes(id, studio_id);

CREATE FUNCTION app_private.guard_request_classification() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF ROW(OLD.studio_id,OLD.system_id,OLD.subsystem_id,OLD.area_id,OLD.subarea_id)
       IS DISTINCT FROM ROW(NEW.studio_id,NEW.system_id,NEW.subsystem_id,NEW.area_id,NEW.subarea_id)
     AND ROW(OLD.studio_id,OLD.system_id,OLD.subsystem_id,OLD.area_id,OLD.subarea_id)
       IS DISTINCT FROM ROW(NULL::uuid,NULL::uuid,NULL::uuid,NULL::uuid,NULL::uuid) THEN
    RAISE EXCEPTION 'La clasificación original de la solicitud no se modifica' USING ERRCODE='23514';
  END IF;
  IF NEW.studio_code_id IS DISTINCT FROM OLD.studio_code_id AND OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'El código de estudio se fija con la decisión' USING ERRCODE='23514';
  END IF;
  IF OLD.status = 'pending' AND NEW.status <> 'pending'
     AND NEW.studio_id IS NOT NULL AND NEW.studio_code_id IS NULL THEN
    RAISE EXCEPTION 'Asignar el código interno del estudio antes de aceptar o rechazar' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_request_classification BEFORE UPDATE ON public.requests
  FOR EACH ROW EXECUTE FUNCTION app_private.guard_request_classification();

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['catalog_systems','catalog_subsystems','studios','studio_codes'] LOOP
    EXECUTE format('CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.%I
      FOR EACH ROW EXECUTE FUNCTION app_private.touch_updated_at()', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated, service_role', t);
    EXECUTE format('CREATE POLICY member_read_active ON public.%I FOR SELECT TO authenticated
      USING (is_active AND (SELECT app_private.has_role(ARRAY[''superadmin'',''admin'',''developer'',''viewer''])))', t);
    EXECUTE format('CREATE POLICY superadmin_read ON public.%I FOR SELECT TO authenticated
      USING ((SELECT app_private.has_role(ARRAY[''superadmin''])))', t);
    EXECUTE format('CREATE POLICY superadmin_insert ON public.%I FOR INSERT TO authenticated
      WITH CHECK ((SELECT app_private.has_role(ARRAY[''superadmin''])))', t);
    EXECUTE format('CREATE POLICY superadmin_update ON public.%I FOR UPDATE TO authenticated
      USING ((SELECT app_private.has_role(ARRAY[''superadmin''])))
      WITH CHECK ((SELECT app_private.has_role(ARRAY[''superadmin''])))', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
  END LOOP;
  -- El formulario público ve nombres activos; nunca RUC ni códigos internos.
  FOREACH t IN ARRAY ARRAY['catalog_systems','catalog_subsystems','studios'] LOOP
    EXECUTE format('CREATE POLICY public_read_active ON public.%I FOR SELECT TO anon USING (is_active)', t);
  END LOOP;
END $$;
GRANT SELECT (id, name, requires_subproject, sort_order, is_active) ON public.catalog_systems TO anon;
GRANT SELECT (id, system_id, name, is_active) ON public.catalog_subsystems TO anon;
GRANT SELECT (id, name, is_active) ON public.studios TO anon;
GRANT INSERT (name, requires_subproject, sort_order, is_active),
      UPDATE (name, requires_subproject, sort_order, is_active) ON public.catalog_systems TO authenticated;
GRANT INSERT (system_id, name, is_active), UPDATE (name, is_active) ON public.catalog_subsystems TO authenticated;
GRANT INSERT (name, ruc, review_note, is_active), UPDATE (name, ruc, review_note, is_active) ON public.studios TO authenticated;
GRANT INSERT (studio_id, code, is_active), UPDATE (code, is_active) ON public.studio_codes TO authenticated;
GRANT SELECT (parent_id, studio_id) ON public.areas TO anon;
GRANT INSERT (code, studio_id, parent_id), UPDATE (code) ON public.areas TO authenticated;

-- ─── Envío clasificado (reutiliza submit_request; añade la clasificación) ──────
CREATE FUNCTION public.submit_classified_request(p_payload jsonb, p_classification jsonb, p_idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb; input jsonb; st public.studios; sy public.catalog_systems;
  v_sub uuid; v_area public.areas; v_subarea public.areas; label text;
BEGIN
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
    SELECT * INTO v_area FROM public.areas WHERE id = nullif(p_classification->>'area_id','')::uuid
      AND studio_id = st.id AND parent_id IS NULL AND is_active;
    IF NOT FOUND THEN RAISE EXCEPTION 'Área requerida para este estudio' USING ERRCODE='22023'; END IF;
    IF nullif(p_classification->>'subarea_id','') IS NOT NULL THEN
      SELECT * INTO v_subarea FROM public.areas WHERE id = (p_classification->>'subarea_id')::uuid
        AND parent_id = v_area.id AND is_active;
      IF NOT FOUND THEN RAISE EXCEPTION 'Subárea inválida' USING ERRCODE='22023'; END IF;
    ELSIF EXISTS (SELECT 1 FROM public.areas WHERE parent_id = v_area.id AND is_active) THEN
      RAISE EXCEPTION 'Subárea requerida' USING ERRCODE='22023';
    END IF;
    label := v_area.name || coalesce(' / ' || v_subarea.name, '');
  ELSIF nullif(p_classification->>'area_id','') IS NOT NULL OR nullif(p_classification->>'subarea_id','') IS NOT NULL THEN
    RAISE EXCEPTION 'Este estudio no tiene áreas' USING ERRCODE='22023';
  ELSE
    label := st.name;  -- compatibilidad: requester_area es obligatorio en submit_request
  END IF;

  result := public.submit_request((p_payload - 'requester_area') || jsonb_build_object('requester_area', left(label, 200)),
                                  p_idempotency_key);
  UPDATE public.requests SET studio_id = st.id, system_id = sy.id, subsystem_id = v_sub,
      area_id = v_area.id, subarea_id = v_subarea.id
    WHERE id = (result->>'id')::uuid;
  RETURN app_private.remember('submit_classified_request', p_idempotency_key, input, result);
END $$;

-- ─── Validación: código interno del estudio, antes de aceptar o rechazar ───────
CREATE FUNCTION public.assign_request_studio_code(p_request_id uuid, p_studio_code_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.requests;
BEGIN
  PERFORM app_private.require_role(ARRAY['superadmin','admin']);
  SELECT * INTO r FROM public.requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR r.status <> 'pending' THEN
    RAISE EXCEPTION 'Solicitud pendiente requerida' USING ERRCODE='23514';
  END IF;
  IF r.studio_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.studio_codes
       WHERE id = p_studio_code_id AND studio_id = r.studio_id AND is_active) THEN
    RAISE EXCEPTION 'El código no corresponde al estudio de la solicitud' USING ERRCODE='22023';
  END IF;
  UPDATE public.requests SET studio_code_id = p_studio_code_id, classified_by = auth.uid(), classified_at = now()
    WHERE id = r.id;
END $$;

REVOKE ALL ON FUNCTION public.submit_classified_request(jsonb,jsonb,uuid), public.assign_request_studio_code(uuid,uuid),
  app_private.check_area_hierarchy(), app_private.guard_request_classification()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_classified_request(jsonb,jsonb,uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_request_studio_code(uuid,uuid) TO authenticated;

-- ─── Datos de catálogo suministrados por Procont Business (18/11/2026) ─────────
INSERT INTO public.catalog_systems (name, requires_subproject, sort_order) VALUES
  ('Quipu', true, 1), ('Quipu_Fac', true, 2), ('Quipu_Gestion', true, 3), ('Negmin', true, 4),
  ('Quipu_AI', true, 5), ('Otros', false, 6), ('Soporte tecnico', false, 7);
INSERT INTO public.catalog_subsystems (system_id, name)
  SELECT s.id, v.sub FROM (VALUES
    ('Quipu','Escritorio'), ('Quipu_Fac','Escritorio'), ('Quipu_Fac','Web'), ('Quipu_Fac','Android'),
    ('Quipu_Gestion','Web'), ('Negmin','Web'), ('Negmin','Android'), ('Quipu_AI','Web')) v(sys, sub)
  JOIN public.catalog_systems s ON s.name = v.sys;

INSERT INTO public.studios (name, ruc, review_note) VALUES
  ('BUSINESS ACCOMPANYING SAC', '20602111602',
   'RUC compartido con INVERSIONES Y SERVICIOS MULTIPLES SAN ROMAN SA; pendiente de confirmar.'),
  ('CENTRAL DE COOPERATIVAS MINERAS RINCONADA Y LUNAR DE ORO LIMITADA', '20447645476', NULL),
  ('CORPORACION MINERA ANANEA S.A.', '20391615323', NULL),
  ('ZELA COLLA JUAN RUBEN ROMARIO', '10472148830', NULL),
  ('COAQUIRA APAZA EWER', '10419464550', NULL),
  ('ESTUDIO CONTABLE CREY', '10435265664', NULL),
  ('INVERSIONES Y SERVICIOS MULTIPLES SAN ROMAN SA', '20602111602',
   'RUC compartido con BUSINESS ACCOMPANYING SAC; pendiente de confirmar.'),
  ('COMUNIDAD CAMPESINA DE UNTUCA', '20169040231', NULL),
  ('EXPLORACION Y SERVICIO MINERO ZUSAN S.A.', '20605608931', NULL);
INSERT INTO public.studio_codes (studio_id, code)
  SELECT s.id, v.code FROM (VALUES
    ('BUSINESS ACCOMPANYING SAC','ARAPA'), ('BUSINESS ACCOMPANYING SAC','ASPPMACSU'),
    ('BUSINESS ACCOMPANYING SAC','DISFARMADENT'), ('BUSINESS ACCOMPANYING SAC','PROCONT'),
    ('BUSINESS ACCOMPANYING SAC','PROCONT_CUZ'), ('BUSINESS ACCOMPANYING SAC','PROCONT_OLICH'),
    ('CENTRAL DE COOPERATIVAS MINERAS RINCONADA Y LUNAR DE ORO LIMITADA','CECOMIRL'),
    ('CORPORACION MINERA ANANEA S.A.','CMASA'), ('ZELA COLLA JUAN RUBEN ROMARIO','COACOT'),
    ('COAQUIRA APAZA EWER','COAQUIRA'), ('ESTUDIO CONTABLE CREY','CREY'),
    ('INVERSIONES Y SERVICIOS MULTIPLES SAN ROMAN SA','SANROMAN'),
    ('COMUNIDAD CAMPESINA DE UNTUCA','UNTUCA'), ('EXPLORACION Y SERVICIO MINERO ZUSAN S.A.','ZUSAN')) v(studio, code)
  JOIN public.studios s ON s.name = v.studio;

INSERT INTO public.areas (name, code, studio_id)
  SELECT v.name, v.code, s.id FROM (VALUES
    ('CONTABILIDAD','C000'), ('LEGAL','L000'), ('GERENCIA','G000'),
    ('ADMINISTRACIÓN','AD00'), ('CAJA Y BANCOS','CB00')) v(name, code)
  JOIN public.studios s ON s.name = 'BUSINESS ACCOMPANYING SAC';
INSERT INTO public.areas (name, code, studio_id, parent_id)
  SELECT v.name, v.code, p.studio_id, p.id FROM (VALUES
    ('C000','TRANSPORTES','C001'), ('C000','COMERCIAL','C002'), ('C000','IMPORTACIÓN','C003'),
    ('C000','INDUSTRIAL','C004'), ('C000','SERVICIOS','C005'), ('C000','GRIFOS','C006'),
    ('C000','RENTAS','C007'), ('C000','MINERÍA REG. GENERAL A','C008'), ('C000','MINERÍA REG. GENERAL B','C009'),
    ('C000','MINERÍA REG. GENERAL C','C010'), ('C000','MINERÍA REG. MYPE TRIBUTARIO','C011'),
    ('C000','MINERÍA REG. ESPECIAL','C012'), ('L000','ASESORÍA','L001'), ('G000','GENERAL','G001')) v(parent, name, code)
  JOIN public.areas p ON p.code = v.parent AND p.parent_id IS NULL
  JOIN public.studios s ON s.id = p.studio_id AND s.name = 'BUSINESS ACCOMPANYING SAC';

NOTIFY pgrst, 'reload schema';
COMMIT;
