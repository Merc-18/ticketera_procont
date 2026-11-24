-- M18 (24/11/2026): paleta de color personal limitada a 10 y plantillas de checklist de Analysis y Code Review.
-- Requiere M17 (20261123000300). Transaccional e idempotente: se puede ejecutar de nuevo sin cambiar el resultado.
-- No elimina tablas ni columnas, no reasigna colores existentes y no toca checklists de proyectos ya creados.
--
-- A. Color personal (D-050):
--    · `offered` marca los 10 colores aprobados (frontend: src/lib/card-palette.ts OWNER_PALETTE).
--    · La autoasignación (trigger de activación) solo usa colores ofrecidos y libres; si no queda ninguno, el perfil
--      queda SIN color: la activación nunca falla por capacidad y nunca se repite un color.
--    · Una petición explícita solo acepta un color ofrecido o conservar el propio actual (aunque esté retirado).
--    · Se mantienen UNIQUE(color_id), el bloqueo EXCLUSIVE de la tabla, RLS, permisos y la firma de las RPC.
-- B. Checklist (D-053): 8 filas de referencia en `checklist_templates` (4 Analysis, 4 Code Review) con el texto
--    exacto de src/lib/checklist-defaults.ts. `add_flows` (sin cambios) las copia a los proyectos NUEVOS.
BEGIN;

DO $$ BEGIN
  IF to_regclass('app_private.internal_card_color_catalog') IS NULL OR to_regclass('public.internal_card_preferences') IS NULL
     OR to_regprocedure('app_private.ensure_internal_card_color(uuid,text)') IS NULL OR to_regclass('public.checklist_templates') IS NULL THEN
    RAISE EXCEPTION 'M18 requires M17 (internal card preferences) and the checklist template catalog' USING ERRCODE='55000';
  END IF;
  IF NOT (app_private.valid_phase('development','analysis') AND app_private.valid_phase('development','code_review')) THEN
    RAISE EXCEPTION 'M18 requires the M12 development phases analysis and code_review' USING ERRCODE='55000';
  END IF;
END $$;

-- ─── A. Paleta ofrecida de 10 colores ────────────────────────────────────────────────────────────────────────
ALTER TABLE app_private.internal_card_color_catalog ADD COLUMN IF NOT EXISTS offered boolean NOT NULL DEFAULT false;
UPDATE app_private.internal_card_color_catalog
   SET offered = color_id = ANY(ARRAY['azul','celeste','dorado','ambar','grafito','pizarra',
                                      'dorado-claro','ambar-bronce','celeste-oscuro','pizarra-acero'])
 WHERE offered IS DISTINCT FROM (color_id = ANY(ARRAY['azul','celeste','dorado','ambar','grafito','pizarra',
                                      'dorado-claro','ambar-bronce','celeste-oscuro','pizarra-acero']));
DO $$ BEGIN
  IF (SELECT count(*) FROM app_private.internal_card_color_catalog WHERE offered) <> 10
     OR (SELECT count(*) FROM app_private.internal_card_color_catalog) <> 24 THEN
    RAISE EXCEPTION 'M18 expects the 24-color M17 catalog with exactly 10 offered colors' USING ERRCODE='23514';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION app_private.ensure_internal_card_color(p_user_id uuid,p_requested_color_id text DEFAULT NULL) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE active boolean; selected text; existing text;
