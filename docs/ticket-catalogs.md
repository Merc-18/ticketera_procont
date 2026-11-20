# Catálogos y clasificación de tickets

> **Revisión documental 20/11/2026 · base `c857a727c8e7640bbce8daada940f973acbf013e` · clasificación: ACTUAL.**
> Fuente oficial: [PRODUCT_REQUIREMENTS](specs/PRODUCT_REQUIREMENTS.md); estado operativo: [PROJECT_STATUS](PROJECT_STATUS.md).
> M7 aplicada; el cliente actual no elige estudio/subproyecto/área. Estudio deriva de M13; clasificación de admin/superadmin. RUC ambiguo requiere asociación explícita y no fusiona estudios. Reglas de catálogos permanecen vigentes.

## Alcance del documento anterior

El contenido siguiente conserva sus fechas y evidencias originales. Los estados de activación o contratos sustituidos no se consideran vigentes; prevalecen las especificaciones enlazadas arriba.

Título original conservado como contexto: **Catálogos y clasificación de tickets — activos en Supabase**.

18/11/2026. Migración nueva [`20261118000300_ticket_catalogs.sql`](../supabase/migrations/20261118000300_ticket_catalogs.sql).
Las seis migraciones previas no cambian. **Aplicada y verificada** el 18/11/2026 con Supabase CLI:
historial 7/7, RLS, catálogos cargados (7/8/9/14/5/14). Evidencia:
[`ticket-catalogs-remote.json`](validation/ticket-catalogs-remote.json); verificación reutilizable
`supabase/recovery/ticket_catalogs_check.sql`.

## Catálogos (datos suministrados por Procont Business)

| Catálogo | Tabla | Contenido inicial |
|---|---|---|
| Proyectos (sistemas) | `catalog_systems` | Quipu, Quipu_Fac, Quipu_Gestion, Negmin, Quipu_AI (subproyecto obligatorio); Otros, Soporte tecnico (sin subproyecto) |
| Subproyectos | `catalog_subsystems` | Quipu: Escritorio · Quipu_Fac: Escritorio, Web, Android · Quipu_Gestion: Web · Negmin: Web, Android · Quipu_AI: Web |
| Estudios | `studios` | 9 estudios con nombre visible y RUC |
| Códigos internos | `studio_codes` | 14 códigos (ARAPA … ZUSAN), cada uno ligado a su estudio |
| Áreas / subáreas | `areas` (+ `code`, `studio_id`, `parent_id`) | Solo BUSINESS ACCOMPANYING SAC: C000 CONTABILIDAD (C001–C012), L000 LEGAL (L001), G000 GERENCIA (G001), AD00 ADMINISTRACIÓN, CB00 CAJA Y BANCOS |

`catalog_systems` es independiente de `public.projects` (proyectos operativos del tablero).

**Para confirmar:** BUSINESS ACCOMPANYING SAC e INVERSIONES Y SERVICIOS MULTIPLES SAN ROMAN SA
comparten el RUC 20602111602. Se conservan tal como en la fuente, como estudios separados
(SANROMAN es código del segundo), con observación pendiente (`review_note`) visible en
Catálogos; no bloquea la implementación ni se fusionó o corrigió.

## Flujo

> **Actualizado por 20261118000400:** el cliente ya no elige subproyecto ni área; la
> clasificación se hace al validar. Ver [solicitudes](request-intake.md).

- **Crear ticket** (formulario público): Estudio (nombres únicos, sin RUC ni códigos) →
  Proyecto → Subproyecto (si existe/obligatorio) → Área y Subárea solo si el estudio tiene
  áreas (hoy, BUSINESS ACCOMPANYING SAC: **área obligatoria, subárea opcional**). Otros
  estudios crean tickets **sin área**. RPC `submit_classified_request` con contrato propio
  (no acepta `requester_area`): Estudio, Proyecto, Subproyecto, Área, Subárea y Código
  interno son columnas independientes. El texto histórico `requester_area` recibe solo el
  nombre del área principal, o NULL; nunca el nombre del estudio. `submit_request` y los
  datos históricos no cambian.
- **Filtros:** Estudio es un filtro propio en Requests, Kanban y Dashboard, separado del
  filtro Área.
- **Validar** (Requests, admin/superadmin): el responsable elige el código interno del
  estudio (`assign_request_studio_code`) y acepta o rechaza. Un trigger exige el código antes
  de la decisión en tickets clasificados, lo congela después y hace inmutable la clasificación
  original. Se guardan `studio_code_id`, `classified_by`, `classified_at`.
- Solicitudes anteriores sin clasificación siguen el flujo previo, sin cambios.

## Administración y seguridad

**Equipo → 🗂 Catálogos** (solo superadmin): estudios + códigos, proyectos + subproyectos,
áreas + subáreas por estudio; agregar, editar, activar/desactivar. Sin borrado (no hay DELETE).
RLS: escritura solo superadmin; anon lee nombres activos de estudios/proyectos/áreas (nunca
RUC ni códigos); miembros activos leen códigos activos; FKs impiden huérfanos.

## Validación

27 comprobaciones nuevas en PostgreSQL 17.12 aislado (`supabase/tests/ticket_catalogs_local.py`,
[evidencia](validation/ticket-catalogs-local.json)). Build correcto. Sin la migración, el
formulario conserva el área en texto libre y Catálogos muestra el aviso de migración pendiente.

## Pendientes

- Confirmar el RUC compartido BUSINESS ACCOMPANYING SAC / SAN ROMAN (observación visible en Catálogos).
- Primer ticket real: comprobará de punta a punta el envío clasificado y la validación con código.
