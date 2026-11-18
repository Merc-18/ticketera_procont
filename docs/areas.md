# Catálogo de áreas — activo en Supabase

18/11/2026. Migración nueva [`20261118000200_areas.sql`](../supabase/migrations/20261118000200_areas.sql)
(las cinco anteriores no cambian). **Aplicada y verificada** el 18/11/2026 con
Supabase CLI (`db push --remote`): historial 6/6, RLS, 5 políticas, sin DELETE ni
escritura anónima, catálogo vacío. Evidencia: [`areas-remote.json`](validation/areas-remote.json). Catálogo vacío:
no se copian áreas de Gilat ni se crean áreas de Procont.

## Modelo y seguridad

- `public.areas`: `name` único sin distinguir mayúsculas (1–200, sin espacios
  extremos), `is_active`, `created_by` (= `auth.uid()`, no falsificable), fechas.
- RLS: anon y miembros activos leen solo áreas activas (anon solo `id,name,is_active`);
  el superadmin activo lee todas, crea, edita y desactiva. Sin DELETE para nadie.
  Admin, developer, viewer y perfiles inactivos no pueden escribir.
- `requests.requester_area` sigue siendo texto: solicitudes existentes intactas.
  Desactivar o renombrar un área no modifica solicitudes anteriores.

## Interfaz

- **Equipo → 🏷 Áreas** (solo superadmin): agregar, editar nombre, desactivar/reactivar.
- Formularios (solicitud pública, nuevo proyecto, edición de proyecto, importador
  Planner): selector con las áreas activas; un valor histórico fuera del catálogo
  se conserva como «(histórica)». Con catálogo vacío o migración no aplicada,
  se mantiene el texto libre anterior.
- Filtros de Dashboard y Kanban: áreas activas + áreas presentes en los datos.
- Se eliminó la constante `AREAS` del frontend.

## Validación

16 comprobaciones nuevas en PostgreSQL 17.12 aislado (`supabase/tests/areas_local.py`),
evidencia en [`areas-local.json`](validation/areas-local.json). Build correcto.

## Siguiente paso

El superadmin crea las áreas oficiales en **Equipo → 🏷 Áreas**. Con al menos una
activa, los formularios cambian de texto libre a selector.

## Procedimiento para próximas migraciones

Usar Supabase CLI con la autenticación y el enlace existentes (sin contraseña
PostgreSQL en scripts): `supabase db push --remote --dry-run` (confirmar destino y
única pendiente) → captura privada de `supabase/recovery/inventory.sql` con
`db query --remote --read-only` → `supabase db push --remote --yes` → verificación
de solo lectura. `scripts/apply_areas.py` (ruta con contraseña) queda como
alternativa histórica, no necesaria.
