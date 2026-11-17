# FASE 2B1 — Integración local de consumidores Supabase

**Integración vigente tras 2B.3D:** la provisión/refresco de perfil es ahora
administrativa y explícita, sin trigger propio en Auth. El frontend permanece
intacto: antes de permitir login debe existir el perfil autorizado; su ausencia
deniega acceso. Véase [resolución de bloqueos](fase-2b3d-resolucion-bloqueos.md).

Fecha: 17/11/2026. Base: `1599d97` (FASE 2A), con FASE 1 en `827489b`.

## Resultado y alcance

Se adaptó la aplicación existente a las operaciones y permisos de FASE 2A.
No se modificaron las migraciones ni las dependencias. No se cambió la
identidad visual ni se definieron nuevas áreas, usuarios o reglas empresariales.
No se repitieron las 72 comprobaciones SQL ni la auditoría inicial.

**Continuación organizacional 2B.3C:** la conservación del frontend no supone
adoptar la estructura empresarial anterior. Sus áreas, área fija del importador,
textos y parámetros de SLA están inventariados en
[adaptación Procont](fase-2b3c-adaptacion-procont.md), pendientes de decisiones del
propietario y de una fase posterior de frontend. El backend no impone esas áreas
ni correos. No se cambian consumidores ni se repiten las 19 pruebas en 2B.3C.

La integración está validada por compilación y por pruebas de consumidores con
dobles de SDK y transporte HTTP simulado. No está validada contra Supabase real
ni mediante recorridos en navegador. No hay `.env.local`, enlace CLI remoto,
cuentas reales creadas ni migraciones aplicadas desde esta fase.

## Consumidores modificados

| Grupo de archivos | Adaptación |
|---|---|
| `src/lib/operations.ts`, `api.ts`, `rpc-attempt.ts` | Adaptadores RPC, payloads acotados, validación de constancias e idempotencia por intención |
| `useProjects`, `NewProjectModal`, `KanbanBoard` | Alta manual por RPC; tipo de proyecto por RPC separada; comprobar escrituras y mostrar errores |
| `useRequests`, `PublicRequestForm`, `RequestInbox` | Registro, aprobación y rechazo por RPC; SLA enviado a aprobación; bandeja solo con carga interna explícita |
| `PlannerImportModal` | RPC por fila, intento independiente, selección de fallidas y errores parciales visibles |
| `RequestTracking`, `tracking-handoff.ts` | Número completo + token; solo `track_request`; se muestran únicamente campos públicos disponibles |
| `ProjectModal` | Datos del solicitante por `update_request_details`; se retiró la creación auxiliar de solicitudes y vínculos desde el cliente |
| `useChecklist`, `ChecklistSection` | Validar filas afectadas; fechas de completado del servidor; errores de progreso/orden explícitos; controles según rol |
| `PapeleraView` | Purga mediante `purge_project`; restauración comprobada por fila |
| `access.ts`, `auth-controller.ts`, `useAuth`, `ProtectedRoute`, `App` | Perfil activo, estado de sesión compartido, callbacks Auth sin consultas esperadas dentro del callback, cierre y errores de sesión |
| `useUsers`, `UserManagementPanel`, `UserModal`, `ProjectCard` | Roles/activación por RPC; responsables activos con permisos de editor; límites de provisión Auth reflejados en controles |
| `useNotifications`, `NotificationBell`, `useSlaWarnings` | Lectura y marcado propios; errores explícitos; avisos SLA limitados al actor asignado |
| `usePendingCount` | Sondeo autorizado cada 30 s y al enfocar, porque FASE 2A no publica `requests` en Realtime |
| `useActivityLog`, `ActivitySection`, `CommentsSection`, `notifications.ts` | Autoría desde sesión del servidor y fallos visibles de historial/notificación |
| `supabase-config.ts`, `supabase.ts`, `supabase-errors.ts`, `main.tsx` | Validación de configuración, inicialización diferida y manejo común de errores |
| `database.types.ts` | Nulabilidad necesaria para datos y borrado explícito de fechas/bloqueos |
| `.env.example`, `.gitignore`, README | Clave publicable, exclusión de estado local CLI y documentación |
| `tests/consumers.test.mjs`, `docs/validation/fase-2b1-*.txt` | Pruebas nuevas y evidencias |