BEGIN
  SELECT u.is_active INTO active FROM public.users u WHERE u.id=p_user_id FOR UPDATE;
  IF NOT FOUND OR NOT active THEN RAISE EXCEPTION 'Active internal profile required' USING ERRCODE='42501'; END IF;
  -- Serializa todas las asignaciones: dos activaciones simultáneas no pueden leer el mismo color libre.
  LOCK TABLE public.internal_card_preferences IN EXCLUSIVE MODE;
  SELECT color_id INTO existing FROM public.internal_card_preferences WHERE user_id=p_user_id;
  IF p_requested_color_id IS NULL AND existing IS NOT NULL THEN RETURN existing; END IF;   -- conserva el actual
  IF p_requested_color_id IS NULL THEN
    SELECT c.color_id INTO selected FROM app_private.internal_card_color_catalog c
      WHERE c.offered AND NOT EXISTS (SELECT 1 FROM public.internal_card_preferences p WHERE p.color_id=c.color_id)
      ORDER BY c.sort_order LIMIT 1;
    -- Capacidad agotada: el perfil queda sin color; no se repite ninguno y la activación continúa.
    IF selected IS NULL THEN RETURN NULL; END IF;
  ELSE
    IF p_requested_color_id IS DISTINCT FROM existing AND NOT EXISTS (
        SELECT 1 FROM app_private.internal_card_color_catalog c WHERE c.color_id=p_requested_color_id AND c.offered) THEN
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

CREATE OR REPLACE FUNCTION public.internal_card_colors() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
  IF NOT app_private.has_role(ARRAY['superadmin','admin','developer','viewer']) THEN
    RAISE EXCEPTION 'Active internal profile required' USING ERRCODE='42501';
  END IF;
  SELECT jsonb_build_object(
    'user_id',auth.uid(),
    'capacity',(SELECT count(*) FROM app_private.internal_card_color_catalog WHERE offered),
    -- Los 10 ofrecidos y, además, cualquier color retirado que siga asignado (compatibilidad histórica).
    'colors',coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.color_id,'label',c.label,'offered',c.offered,
      'assigned_to',p.user_id) ORDER BY c.sort_order)
      FROM app_private.internal_card_color_catalog c LEFT JOIN public.internal_card_preferences p ON p.color_id=c.color_id
      WHERE c.offered OR p.user_id IS NOT NULL),'[]'::jsonb),
    'assignments',coalesce((SELECT jsonb_object_agg(p.user_id::text,p.color_id)
      FROM public.internal_card_preferences p JOIN public.users u ON u.id=p.user_id WHERE u.is_active),'{}'::jsonb)
  ) INTO result;
  RETURN result;
END $$;
-- set_my_internal_card_color(text) y el trigger de perfil no cambian: delegan en ensure_internal_card_color.
REVOKE ALL ON FUNCTION public.internal_card_colors() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.internal_card_colors() TO authenticated;

-- ─── B. Plantillas de checklist que faltaban (solo referencia; ningún proyecto existente cambia) ─────────────
INSERT INTO public.checklist_templates(flow_type,phase,description,order_index)
SELECT v.flow_type,v.phase,v.description,v.order_index
  FROM (VALUES
    ('development','analysis','Revisar el requerimiento y aclarar dudas con el solicitante',0),
    ('development','analysis','Identificar dependencias y sistemas afectados',1),
    ('development','analysis','Definir criterios de aceptación',2),
    ('development','analysis','Documentar riesgos y supuestos',3),
    ('development','code_review','Revisar el diff y la lógica implementada',0),
    ('development','code_review','Validar estándares, seguridad y manejo de errores',1),
    ('development','code_review','Resolver las observaciones de la revisión',2),
    ('development','code_review','Registrar la aprobación del revisor',3)
  ) AS v(flow_type,phase,description,order_index)
 WHERE NOT EXISTS (SELECT 1 FROM public.checklist_templates t
                    WHERE t.flow_type=v.flow_type AND t.phase=v.phase AND (t.order_index=v.order_index OR t.description=v.description));
DO $$ BEGIN
  IF (SELECT count(*) FROM public.checklist_templates WHERE flow_type='development' AND phase IN ('analysis','code_review')) <> 8 THEN
    RAISE EXCEPTION 'M18 expected exactly 8 Analysis/Code Review templates' USING ERRCODE='23514';
  END IF;
END $$;

NOTIFY pgrst,'reload schema';
COMMIT;
