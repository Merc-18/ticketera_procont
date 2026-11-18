-- Ticketera Procont: primer superadministrador (ejecución única, SQL Editor del Dashboard).
-- Requisito: el usuario ya creado en Authentication → Users con «Auto Confirm User».
-- Sin contraseñas ni claves. Atómico: si cualquier comprobación falla, no cambia nada.
-- Reutiliza app_private.bootstrap_superadmin (migración 20261118000100), que solo
-- funciona si nunca se usó el bootstrap, no hay perfiles y existe exactamente un
-- usuario Auth con correo confirmado. Ejecutarlo de nuevo siempre falla.
DO $$
DECLARE
  v_email constant text := 'milton.rios@procontbusiness.com';
  v_name  constant text := 'Milton Rios';
  v_total int;
  v_id    uuid;
BEGIN
  SELECT count(*) INTO v_total FROM auth.users;
  IF v_total <> 1 THEN
    RAISE EXCEPTION 'Debe existir exactamente 1 usuario en Auth (hay %). No se cambió nada.', v_total;
  END IF;
  SELECT id INTO v_id FROM auth.users
   WHERE lower(email) = v_email AND email_confirmed_at IS NOT NULL;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'El usuario Auth no es % o su correo no está confirmado. No se cambió nada.', v_email;
  END IF;
  PERFORM app_private.bootstrap_superadmin(v_id);   -- crea perfil, superadmin activo, marca de un solo uso
  UPDATE public.users SET full_name = v_name WHERE id = v_id;
END $$;

-- Verificación (solo booleanos y conteos). Todo debe ser true / 1.
SELECT
  EXISTS (SELECT 1 FROM public.users u JOIN auth.users a ON a.id = u.id
          WHERE lower(a.email) = 'milton.rios@procontbusiness.com' AND u.email = a.email
            AND u.full_name = 'Milton Rios' AND u.role = 'superadmin' AND u.is_active
            AND a.email_confirmed_at IS NOT NULL)                              AS superadmin_ok,
  EXISTS (SELECT 1 FROM app_private.account_bootstrap b JOIN public.users u ON u.id = b.subject_id
          WHERE lower(u.email) = 'milton.rios@procontbusiness.com')            AS bootstrap_bloqueado,
  (SELECT count(*) FROM auth.users)                                            AS usuarios_auth,
  (SELECT count(*) FROM public.users WHERE role = 'superadmin' AND is_active)  AS superadmins_activos;