Los componentes mantienen su estructura. Los cambios visibles necesarios son el
campo de token, su constancia de entrega, errores y controles no autorizados
deshabilitados. Se retiraron del seguimiento los datos personales, descripción,
observaciones y fecha solicitada que la nueva RPC deliberadamente no devuelve.
No se sustituyeron por valores inventados ni se abrieron consultas públicas.

## Contratos consumidos

- Alta manual: `create_internal_project(p_payload, p_idempotency_key)`.
- Solicitud pública o importada: `submit_request(p_payload, p_idempotency_key)`.
- Aprobación: `approve_request(p_request_id, p_payload, p_idempotency_key)`.
- Rechazo: `reject_request(p_request_id, p_reason)`.
- Cambio de flujo: `change_project_type(p_project_id, p_project_type)`.
- Área/nombre del solicitante: `update_request_details(p_request_id, p_area, p_requester_name)`.
- Permisos: `admin_update_user(p_user_id, p_role, p_is_active)`.
- Purga: `purge_project(p_project_id)`.
- Seguimiento: `track_request(p_request_number, p_tracking_token)`.

Se eliminó del navegador la generación INT mediante lectura/orden de números,
la inserción de proyectos y flujos por pasos, los checklist predeterminados de
aprobación y la actualización directa de estado/enlace de solicitudes. Esos
efectos pertenecen a las RPC. Los eventos `created`, `sla_started` y las
notificaciones de aprobación tampoco se duplican desde el consumidor.

La aprobación conserva el cálculo existente en `sla-config.ts` por compatibilidad
con FASE 2A y envía `sla_formal_days` y `sla_target_date`. La revisión 2B.3C
mantiene ese contrato técnico; los valores heredados de SLA siguen pendientes de
aprobación por el propietario. No se introdujo otro catálogo o cálculo de
numeración/checklist.

Los payloads se construyen con campos permitidos: no se propagan IDs, números,
estado aprobado ni enlaces que pudiera contener un objeto del formulario.
Las fechas vacías se envían como NULL. Para limpiar fechas, asignaciones o
bloqueos existentes se envía NULL explícito, no `undefined` que JSON omitiría.

## Reintentos, confirmación y errores

Cada formulario manual, formulario público, aprobación abierta o fila del
importador conserva un `RpcAttempt`. Una entrada normalizada mantiene su UUID
durante errores/reintentos y comparte la petición en curso. Después de una
confirmación, repetir esa misma intención devuelve el resultado ya reconocido.
Otra instancia de formulario/fila obtiene otra clave aunque los campos sean
idénticos. La fecha base del cálculo de SLA queda fija durante ese intento.

Las claves y payloads se conservan solo en memoria; no sobreviven al cierre del
formulario, recarga o cambio de sesión. Ante un resultado de transporte incierto
se debe reintentar en el mismo formulario sin cambiar datos. Si se cerró, el
operador debe revisar la bandeja/tablero antes de repetir la operación. El
servidor sigue siendo responsable de las garantías transaccionales.

Las escrituras ordinarias que admiten devolución de fila usan
`.select('id').single()` o comprueban la cantidad afectada. Una respuesta vacía
filtrada por RLS no se muestra como guardado. Las RPC void aceptan una respuesta
exitosa con `data=null`; su campo `error` siempre se comprueba.

Un fallo de recarga posterior a una alta confirmada se muestra como error de
lectura y no convierte la operación ya confirmada en una nueva alta. Los errores
de permisos, funciones inexistentes y restricciones reciben mensajes visibles.
No se muestran los `details` de Supabase ni se registran tokens o payloads.

Las ediciones ordinarias de proyecto, cambio de tipo, datos del solicitante,
historial y avisos siguen siendo operaciones distintas donde FASE 2A no ofrece
una RPC combinada. Si alguna parte ya se guardó, el mensaje lo indica y se
recargan los datos cuando corresponde. No se afirma atomicidad para esas
ediciones combinadas.

