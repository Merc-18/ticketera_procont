# FASE 2B.3D — Resolución de bloqueos de inventario Supabase

17/11/2026. Base: `11b2c15`, con la consulta de catálogos/documentación preparada
en la sesión anterior todavía sin commit. Se integra esa entrega sin descartarla.
Alcance: cambios locales, fuentes oficiales públicas y pruebas nuevas aisladas.
**No se ejecutó SQL remoto, CLI login/link/push/repair remoto ni cambios externos.**

## Decisión

**NO APTO todavía para migraciones remotas.** El bloqueo de propiedad Auth se
eliminó del diseño y se probó localmente; los dos bloqueos por historial ausente
eran requisitos de preflight incorrectos para un proyecto nuevo y se corrigen.
No se crean tablas de historial desde SQL Editor para hacerlos pasar.

La identidad efectiva prevista de CLI 3.2.0 se confirmó por código: `postgres`
en la ruta enlazada estándar. No se ha confirmado mediante una conexión real
de migración al destino. SELECT/RLS del rol postgres se confirmaron posteriormente
desde la exportación existente. Faltan el baseline de recuperación real y una
autorización explícita de aplicación. Preparar un SQL
de seguimiento no los convierte en comprobaciones realizadas.

## Evidencia remota recibida, sin repetir lecturas

Se acepta como declaración del usuario que ejecutó el inventario: PostgreSQL
**17.12 (`170012`)**, current_user/session_user `postgres`, `public` sin objetos
de negocio, `auth.users` de `supabase_auth_admin`, TRIGGER disponible pero sin
propiedad sobre Auth, sin esquema `supabase_migrations`, tres bloqueos y cuatro
pendientes. No se recibió una exportación íntegra como archivo; no se presenta
el resumen como un baseline capturado por el agente.

El TOML local ya tenía major 17: solo se actualiza su comentario de evidencia,
sin cambiar el valor ni aplicar configuración. Se conservan las confirmaciones
Dashboard anteriores y los límites Free sin backup automático/PITR.

## 1. Auth sin compensación sobre objetos de otro propietario

La migración 3 sustituye `sync_auth_profile()` y los dos triggers propios en
`auth.users` por `app_private.provision_auth_profile(uuid)`, privada y
SECURITY DEFINER con search_path vacío. No se cambia el propietario de Auth,
no se pide pertenencia a `supabase_auth_admin` ni se amplían permisos remotos.

La función solo admite una identidad Auth **ya existente** con correo. Toma
id/correo/nombre de Auth, crea un perfil viewer inactivo y en el refresco actualiza
solo correo, preservando nombre editado, rol y activación. Ignora roles/activación
en metadatos de usuario. El bloqueo transaccional comparte la serialización de
bootstrap y administración de roles. No es una función pública ni se concede
EXECUTE a anon, authenticated o service_role. El propietario debe poder leer
id, email y raw_user_meta_data y no quedar impedido por RLS de Auth.

**Permisos confirmados por el usuario desde la misma exportación, sin otra
consulta:** SELECT=true para id, email y raw_user_meta_data; postgres tiene
superuser=false y bypass_rls=true. Esto satisface la lectura de fuente Auth para
ese rol en el destino reportado. No requiere conceder nuevos privilegios ni
obtener propiedad de Auth. Es evidencia de metadatos, no una lectura de cuentas.

La FK `public.users.id → auth.users.id ON DELETE CASCADE` se conserva. La
integración con `auth.uid()` y los contratos de login/perfil permanecen. Las FK
crean triggers internos del motor: no son los triggers de provisión retirados.
Dropear la tabla/FK propia no exige ser propietario de la tabla referenciada;
se comprobó la eliminación y restitución de esos triggers internos en local.

**Cambio operativo explícito:** ya no hay creación/refresco automático de perfil
al modificar Auth. Después de una futura creación administrativa de identidad,
separadamente autorizada, el propietario deberá provisionar el perfil antes del
primer login; después de un cambio de email en Auth deberá refrescarlo. Sin
perfil válido/activo, el consumidor existente deniega acceso. No se modifica
frontend ni se añade auto-registro, endpoint de altas o hook alojado.

