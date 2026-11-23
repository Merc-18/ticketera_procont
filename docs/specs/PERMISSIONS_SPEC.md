# Roles y permisos efectivos

Revisión: **20/11/2026** · Código de referencia: **`c857a727c8e7640bbce8daada940f973acbf013e`**.

Fuente oficial de requisitos: [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md).

## Extensión local M16 — 23/11/2026

Base `a61450c`; M16 y M16b aplicadas en producción el 23/11/2026 ([activación](../validation/m16-activation-20261123/REPORT.md)). [Contrato](../validation/client-experience-contract-handoff.md),
[informe y pruebas](../../REPORT-backend-codex1.md). Matriz interna M1–M15 sin cambios.

| Operación | Permiso efectivo / alcance |
|---|---|
| client_subprojects | EXECUTE anon/authenticated/service_role, pero capacidad cliente vigente y producto permitido obligatorios. No grants nuevos de tablas. |
| Listado/detalle/reserva | Solo identidad propia; Quipu username exacto, QuipuFac cuenta empresarial compartida por RUC. Otro RUC/proveedor denegado. |
| Creación client_submit_request | Validación de sesión antes de replay; estudio desde empresa, producto/hijo activos y autorizados. No propietario elegido por navegador. |
| submit_client_request | Sigue sin EXECUTE para PUBLIC/anon/authenticated/service_role; wrapper propietario lo llama internamente. |
| Abrir sesión/emitir/canjear código | Firmas y ACL existentes: solo servidor técnico; snapshots privados validan username de capacidades nuevas. |
| requested_priority lectura interna | SELECT de requests y embedding existente bajo perfil activo/RLS. Prioridad administrativa y aprobación intactas. |
| Tablas privadas | RLS y ACL cerradas; funciones privadas nuevas también revocadas a PUBLIC. |

Los tests comprueban permisos efectivos y SELECT bajo roles reales PostgreSQL, no solo cadenas
REVOKE en SQL. Con grants SELECT/USAGE temporales de fixture, RLS privada sigue sin devolver filas
al público/externo. Dichos grants se retiran antes de terminar la prueba, nunca en remoto.


## Capas que no se deben confundir

1. **Frontend:** visibilidad, botones y `canEdit/canManageProfile` facilitan uso; no autorizan al servidor.
2. **PostgREST/ACL:** `authenticated` es un rol de transporte compartido por identidades Auth; no es el rol funcional admin/developer. `anon` puede invocar RPC cliente con capacidad válida.
3. **RLS y columnas:** `public.users` activo y rol funcional condicionan tablas; grants de columnas impiden escrituras no previstas.
4. **RPC SECURITY DEFINER:** validan `app_private.require_role` o sesión cliente; search_path vacío; invocación interna del propietario preserva M13 con M15.
5. **Edge:** `admin-users` valida Auth real y actor; `client-login` valida proveedor/código/secreto. La credencial de servidor es un medio técnico, nunca una identidad superadmin.

Todos los permisos siguientes requieren perfil activo, salvo acceso público y capacidades cliente. La política es workspace compartido para personal: asignación no es una ACL de lectura. [Implementación](../../src/lib/access.ts), M2/M5/M12/M13/M15.

| Operación | superadmin | admin | developer | viewer | Cliente autenticado | Público |
|---|---|---|---|---|---|---|
| Leer tablero/proyectos/solicitudes e historial interno | Sí | Sí | Sí | Sí | No | No |
| Crear INT nuevo Development | Sí | Sí | Sí | No | No | No |
| submit_request / submit_classified_request | Sí | Sí | Sí por RPC; sin importador UI | No | No | No |
| Aprobar, clasificar, rechazar, iniciar revisión | Sí | Sí | No | No | No | No |
| Asignación/reasignación/retiro, no bloqueado | Sí | Sí | Sí | No | No | No |
| Reasignar bloqueado | Sí | Sí | No | No | No | No |
| Mover fase / Done con condiciones / reabrir con motivo | Sí | Sí | Sí | No | No | No |
| Checklist CRUD | Sí | Sí | Sí | No | No | No |
| Comentarios y evidencias internas | Sí | Sí | Sí | Solo lectura | No | No |
| Bloquear/desbloquear/corregir motivo | Sí | Sí | Sí | No | No | No |
| Prioridad y bulk prioridad/archivado (1..100) | Sí | Sí | Sí | No | No | No |
| Archivar / restaurar archived | Sí | Sí | Sí | No | No | No |
| Restaurar deleted histórico | Sí | Sí | No | No | No | No |
| Borrar físicamente proyecto o auditoría | No | No | No | No | No | No |
| Crear nuevos Administrative/Dual o cambiar tipo existente | No | No | No | No | No | No |
| Editar catálogos/estudios/áreas/tipos | Sí | No | No | No | No | No |
| Administrar roles admin/superadmin | Sí | No | No | No | No | No |
| Crear/invitar/activar developer o viewer | Sí | Sí, objetivo permitido | No | No | No | No |
| Asociar RUC→estudio | Sí | Sí | No | No | No | No |
| Métricas de tiempo / exportación de proyectos visibles | Sí | Sí | Sí | Sí | No | No |
| Urgencias por solicitante/estudio | Sí | Sí | No | No | No | No |
| Crear solicitud por client_submit_request | Con capacidad cliente propia, no por rol interno | Igual | Igual | Igual | Sí, capacidad M13 | No sin capacidad |
| Mis tickets/detalle cliente | Solo con su capacidad cliente | Igual | Igual | Igual | Solo identity_id propio | No |
| Rastrear por REQ | Sí | Sí | Sí | Sí | Sí | Sí, número/estado |
| Leer nombres de catálogos activos públicos | Sí | Sí | Sí | Sí | Sí | Sí, columnas limitadas |
| Leer RUC/códigos por catálogo público | Interno bajo RLS | Interno bajo RLS | Interno bajo RLS | Interno bajo RLS | No por anon | No |