El checklist también conserva escrituras separadas de tarea y progreso:
si la tarea quedó guardada y falló el progreso, se comunica expresamente. El
texto de alta se limpia si la tarea ya existe, evitando invitar a repetirla.
El orden se recarga si solo se confirmó parte del reordenamiento. Los controles
de esta sección bloquean acciones solapadas en la misma instancia. Todavía no
hay una RPC atómica de progreso/reordenamiento entre varios usuarios.

## Seguimiento público

La constancia de `submit_request` se valida y muestra número y token. Ambos
deben guardarse por el solicitante. El botón de seguimiento realiza un traspaso
volátil dentro de la SPA, sin incluir el token en URL, parámetros de búsqueda,
estado de historial ni almacenamiento persistente. No hay búsqueda automática:
el usuario confirma el formulario de seguimiento.

`RequestTracking` no consulta `requests`, `projects` ni `project_flows`. Solo usa
`track_request`, acepta números completos de cualquier año y más de tres cifras
de contador. NULL significa que no coinciden número/token; un error HTTP/RPC se
muestra como fallo de consulta, sin confundirlo con solicitud inexistente.

El token se introduce en un campo de contraseña. Se muestra únicamente el
estado, fechas públicas disponibles, motivo de rechazo y avance por flujo.
No hay recuperación de token por número solo; su entrega/recuperación por otro
canal requiere una decisión posterior de producto y seguridad.

## Autenticación y roles

Los consumidores comparten una única suscripción Auth. El callback no espera
consultas Supabase; el perfil se carga fuera del callback. Una respuesta tardía
no puede reactivar una sesión que ya se cerró. El login y la ruta protegida
exigen un perfil conocido y activo; si el login no consigue validarlo, se
intenta cerrar esa sesión y se muestra el motivo.

Los controles de escritura excluyen viewers. Las opciones de responsable solo
incluyen superadmin/admin/developer activos. Los admins solo gestionan perfiles
sin rol administrativo; superadmin puede gestionar permisos administrativos,
sujeto a la protección del último superadmin en la RPC.

La provisión y eliminación de cuentas reales requiere un backend Auth Admin que
no está implementado por FASE 2A. Por eso los botones correspondientes están
deshabilitados y los métodos rechazan la operación sin llamar a `signUp`, sin
insertar perfiles ni sustituir la sesión del administrador. Se conservan la
activación/desactivación por RPC y el cambio de nombre del perfil propio.
El nombre de otro perfil no es editable. Si se quiere cambiar nombre propio y
permisos a la vez, la interfaz solicita guardarlos por separado.

RLS continúa siendo la autoridad. Los controles visuales y las pruebas con
dobles no demuestran permisos reales en el proyecto remoto. La actualización
de perfiles entre sesiones y el comportamiento de revocación se deben comprobar
en integración.

Las notificaciones se consultan por destinatario propio y solo se actualiza su
campo `read`. Los avisos SLA del navegador se generan únicamente para el actor
editor que está asignado: no puede deduplicar el historial de otros usuarios
bajo RLS. La entrega global, usuarios desconectados y deduplicación concurrente
requieren una tarea confiable de servidor futura.

## Configuración de entorno

Variables recomendadas en `.env.local`:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

Se admite `VITE_SUPABASE_ANON_KEY` si no se define la variable nueva y contiene
una clave JWT `anon`. Para el proyecto nuevo se recomienda la clave publicable.
La validación rechaza configuración vacía, placeholders, URLs con credenciales,
HTTP fuera de localhost y claves secretas/JWT con rol elevado. Los valores no
se incluyen en mensajes de error. Sin configuración válida, `main.tsx` muestra
«Configuración pendiente» y no monta la aplicación ni inicializa el cliente.

La validación es de formato y tipo de clave, no verifica que una URL y una clave
pertenezcan al mismo proyecto ni que el backend esté disponible. Las variables
`VITE_*` llegan al navegador: nunca deben contener secretos. La compilación
sin configuración es válida; no se presenta como prueba de conexión.