La función `bootstrap_superadmin(uuid)` conserva su acceso de propietario y usa
la misma provisión antes de asignar/auditar el rol. Solo se define, no se llama
en esta fase. Ni esta función ni la nueva provisión crean identidades Auth.
La prueba positiva con una identidad y la sincronización de correo reales quedan
pendientes: no se crearon cuentas ficticias para sortear la restricción.

La compensación 3 ya no contiene DROP TRIGGER sobre Auth; el bundle tampoco
bloquea `auth.users`. La restauración solo retira objetos de Ticketera. La ventana
operativa debe seguir sin otros operadores/tráfico: un cambio de cuentas durante
la comparación obliga a detenerse, no autoriza borrar esas cuentas.

## 2. Historial administrado por la CLI

La documentación de [db push](https://supabase.com/docs/reference/cli/supabase-config)
y el [flujo oficial](https://supabase.com/docs/guides/local-development/cli-workflows)
establecen inicialización y seguimiento automáticos. Se revisaron además
`migration-history.ts`, `migration-apply.ts`, `db-push-core.ts` y
`repair.handler.ts` del tag CLI **v3.2.0**, no una versión supuesta de la CLI Go.
Fuentes de implementación: [inicialización del ledger](https://github.com/supabase/cli/blob/v3.2.0/apps/cli/src/command-internal/migration-history.ts),
[aplicación de archivos](https://github.com/supabase/cli/blob/v3.2.0/apps/cli/src/command-internal/migration-apply.ts),
[repair seleccionado](https://github.com/supabase/cli/blob/v3.2.0/apps/cli/src/commands/migration/repair/repair.handler.ts).

La ruta nativa con migraciones pendientes inicializa el esquema/tabla/columnas
del ledger antes del primer archivo, en su propia transacción. El dry-run no
inicializa ese ledger; la resolución de credenciales puede tener otros efectos
administrativos y no se ejecutó. Un proyecto sin `supabase_migrations` es normal.
Si el primer archivo falla, puede quedar un ledger vacío legítimo: se preserva.

Por ello se retira el requisito de crear el historial antes del baseline:

- Se admite una captura anterior al primer push con historial ausente.
- La transición 1 permite únicamente la estructura exacta que inicializa esa CLI:
  esquema, tabla, tres columnas, PK/índice y tipos implícitos. Objetos inesperados,
  propietarios distintos o cambios ajenos siguen provocando parada.
- No se ejecuta ni entrega un SQL manual de inicialización remota. No se borra
  el esquema/tabla de la CLI durante la compensación.

**Nueva separación de recuperación:** el bundle SQL compensa los objetos de la
aplicación en una transacción y conserva las filas del historial. Genera aparte
`ARCHIVO.sql.repair-plan.json` con las versiones efectivamente registradas que,
solo tras compensación exitosa y autorización adicional, se deben marcar
reverted mediante **CLI 3.2.0 `migration repair --status reverted`** en el destino
verificado. No usa repair sin versiones ni trunca el historial. La CLI realiza
esa reparación seleccionada en otra transacción; no es una reversión de SQL.

No se eliminan filas del ledger desde nuestro bundle. Si SQL se confirmó sin
su versión, esa versión no se inventa ni se incluye en el repair-plan. Las filas
ajenas se rechazan; las huellas/nombres/versiones existentes siguen vigiladas.

**No atomicidad entre herramientas:** entre el COMMIT de compensación y el repair
hay una ventana con esquema retirado e historial todavía aplicado. Mantener la
aplicación y operaciones CLI detenidas. Si repair falla o se pierde respuesta,
inspeccionar el resultado antes de reintentar; no hacer push durante esa ventana.
Verificar esquema e historial antes de reanudar. No afirmar que el lote, el
COMMIT del archivo y su registro posterior son una transacción conjunta.

## 3. Usuario y permisos reales de la conexión CLI

Revisión del tag v3.2.0:

| Ruta | Identidad prevista | Límite |
|---|---|---|
| Proyecto enlazado con contraseña DB | Usuario base `postgres` (el pooler puede añadir sufijo de tenant) | Configuraciones/overrides deben revisarse sin exponer credenciales |
| Proyecto enlazado sin contraseña DB | Login temporal `cli_login_*`; el driver remoto hace SET SESSION ROLE postgres | La obtención del login temporal es una operación administrativa, no autorizada aquí |
| Login remoto privilegiado supabase_admin | El driver también baja a postgres | No se propone usarlo para adquirir propiedad sobre Auth |
| URL DB explícita personalizada | La identidad depende de esa configuración y de si se activa la bajada de rol | No presumir postgres para una ruta arbitraria |

`migration-apply.ts` restablece ese rol antes del insert de historial y después
de instrucciones que lo reviertan. Un session_user temporal no significa que
DDL se ejecute como superusuario. La observación SQL Editor `postgres/postgres`
no prueba el transporte, sesión o credenciales de un futuro push.
Referencias: [resolución enlazada](https://github.com/supabase/cli/blob/v3.2.0/apps/cli/src/command-internal/db-config.layer.ts),
[bajada de rol en el driver](https://github.com/supabase/cli/blob/v3.2.0/apps/cli/src/command-internal/db-connection.sql-pg.layer.ts),
[ruta de consultas](https://github.com/supabase/cli/blob/v3.2.0/apps/cli/src/commands/db/query/query.handler.ts).

**Detalle importante:** `db query --remote` en ruta enlazada de 3.2.0 puede usar
Management API; no demuestra por sí solo la identidad de la conexión de db push.
La futura lectura debe usar la ruta directa/credenciales previstas para migrar,
con destino fijado, y registrar current_user/session_user/privilegios reales.
No se ejecutaron consultas para intentar confirmarlo bajo la prohibición actual.

Se prepara [fase-2b3d-cli-preflight.sql](validation/fase-2b3d-cli-preflight.sql),
solo de catálogos y **no ejecutado**. Sustituye los checks de TRIGGER/propiedad Auth
por SELECT de sus tres columnas y ausencia de RLS que oculte la identidad al
propietario de la función. Ledger ausente pasa a pendiente de inicialización
nativa, no error que se resuelva creando tablas manualmente. No se desactiva
RLS ni se concede SELECT para hacer pasar un check sin autorización posterior.
Los permisos de public, lenguajes, FK, Realtime, TEMP y demás requisitos persisten.

## 4. Los seis event triggers, sin cambios remotos

Todos fueron reportados como owner `supabase_admin`, handler en `extensions`,
enabled `O`. Se conservan y no se propone deshabilitarlos, cambiar owner ni
usar session_replication_role para eludirlos.

| Event trigger / función | Evento y tags reportados | Interacción prevista |
|---|---|---|
| issue_graphql_placeholder / set_graphql_placeholder | sql_drop; DROP EXTENSION | Ningún archivo/compensación elimina extensiones |
| issue_pg_cron_access / grant_pg_cron_access | ddl_command_end; CREATE EXTENSION | Ningún archivo crea extensiones |
| issue_pg_graphql_access / grant_pg_graphql_access | ddl_command_end; CREATE EXTENSION | No se ejecuta por nuestros comandos de tabla/función |
| issue_pg_net_access / grant_pg_net_access | ddl_command_end; CREATE EXTENSION | No se ejecuta por nuestros comandos de tabla/función |
| pgrst_ddl_watch / pgrst_ddl_watch | ddl_command_end; sin filtro de tags | Observa DDL; la implementación pública notifica recarga de caché para tipos de objeto previstos |
| pgrst_drop_watch / pgrst_drop_watch | sql_drop; sin filtro de tags | Observa compensaciones; la implementación pública notifica recarga de caché |

Análisis de la secuencia: 1/2/3 crean/alteran objetos y pueden provocar avisos
PostgREST; 4 solo carga plantillas, DML que no dispara event triggers DDL. La
compensación 4 también es DML; 3/2/1 retiran funciones, políticas, tablas y el
esquema propio. Las cuatro extensiones específicas no se crean ni se eliminan.
La inicialización nativa del ledger puede generar avisos de caché y repair es
DML. Los NOTIFY de transacciones fallidas no se confirman; duplicar una petición
de recarga no concede permisos ni cambia objetos de negocio.

Se revisó la [fuente pública de los watchers](https://github.com/supabase/postgres/blob/develop/migrations/db/migrations/20220321174452_fix-postgrest-alter-type-event-trigger.sql).
Las identidades recibidas coinciden con ese mecanismo. No se recibió el cuerpo
instalado ni se leyó remotamente: no se afirma equivalencia binaria con ese tag
o con los hooks de toda la plataforma. El entorno local usa modelos pequeños
para estas operaciones, no una simulación completa del servicio alojado.

## Cambios y manifestación de versión

Solo cambia SQL de la migración 3, todavía no aplicada. Se conserva la secuencia
de cuatro nombres/versiones porque el usuario reportó historial vacío y no hubo
aplicación remota. El manifiesto preparado vigente pasa a
[fase-2b3d-migrations.json](validation/fase-2b3d-migrations.json). El manifiesto
2B.2 y las evidencias anteriores se conservan como historia; no se sobrescriben
para aparentar que la versión anterior tenía este comportamiento.

Se actualizan scope, compensación 3, generador/repair-plan y comentarios TOML.
Las fixtures históricas se adaptan a provisión explícita e historial nativo;
**no se ejecutan** sus suites ni se presentan sus resultados antiguos como
validación de la migración 3 revisada. Frontend/dependencias permanecen intactos.

## Pruebas nuevas exclusivamente locales

[blockers_local.py](../supabase/tests/blockers_local.py) crea su propio clúster
descartable `/tmp/procont-2b3d-*`, sin TCP, y mantiene initdb/postgres/pg_ctl en el
**mismo namespace PID**. No vuelve a usar el clúster anterior. Crea solo roles
PostgreSQL NOLOGIN para modelar propietarios, no cuentas Auth ni superadmin.

Siete comprobaciones nuevas aprobadas, con [evidencia](validation/fase-2b3d-local.json)
y [salida](validation/fase-2b3d-local.txt): baseline frío sin historial; cuatro
migraciones con operador sin superusuario ni propiedad/TRIGGER Auth; función
privada que rechaza UUID inexistente; compensación preservando Auth, ledger y
seis event triggers; modelo de repair nativo separado; caso COMMIT sin última
versión; bundle/repair-plan privados 600. Se verificó la restitución de triggers
internos FK y que anon/authenticated/service_role no ejecutan la provisión.

El motor local fue PostgreSQL 18.6, no una instalación Supabase 17.12. Las
operaciones nuevas usan sintaxis compatible con 17, pero no hay ejecución local
17.12 ni controlador CLI nativo en la evidencia. No hay prueba positiva de alta/
refresh con identidad por la restricción de no crear usuarios. Las notificaciones
de los watchers modelados se recibieron y su catálogo se conservó. El clúster
se detuvo ordenadamente con pg_ctl y se confirmó la eliminación de su PID file.
No se repitieron las suites 72/19/26 ni se compiló frontend.

## Pendientes, autorización y cierre

Para declarar APTO: confirmar la conexión de migración elegida y que use los
privilegios postgres ya reportados, y baseline real del formato de recuperación
(el inventario de catálogos no es 0.json), ventana sin escrituras y autorización
de aplicación. No confundir un ledger aún inexistente con un error a corregir
manualmente, ni la corrección local Auth con permiso para ejecutar bootstrap.

<!-- BEGIN_LOCAL_COMMIT_STATUS -->
Cierre local desde Ubuntu normal: commit con el mensaje fix: resolver dependencias Auth e historial de migraciones. No se cambian permisos ni se ejecuta SQL, pruebas, usuarios, push o merge. El identificador es el commit que contiene este informe; el cierre verifica Git limpio y lo muestra.
<!-- END_LOCAL_COMMIT_STATUS -->

**Veredicto: NO APTO para migraciones remotas.** Se detiene antes de cualquier
modificación externa; no hubo cuentas, bootstrap, push, merge o despliegue.
