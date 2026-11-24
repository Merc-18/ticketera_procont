-- PROPUESTA — NO APLICADA. Requiere autorización expresa antes de copiarla a supabase/migrations y aplicarla.
-- Paleta de color personal reducida a 10 colores ofrecidos (24/11/2026).
-- Cambio mínimo sobre M17 (20261123000300): no borra filas del catálogo (siguen referenciadas y válidas para
-- pintar asignaciones previas), no reasigna a nadie y conserva UNIQUE(color_id), bloqueo y validaciones.
--  1. Marca qué colores se ofrecen (10).
--  2. La autoasignación (trigger de activación) solo entrega colores ofrecidos y, si no queda ninguno libre,
--     deja al perfil SIN color en lugar de fallar la activación o repetir un color.
--  3. set_my_internal_card_color solo acepta colores ofrecidos (o conservar el propio actual).
--  4. internal_card_colors devuelve los ofrecidos, los asignados retirados y la capacidad.
-- Estado remoto verificado (solo lectura, 24/11/2026): 2 perfiles internos activos con 'azul' y 'pizarra'
-- (ambos dentro de los 10). Esta migración no cambia ninguna asignación existente.
BEGIN;

ALTER TABLE app_private.internal_card_color_catalog ADD COLUMN offered boolean NOT NULL DEFAULT false;
UPDATE app_private.internal_card_color_catalog SET offered = color_id IN
  ('azul','celeste','dorado','ambar','grafito','pizarra','dorado-claro','ambar-bronce','celeste-oscuro','pizarra-acero');
DO $$ BEGIN
  IF (SELECT count(*) FROM app_private.internal_card_color_catalog WHERE offered) <> 10 THEN
    RAISE EXCEPTION 'Expected exactly 10 offered card colors' USING ERRCODE='23514';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION app_private.ensure_internal_card_color(p_user_id uuid,p_requested_color_id text DEFAULT NULL) RETURNS text
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
      WHERE c.offered AND NOT EXISTS (SELECT 1 FROM public.internal_card_preferences p WHERE p.color_id=c.color_id)
      ORDER BY c.sort_order LIMIT 1;
    -- Capacidad agotada: el perfil queda sin color (la interfaz lo informa); nunca se repite un color.
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
    'colors',coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.color_id,'label',c.label,'offered',c.offered,
      'assigned_to',p.user_id) ORDER BY c.sort_order)
      FROM app_private.internal_card_color_catalog c LEFT JOIN public.internal_card_preferences p ON p.color_id=c.color_id
      WHERE c.offered OR p.user_id IS NOT NULL),'[]'::jsonb),
    'assignments',coalesce((SELECT jsonb_object_agg(p.user_id::text,p.color_id)
      FROM public.internal_card_preferences p JOIN public.users u ON u.id=p.user_id WHERE u.is_active),'{}'::jsonb)
  ) INTO result;
  RETURN result;
END $$;
-- set_my_internal_card_color y el trigger no cambian: delegan en ensure_internal_card_color.
REVOKE ALL ON FUNCTION public.internal_card_colors() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.internal_card_colors() TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