## Pruebas ejecutadas

Entorno reutilizado: Node 26.8.2, npm 11.19.1 y dependencias del lockfile actual.

```bash
node --test --test-reporter=spec tests/consumers.test.mjs
npm run build
```

Las pruebas usan TypeScript nativo de Node (Node 22.18+; aquí Node 26). No se
añadieron dependencias de pruebas. La función global `fetch` rechaza cualquier
acceso de red; el caso que utiliza el SDK real suministra su propio transporte
HTTP ficticio con dominio `.invalid`. No se usaron credenciales funcionales.

Resultado: **19 pruebas aprobadas**, ninguna fallida. Cubren:

- Payload público sin campos protegidos y fechas vacías normalizadas.
- Clave estable tras fallo, doble clic y reintento confirmado sin otra petición.
- Intenciones nuevas separadas aunque los campos coincidan.
- Constancias inválidas rechazadas, sin éxito falso.
- Alta manual y aprobación como una llamada RPC; campos SLA y prioridad baja.
- RPC void y errores de permisos; tipo, metadatos, permisos de perfil y purga.
- Seguimiento por número/token, años previos, contador 1000 y separación entre
  ausencia de resultado y error del backend.
- URL y cuerpo JSON que emite realmente el SDK, con respuesta simulada.
- Rechazo de escrituras sin fila confirmada y ocultación de detalles sensibles.
- Validación de claves y configuración.
- Perfil activo/inactivo/ausente, sesión compartida, logout y respuestas tardías.
- Renovación del mismo usuario sin desmontar formularios ni perder claves de
  reintento; rechazo posterior de un perfil revocado.
- Guardas de roles del consumidor, sin afirmar que sustituyan pruebas RLS.

`npm run build` terminó con código 0: TypeScript y Vite 5.4.21, 188 módulos,
1,78 s de Vite. Persisten los avisos no bloqueantes de Browserslist antiguo y
chunk principal mayor de 500 kB. No se ejecutó actualización de dependencias.

Evidencia: [pruebas](validation/fase-2b1-consumers.txt) y
[compilación](validation/fase-2b1-build.txt). No se ejecutaron pruebas SQL ni se
inició PostgreSQL. Tampoco se ejecutaron pruebas de navegador, Realtime real,
email, login real o escrituras reales en Supabase.

## Pasos exactos de conexión — solo para la siguiente fase autorizada

Actualización de FASE 2B.2: para la CLI instalada 3.2.0 seguir
[el procedimiento actualizado](fase-2b2-preparacion.md), que fija el destino
con `--remote` y excluye Vault con `--skip-vault`. Estos pasos no se ejecutaron.

Los pasos de esta sección **no se ejecutaron**. No iniciar Vite con valores
remotos hasta que se autorice la conexión. El nombre visible del proyecto no
permite deducir su project ref, URL ni clave: deben obtenerse del proyecto nuevo.

1. Abrir en el Dashboard el proyecto independiente `ticketera-procont` y
   comprobar su identidad. Confirmar que sigue vacío y que no es el proyecto
   anterior. Con autorización, verificar sus requisitos de FASE 2A.
2. Aplicar exclusivamente las cuatro migraciones versionadas, en orden, con
   historial. Si se utiliza la CLI ya instalada, desde este directorio, el
   procedimiento es el siguiente; detenerse si el dry-run lista algo distinto
   de los cuatro archivos de FASE 2A:

   ```bash
   cd /home/procont/projects/ticketera-procont
   supabase init
   supabase login
   read -r -p 'Project ref del proyecto independiente: ' PROCONT_SUPABASE_PROJECT_REF
   supabase link --project-ref "$PROCONT_SUPABASE_PROJECT_REF"
   supabase db push --remote --skip-vault --dry-run
   # Solo con autorización para aplicar y después de revisar el dry-run:
   supabase db push --remote --skip-vault --yes
   ```

   `supabase init` solo se necesita si aún no existe `supabase/config.toml`.
   No utilizar `db reset`, `--include-seed`, los SQL raíz ni `setup.js`.
   No guardar contraseñas de base de datos en variables `VITE_*`.
