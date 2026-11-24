-- M20 (24/11/2026, LOCAL — requiere autorización antes de aplicarla en remoto): confirmar una solicitud asignando
-- Portafolio → Proyecto/Iniciativa en la misma transacción.
-- Requiere M19. Solo añade una función; no cambia tablas, datos ni funciones existentes.
--   p_portfolio = {"mode":"independent"}                       → ticket independiente (auditado, sin asociación)
--   p_portfolio = {"mode":"portfolio","portfolio_id":…,"initiative_id":…|null}
-- Reutiliza approve_request (rol admin/superadmin, idempotencia, notificaciones) y set_project_portfolio
-- (validación de pertenencia y actividad, auditoría `portfolio_changed`). Si cualquier paso falla, no queda ni el
-- proyecto ni una asociación parcial.
BEGIN;

DO $$ BEGIN
  IF to_regprocedure('public.set_project_portfolio(uuid,uuid,uuid)') IS NULL OR to_regprocedure('public.approve_request(uuid,jsonb,uuid)') IS NULL THEN
    RAISE EXCEPTION 'M20 requires M19' USING ERRCODE='55000';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.approve_request_with_portfolio(p_request_id uuid,p_payload jsonb,p_portfolio jsonb,p_idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb; proj jsonb; pid uuid; v_mode text; v_portfolio uuid; v_initiative uuid; input jsonb;
BEGIN
  PERFORM app_private.require_role(ARRAY['superadmin','admin']);
  PERFORM app_private.assert_payload(p_portfolio,ARRAY['mode','portfolio_id','initiative_id']);
  IF p_idempotency_key IS NULL THEN RAISE EXCEPTION 'Idempotency key required' USING ERRCODE='22023'; END IF;
  v_mode:=p_portfolio->>'mode';
  v_portfolio:=nullif(p_portfolio->>'portfolio_id','')::uuid;
  v_initiative:=nullif(p_portfolio->>'initiative_id','')::uuid;
  IF v_mode='independent' THEN
    IF v_portfolio IS NOT NULL OR v_initiative IS NOT NULL THEN
      RAISE EXCEPTION 'Un ticket independiente no lleva portafolio ni proyecto' USING ERRCODE='22023'; END IF;
  ELSIF v_mode='portfolio' THEN
    -- Proyecto sin portafolio no: el portafolio se indica siempre y debe contener al proyecto.
    IF v_portfolio IS NULL THEN RAISE EXCEPTION 'Selecciona el portafolio' USING ERRCODE='22023'; END IF;
  ELSE
    RAISE EXCEPTION 'Elige un portafolio o «Ticket independiente»' USING ERRCODE='22023';
  END IF;
  input:=jsonb_build_object('request_id',p_request_id,'payload',p_payload,'portfolio',p_portfolio);
  result:=app_private.replay('approve_request_with_portfolio',p_idempotency_key,input);
  IF result IS NOT NULL THEN RETURN result; END IF;

  proj:=public.approve_request(p_request_id,p_payload,md5(p_idempotency_key::text||':approve')::uuid);
  pid:=(proj->>'id')::uuid;
  IF v_mode='portfolio' THEN
    PERFORM public.set_project_portfolio(pid,v_portfolio,v_initiative);
  ELSE
    INSERT INTO public.activity_logs(project_id,user_id,action,details)
      VALUES(pid,auth.uid(),'portfolio_independent',jsonb_build_object('source','approval'));
  END IF;
  SELECT to_jsonb(p) INTO result FROM public.projects p WHERE p.id=pid;
  RETURN app_private.remember('approve_request_with_portfolio',p_idempotency_key,input,result);
END $$;
REVOKE ALL ON FUNCTION public.approve_request_with_portfolio(uuid,jsonb,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.approve_request_with_portfolio(uuid,jsonb,jsonb,uuid) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