### Administración de cuentas

`authorize_account_actor` exige superadmin/admin activo; admin solo solicita roles developer/viewer y no cambia objetivos administrativos. `set_account_permissions` no permite quitar el último superadmin activo. Activar exige correo Auth confirmado. Perfil propio puede editar full_name por columna, no su rol/is_active. Crear/invitar usa job idempotente, actor validado y RPC solo de servidor. No hay username interno adicional al correo; el deseo histórico de uno no está implementado.

### M15: ACL final y guarda de aplicación

| Función | PUBLIC | anon | authenticated | service_role | Condición real |
|---|---|---|---|---|---|
| `submit_client_request(jsonb,uuid)` | No | No | No | No | Helper solo invocable por propietario autorizado internamente. |
| `submit_request(jsonb,uuid)` | No | No | EXECUTE | No | Perfil activo superadmin/admin/developer antes de assert_payload/replay. |
| `submit_classified_request(jsonb,jsonb,uuid)` | No | No | EXECUTE | No | Misma guarda, antes de idempotencia. |
| `client_submit_request(text,jsonb,uuid)` | No | EXECUTE | EXECUTE | EXECUTE | Capacidad cliente, vigencia, revocación, propiedad, productos y estudio M13. |
| `client_open_session`, `client_issue_entry_code`, `client_exchange_entry_code` | No | No | No | EXECUTE | Solo backend; identidad validada por Edge. |
| `client_login_throttle(text,text)` | No | No | No | EXECUTE | Buckets acotados y formato validado M14. |

`PUBLIC` es la pertenencia implícita PostgreSQL, no la tabla/esquema public ni un permiso frontend. Revocar solo a anon no basta si PUBLIC sigue concediendo EXECUTE. En esta activación se comprobaron ACL efectivas y denegaciones SQL/HTTP. El propietario de M13 y helper antiguo es `postgres`, por lo que el wrapper SECURITY DEFINER sigue autorizado aunque el llamador original sea anon.

### RLS, storage y auditoría

Tablas `app_private.client_*`, jobs administrativos, contextos de comandos y reservas no conceden lectura/escritura directa a roles app. El rol técnico de servidor tampoco obtiene acceso directo por esos grants; las RPC definer encapsulan operaciones. `service_role` tiene capacidades técnicas de plataforma que no deben confundirse con garantía de aislamiento frente a un propietario SQL.

Storage público no: bucket privado, lectura por personal interno activo. INSERT solo por ruta reservada; reserva interna ligada a actor editor; clientes reciben reserva tras capacidad de sesión/propiedad. El trigger final verifica tamaño/MIME incluso si el servicio realiza la escritura privilegiada final. Las cuotas compartidas no se eluden subiendo por otro adaptador.

Historial: INSERT autorizado por funciones/triggers, UPDATE/DELETE/TRUNCATE bloqueados para aplicación; FK RESTRICT preservan actores y relaciones. Un superadmin funcional no es propietario del motor PostgreSQL.

## Alcance de verificación

M15 remoto: anon y perfil externo sin registro no ejecutan creador antiguo/RPC internas; superadmin alcanza validación sin crear datos. Se revisó que guardas preceden replay y que M13/M14 mantienen cuerpo. Las cuentas reales admin/developer/viewer/inactivas no estaban disponibles: **prueba con esas cuentas remotas NO VERIFICADA**. Sí están cubiertas por fixtures de PostgreSQL aislado M15/integración; no presentar esa simulación de identidad como login remoto real. Detalle en [TESTING_SPEC.md](TESTING_SPEC.md).
