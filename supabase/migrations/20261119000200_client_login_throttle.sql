-- M14 · Límite de intentos del ingreso de clientes (client-login).
-- Preparada en rama separada; requiere autorización antes de aplicarse en remoto.
-- Contadores por ventana de 15 minutos sobre claves SHA-256 calculadas en la Edge Function:
-- nunca se guardan RUC, usuario, IP ni contraseña en claro. Solo service_role puede invocarla.
BEGIN;

CREATE TABLE app_private.client_login_attempts (
  bucket text NOT NULL CHECK (bucket ~ '^(subject|ip):[0-9a-f]{64}$' OR bucket = 'global'),
  window_start timestamptz NOT NULL,
  hits integer NOT NULL DEFAULT 0 CHECK (hits >= 0),
  PRIMARY KEY (bucket, window_start)
);
ALTER TABLE app_private.client_login_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.client_login_attempts FROM PUBLIC, anon, authenticated, service_role;

-- Registra un intento antes de consultar al proveedor y devuelve false si se superó algún límite:
-- identidad (RUC + proveedor [+ usuario Quipu]) 10, IP 50 y global 2000 por ventana de 15 minutos.
CREATE FUNCTION public.client_login_throttle(p_subject_key text, p_ip_key text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  win timestamptz := date_bin('15 minutes', clock_timestamp(), timestamptz '2000-01-01 00:00:00+00');
  subject_hits integer; ip_hits integer; global_hits integer;
BEGIN
  IF p_subject_key IS NULL OR p_subject_key !~ '^[0-9a-f]{64}$' OR p_ip_key IS NULL OR p_ip_key !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid throttle key' USING ERRCODE = '22023';
  END IF;
  INSERT INTO app_private.client_login_attempts(bucket, window_start, hits) VALUES ('subject:' || p_subject_key, win, 1)
    ON CONFLICT (bucket, window_start) DO UPDATE SET hits = client_login_attempts.hits + 1 RETURNING hits INTO subject_hits;
  INSERT INTO app_private.client_login_attempts(bucket, window_start, hits) VALUES ('ip:' || p_ip_key, win, 1)
    ON CONFLICT (bucket, window_start) DO UPDATE SET hits = client_login_attempts.hits + 1 RETURNING hits INTO ip_hits;
  INSERT INTO app_private.client_login_attempts(bucket, window_start, hits) VALUES ('global', win, 1)
    ON CONFLICT (bucket, window_start) DO UPDATE SET hits = client_login_attempts.hits + 1 RETURNING hits INTO global_hits;
  IF random() < 0.02 THEN
    DELETE FROM app_private.client_login_attempts WHERE window_start < clock_timestamp() - interval '1 day';
  END IF;
  RETURN subject_hits <= 10 AND ip_hits <= 50 AND global_hits <= 2000;
END $$;

REVOKE ALL ON FUNCTION public.client_login_throttle(text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.client_login_throttle(text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