3. Con autorización para crear el usuario inicial, hacerlo mediante Auth en el
   Dashboard con identidad definida por el usuario. El trigger crea un perfil
   viewer inactivo. Obtener su UUID y ejecutar, como propietario en SQL Editor,
   `select app_private.bootstrap_superadmin('UUID_REAL_DEL_USUARIO'::uuid);`.
   El texto UUID del ejemplo debe sustituirse por el UUID real; no hay cuenta
   o contraseña predeterminada. Esta operación no se hace desde el navegador.
4. En **Connect** obtener la Project URL y la Publishable key. Alternativamente
   la clave se encuentra en **Settings → API Keys**. Usar exclusivamente los
   valores del proyecto independiente, sin pegarlos en commits, chat o informes.
5. Crear el archivo local si aún no existe y editarlo directamente:

   ```bash
   cd /home/procont/projects/ticketera-procont
   cp -n .env.example .env.local
   nano .env.local
   git check-ignore .env.local
   ```

   Rellenar las dos variables recomendadas con sus valores reales. Dejar sin
   definir `VITE_SUPABASE_ANON_KEY` al usar la clave nueva. No usar claves
   secretas ni `service_role`. `git check-ignore` debe indicar `.env.local`.
6. Configurar en Auth URL Configuration `http://localhost:5173` como URL local
   permitida, manteniendo los valores de otros entornos si los hubiera.
   Reiniciar Vite después de editar el archivo:

   ```bash
   npm run dev
   ```

   Abrir `http://localhost:5173/portal`; probar login con el usuario inicial ya
   habilitado. La aplicación empezará a llamar al backend real a partir de ese
   momento. No se ha ejecutado ese paso en esta fase.

Las configuraciones y el enlace CLI locales no se deben versionar como secretos;
`.env*`, `supabase/.temp/` y `supabase/.branches/` permanecen ignorados. No usar
la clave publicable como prueba de autorización: la sesión y RLS determinan los
permisos del usuario.

## Pruebas de integración pendientes con el nuevo Supabase

1. Aplicación e historial de migraciones; resolución PostgREST de relaciones y
   RPC, incluido el formato de retorno de `change_project_type` y RPC void.
2. Login, perfil inactivo, bootstrap, cambio de roles y revocación entre sesiones;
   probar cada rol con datos exclusivamente ficticios.
3. Crear proyecto manual y solicitud pública/importada, reintentar tras pérdida
   de respuesta, aprobar/rechazar y comprobar una sola entidad y sus flujos,
   checklist, historial y notificaciones. No duplicar la suite SQL de 2A.
4. Entregar/guardar token y consultar en sesión pública; token incorrecto o de
   otra solicitud, año anterior y contador superior a 999; confirmar que no se
   solicita ninguna tabla interna desde la página pública.
5. Editar, desasignar, limpiar fechas, bloquear, checklist/progreso, orden,
   comentarios, papelera, restaurar y purgar; provocar una denegación para
   comprobar el mensaje de error y la ausencia de éxito falso.
6. Realtime de proyectos/flujos/notificaciones y el sondeo del contador; marcado
   de notificaciones propias y comportamiento de los avisos SLA por destinatario.
7. Recorridos de navegador y presentación visual; errores de recarga posteriores
   a una escritura confirmada y mensajes de operaciones parcialmente guardadas.

Siguen pendientes el backend Auth Admin, la entrega global de avisos SLA,
controles de abuso del formulario público, política de retención y tipos
generados desde la instancia final. No exponer el formulario públicamente sin
resolver sus controles de abuso. No se corrigieron en esta fase los avisos de
dependencias ni se redefinieron reglas empresariales.

Fuentes oficiales para los pasos posteriores:
[claves y ubicación en Dashboard](https://supabase.com/docs/guides/getting-started/api-keys),
[CLI link](https://supabase.com/docs/reference/cli/supabase-link),
[CLI db push](https://supabase.com/docs/reference/cli/supabase-db-push) y
[eventos Auth](https://supabase.com/docs/reference/javascript/auth-onauthstatechange).
