# Migraciones de Ticketera Procont

**Vigente 2B.3D:** M3 revisada, [manifiesto](../docs/validation/fase-2b3d-migrations.json)
y [resolución de bloqueos](../docs/fase-2b3d-resolucion-bloqueos.md). No se crean
triggers propios en Auth. La provisión de perfil es privada y explícita; cambios
de correo requieren refresco administrativo. El historial lo inicializa la CLI;
la compensación no lo edita y genera un plan aparte de repair nativo posterior.
No se ejecutaron estas operaciones remotamente. No aplicar el hash M3 anterior.

La única secuencia nueva de migraciones está en `migrations/`, ordenada por el
prefijo de versión. Está diseñada para un Supabase vacío, con `auth.users`,
`auth.uid()` y los roles de plataforma ya existentes.

1. `20261117000100_schema.sql`: tablas, restricciones, índices y cierre inicial
   de acceso. No contiene cuentas ni registros de negocio.
2. `20261117000200_security.sql`: permisos de columnas y políticas RLS.
3. `20261117000300_operations.sql`: funciones transaccionales, triggers,
   integración Auth, relaciones PostgREST y publicación Realtime.
4. `20261117000400_reference_checklists.sql`: 35 pasos genéricos de checklist,
   configurables por administradores. No contiene datos empresariales.

Cada archivo es transaccional y debe aplicarse una vez mediante un historial de
migraciones. No ejecutar sobre un esquema de negocio existente ni sustituir el
historial con `IF NOT EXISTS`. No ejecutar los SQL históricos de la raíz.

`tests/` contiene exclusivamente soporte y registros ficticios para PostgreSQL
aislado. `tests/support/auth_stub.sql` NO es una migración y NO debe aplicarse a
Supabase: simula solo la parte mínima de Auth utilizada por las pruebas.

En FASE 2A no se ha configurado un enlace remoto, creado `.env.local`, llamado a
Supabase ni aplicado estas migraciones fuera del clúster temporal de pruebas.
No hay credenciales ni un identificador de proyecto remoto en este directorio.

El esquema, la matriz RLS, los contratos de RPC, la reproducción de pruebas y
los requisitos de integración están en
[docs/fase-2a-supabase.md](../docs/fase-2a-supabase.md).

## Independencia organizacional — FASE 2B.3C

Las cuatro migraciones se revisaron sin ejecutar SQL ni repetir pruebas. No
contienen áreas de Gilat, nombres de personas, correos corporativos, cuentas,
contraseñas, datos demo ni un catálogo de SLA por área/producto. Conservan los
roles genéricos `superadmin`, `admin`, `developer` y `viewer`; no asignan esos
roles a personas concretas. Las funciones de provisión/bootstrap solo se definen,
no se invocan al aplicar los archivos.

`requests.requester_area` es texto de hasta 200 caracteres, sin ENUM, lista
CHECK ni FK a áreas heredadas. La solicitud pública exige un valor no vacío;
el alta interna y la edición admiten que no esté definido. Esto mantiene el
esquema abierto a valores futuros, pero no implementa un catálogo administrable
de áreas. Su gestión y nombres se decidirán con el propietario, sin nuevas tablas
ni formularios en esta fase.

El SQL conserva fechas SLA recibidas, el límite de días formales 1–3650 y el
comportamiento de prioridad baja sin SLA en la aprobación. Son comportamientos
existentes por revisar con el propietario; no se consideran una política de
Procont aprobada. La matriz de tipos/plazos y factores heredados sigue solo en
frontend y no se copia al backend.

No se alteraron archivos SQL ni hashes. El
[procedimiento de recuperación 2B.3B](../docs/fase-2b3b-recovery-plan.md) sigue
vigente, con sus condiciones remotas pendientes. El inventario organizacional y
las decisiones pendientes están en
[FASE 2B.3C](../docs/fase-2b3c-adaptacion-procont.md). Esta revisión no autoriza
migraciones, cuentas ni bootstrap.

# Administración de cuentas activa

La migración `20261118000100_account_administration.sql` está **aplicada** (con
`scripts/apply_account_administration.py` y verificación `recovery/account_admin_check.sql`)
y la función `functions/admin-users` está **desplegada** (v1, ACTIVE). Las
cuatro migraciones iniciales permanecen intactas. Operación y bootstrap privado:
[procedimiento](../docs/account-administration.md). No usar los ejecutores de
cuatro migraciones ni sus bundles para aplicar o revertir esta ampliación.

# Catálogo de áreas activo

`migrations/20261118000200_areas.sql` está **aplicada** (CLI `db push --remote`).
Próximas migraciones: `db push --remote --dry-run`, captura de solo lectura, `db push --remote --yes`. Ver [áreas](../docs/areas.md).

# Catálogos de tickets activos

`migrations/20261118000300_ticket_catalogs.sql` está **aplicada** (CLI `db push --remote`);
verificación con `recovery/ticket_catalogs_check.sql`.
Ver [catálogos y clasificación](../docs/ticket-catalogs.md).

# Formulario del cliente y validación

`migrations/20261118000400_request_intake.sql` está **aplicada**. Verificación: `recovery/request_intake_check.sql`.
Ver [solicitudes](../docs/request-intake.md).

# Seguridad de tickets (M9)

`migrations/20261118000500_ticket_security.sql` está **aplicada**. Verificación: `recovery/ticket_security_check.sql`.
Ver [seguridad de tickets](../docs/ticket-security.md).

# Trazabilidad (M10)

`migrations/20261118000600_request_tracking.sql` está **aplicada**. Verificación: `recovery/request_tracking_check.sql`.

# Métricas (M11)

`migrations/20261118000700_business_metrics.sql` está **aplicada**. Verificación: `recovery/business_metrics_check.sql`.
