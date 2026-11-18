-- Prepared only. Requires separate authorization before remote application.
-- Catálogo de áreas de Procont Business: empieza vacío; no se precargan áreas.
-- requests.requester_area sigue siendo texto: los datos existentes no cambian.
BEGIN;

CREATE TABLE public.areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (name = btrim(name) AND length(name) BETWEEN 1 AND 200),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid DEFAULT auth.uid() REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX areas_name_unique_idx ON public.areas (lower(name));
CREATE INDEX areas_active_name_idx ON public.areas (name) WHERE is_active;
CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.areas
  FOR EACH ROW EXECUTE FUNCTION app_private.touch_updated_at();

ALTER TABLE public.areas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.areas FROM PUBLIC, anon, authenticated, service_role;

-- Lectura: áreas activas para el formulario público y miembros activos;
-- el superadmin ve también las desactivadas.
CREATE POLICY areas_public_read ON public.areas FOR SELECT TO anon USING (is_active);
CREATE POLICY areas_member_read ON public.areas FOR SELECT TO authenticated
  USING (is_active AND (SELECT app_private.has_role(ARRAY['superadmin','admin','developer','viewer'])));
CREATE POLICY areas_superadmin_read ON public.areas FOR SELECT TO authenticated
  USING ((SELECT app_private.has_role(ARRAY['superadmin'])));

-- Escritura: solo superadmin activo. Sin DELETE: las áreas se desactivan.
CREATE POLICY areas_superadmin_insert ON public.areas FOR INSERT TO authenticated
  WITH CHECK ((SELECT app_private.has_role(ARRAY['superadmin'])) AND created_by = (SELECT auth.uid()));
CREATE POLICY areas_superadmin_update ON public.areas FOR UPDATE TO authenticated
  USING ((SELECT app_private.has_role(ARRAY['superadmin'])))
  WITH CHECK ((SELECT app_private.has_role(ARRAY['superadmin'])));

GRANT SELECT (id, name, is_active) ON public.areas TO anon;
GRANT SELECT ON public.areas TO authenticated;
GRANT INSERT (name, is_active) ON public.areas TO authenticated;
GRANT UPDATE (name, is_active) ON public.areas TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
