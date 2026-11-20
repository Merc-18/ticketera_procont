# FASE 2B.2 — Preparación de Supabase

> **Revisión documental 20/11/2026 · base `c857a727c8e7640bbce8daada940f973acbf013e` · clasificación: HISTÓRICO.**
> Fuente oficial: [PRODUCT_REQUIREMENTS](specs/PRODUCT_REQUIREMENTS.md); estado operativo: [PROJECT_STATUS](PROJECT_STATUS.md).
> Informe histórico de una fase ya cerrada; sus estados «pendiente», conteos parciales y comandos corresponden a su fecha. M1–M15 están aplicadas según evidencia del 20/11. No repetir preparación, bootstrap, compensaciones o consultas antiguas para operar el sistema actual.

## Alcance del documento anterior

El contenido siguiente conserva sus fechas y evidencias originales. Los estados de activación o contratos sustituidos no se consideran vigentes; prevalecen las especificaciones enlazadas arriba.

**Aplicación remota verificada:** las versiones `20261117000100`, `20261117000200`, `20261117000300` y `20261117000400` quedaron registradas en ticketera-procont. Se comprobaron las cuatro transiciones con el alcance de recuperación, 13 tablas propias con RLS y 35 pasos genéricos de checklist. No se crearon cuentas ni superadmin. Las compensaciones se generaron solo en privado, sin ejecutarlas. La evidencia vigente está en `docs/validation/continuacion-af3259f-baseline.json`. Los estados NO APTO anteriores de estos informes son antecedentes, superados para este conjunto. Siguiente paso: definir con el propietario las áreas y la provisión inicial de acceso, bajo autorización separada.

**Estado posterior a la conexión correcta:** baseline nativo, identidad, destino
y hashes verificados offline. El estado capturado cumple el validador de
recuperación; aún no se aplicaron migraciones por el agente. La contraseña no
está persistida y se solicita solo mediante entrada oculta al ejecutar el
[comando de aplicación autorizado](conexion-cli-baseline.md). Este incluye
comprobación remota previa, planes exactos por paso, verificación y cierre Git
local. Los NO APTO de entregas anteriores son históricos; la decisión de cada
paso se toma con el estado real al ejecutar, sin forzar ningún requisito.

**Diagnóstico posterior de conexión:** se reprodujo un rechazo TLS por CA del
sistema (código 19); la CA oficial de CLI 3.2.0 validó cadena y hostname sin
autenticación ni SQL. El comando mantiene `verify-full` con CA explícita y
diagnóstico saneado por etapa/categoría. La alternativa API de solo lectura
no cumplió la identidad requerida y se detuvo antes del baseline. Véase la
[corrección vigente](conexion-cli-baseline.md); no se aplicaron migraciones.

**Enlace CLI confirmado por el usuario y cotejado localmente:** no repetir
login/link/list. El endpoint guardado sirve para la ruta nativa
`--remote=<URL sin contraseña>`. La única entrada pendiente es la contraseña
PostgreSQL oculta en la terminal mediante el comando de la
[guía vigente](conexion-cli-baseline.md); no se guardará. No utilizar el token
de acceso para acuñar un rol temporal. Baseline y aplicación siguen pendientes.

**Actualización 18/11/2026:** inventario importado y cotejado, CLI 3.2.0 operativa
con directorio privado y telemetría desactivada. Continuar exclusivamente con el
[comando de entrada segura](conexion-cli-baseline.md) para identidad y primer
baseline ahora autorizados. No usar login/link ni los comandos remotos históricos
de abajo como prueba. No se repiten preflight ni suites anteriores. Faltan la
entrada de contraseña en terminal, la conexión real y la validación de `0.json`.

**Instrucción vigente desde `af3259f`:** no repetir el inventario ni ejecutar
otra consulta SQL. El inventario v1 ya fue ejecutado por el usuario; copiar su
adjunto existente e importar offline según
[conexión CLI y baseline](conexion-cli-baseline.md). No ejecutar los comandos
remotos históricos de este informe. Siguen pendientes la identidad CLI real
y el baseline operativo; la preparación de un recibo local no los confirma.

**Procedimiento vigente 2B.3D:** [resolución de bloqueos](fase-2b3d-resolucion-bloqueos.md).
PostgreSQL 17.12 fue reportado por el usuario; la CLI prevé rol efectivo postgres,
sin conexión real confirmada. M3 revisada no instala triggers en Auth. El ledger
ausente es normal y lo inicializa la CLI. No ejecutar SQL manual para crearlo.

**Continuación desde `11b2c15`:** se preparó una
[consulta manual de catálogos](fase-2b3-catalog-preflight.md), sin ejecutarla.
Solo inspecciona versión, objetos, ACL, publicaciones y privilegios del operador;
no consulta cuentas, datos ni filas del ledger. No es el baseline de recuperación
ni cierra todos sus requisitos. La aplicación remota continúa sin autorización.

**Revisión organizacional 2B.3C (17/11/2026):** las cuatro migraciones ya son
independientes de áreas/personas de Gilat y se conservan sin cambios ni nuevas
pruebas SQL. [Adaptación Procont](fase-2b3c-adaptacion-procont.md) documenta los
catálogos/textos/SLA del frontend aún pendientes. No se copian al backend ni se
definen áreas o cuentas nuevas. La recuperación 2B.3B y sus condiciones de parada
permanecen vigentes; esta revisión no cambia el NO APTO remoto ni lo autoriza.

**Actualización 2B.3B (17/11/2026):** el procedimiento vigente de aplicación por
pasos, detención e historial está en [recuperación](fase-2b3b-recovery-plan.md).
Sustituye el push único de esta preparación y su reversión todavía conceptual.
Se reutilizan las comprobaciones Dashboard confirmadas: Data API habilitada,
`public`/`extensions` expuestos, historial vacío y sin tablas de negocio; Free
sin backups automáticos/PITR. La versión «última soportada» aún no fija un major.
Hay cuatro compensaciones específicas y 26 comprobaciones locales nuevas.
**NO APTO para aplicar remoto** hasta capturar y validar baseline real, versión
numérica y privilegios administrativos. Ninguna modificación remota autorizada.

17/11/2026. Base funcional: `eceb849`; preparación: `c6e79f4`; asistente con
entradas visibles: `28acd95`. Cierre de preparación después de la captura local
confirmada por el usuario. Este informe complementa FASE 2A y sustituye los
comandos de conexión de 2B.1 para la CLI instalada **3.2.0**.

Actualización de diagnóstico 2B.3A: [preflight](fase-2b3a-preflight.md).
El 401 de OpenAPI quedó explicado por una restricción del endpoint; la clave
publicable sí fue aceptada por Auth. Esta actualización corrige la condición
previa de obtener HTTP 200 en OpenAPI. No autoriza migraciones.

## Estado

- CLI oficial instalada fuera del repositorio en
  `/home/procont/.local/lib/supabase-cli/3.2.0/supabase`; SHA-256 del archivo de
  distribución comprobado contra `checksums.txt` de la misma publicación.
- `supabase init` ejecutado únicamente en local. `supabase/config.toml` validado
  mediante `config validate`: válido, sin advertencias ni contacto con la API.
- Data API local: habilitada, esquemas `public` y `graphql_public`;
  `app_private` y `auth` no expuestos. Seeds deshabilitados y sin rutas.
- `db.major_version=17` coincide con PostgreSQL 17.12 reportado por el usuario
  en el inventario posterior. No se repite esa lectura; no acredita sesión CLI.
  Las pruebas locales usan 18.6, diferenciadas de la versión alojada.
- No hay login/link CLI, cambios de configuración remota, SQL externo,
  migraciones aplicadas, usuarios ni privilegios asignados por esta fase.
- `.env.local` existe con permisos `600`; sus dos variables están presentes,
  no están versionadas y la URL coincide con el destino privado fijado. Los
  archivos de estado tienen permisos `600`, dentro de un directorio `700`.
- El usuario confirmó `ticketera-procont` desde Dashboard. Se conserva esa
  confirmación manual, sin presentarla como verificación de Management API.
- La evidencia original contiene **HTTP 401** (`accepted=false`). El diagnóstico
  posterior 2B.3A reprodujo «Secret API key required» en la raíz OpenAPI y
  obtuvo HTTP 200 en configuración pública Auth con la clave existente.
  No hay que sustituir la clave publicable ni exigir HTTP 200 en OpenAPI.
- **No apto todavía para ejecutar DDL**: Dashboard Data API, esquemas e inicio
  vacío ya están confirmados manualmente; falta versión numérica e inventario
  de objetos/permisos para recuperación. Ver 2B.3B. El 401 explicado no es por
  sí mismo un bloqueo para aplicar migraciones.

La comprobación local sin valores se registra en
[fase-2b2-local-ready.json](validation/fase-2b2-local-ready.json). No prueba que
el servidor esté vacío: esa condición sigue siendo una declaración del usuario
que debe contrastarse en el preflight autorizado de 2B.3.

La configuración TOML es local: `project_id="ticketera-procont"` no acredita
el nombre del proyecto alojado. No ejecutar `config push` para trasladarla.

## Configuración local completada

El usuario eligió introducir URL y clave y confirmar el destino desde Dashboard,
sin proporcionar token personal. Ejecutar desde una terminal interactiva:

```bash
python3 /home/procont/projects/ticketera-procont/scripts/prepare_supabase_local.py --offline
```

La captura ya fue realizada por el usuario; no volver a ejecutarla para
sobrescribirla. El comando se documenta para instalaciones nuevas. Desde
`28acd95`, utiliza entradas visibles y muestra la URL normalizada, limpia
espacios/saltos de línea/comillas y explica errores de URL. No reimprime la clave
ni la incorpora al historial. Exige el nombre exacto `ticketera-procont` y una
URL HTTPS canónica. Rechaza claves secretas, JWT, placeholders y configuración
existente. No solicita contraseñas ni tokens Management API.

Guarda `.env.local` con las dos variables requeridas y permisos `600`:
`VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`. El directorio privado
`.supabase-local/` tiene permisos `700`; contiene el destino fijado en
`target.json` y un resumen sin valores de entorno en `status.json`. Los tres
archivos están ignorados por Git. No imprimirlos con `cat`, `env` ni logs. Este
informe no incorpora URL, clave, project ref, UUID ni identidad de una cuenta.

El único contacto opcional es **GET `/rest/v1/`** con la clave publicable, para
recibir OpenAPI. No sigue redirecciones, no consulta registros, no llama RPC,
Auth o Management API y no ejecuta SQL. `--offline` permite guardar sin ese GET.
Un GET aceptado confirma disponibilidad de Data API/clave, **no el nombre del
proyecto ni RLS**. Si falla, se registra como pendiente, sin mostrar respuesta
ni credenciales. El asistente no inicia Vite. Su GET de OpenAPI no constituye
una prueba adecuada de validez de claves publicables en este destino:
2B.3A confirmó que ese endpoint exige una clave secreta. El script original
conserva el 401 como evidencia histórica, no como prueba de clave inválida.
No atribuirlo a la falta de migraciones ni introducir claves privilegiadas para
obtener HTTP 200. El GET de configuración pública Auth de 2B.3A valida la
aceptación de la clave; no valida Data API, exposición de esquemas ni RLS.

Confirmaciones manuales necesarias en el Dashboard del destino:

1. Nombre exacto `ticketera-procont` y Project URL del mismo proyecto, no una
   instancia anterior. Sin token Management no hay comprobación automática del
   nombre. La confirmación manual queda diferenciada en el estado local.
2. Data API habilitada; `public` entre los esquemas expuestos y `app_private`
   y `auth` excluidos. La clave publicable por sí sola no permite leer toda la
   configuración de plataforma. No cambiar opciones remotas en esta fase.
3. Proyecto sin tablas de negocio ni migraciones aplicadas; anotar cualquier
   objeto ajeno antes de autorizar DDL. RLS real queda pendiente de las tablas.

## Orden obligatorio y dependencias

El manifiesto vigente es [fase-2b3d-migrations.json](validation/fase-2b3d-migrations.json),
con los cuatro nombres y el hash revisado de M3. El manifiesto 2B.2 se conserva
como histórico. No aplicar una copia con el hash antiguo de M3 o mezclar versiones.

| Orden / archivo en `supabase/migrations/` | Dependencias y efectos |
|---|---|
| 1 — `20261117000100_schema.sql` | Supabase ya debe proporcionar `auth.users`, `auth.uid()`, roles `anon`/`authenticated`; crea 9 tablas públicas, 4 privadas, índices, FK y RLS inicialmente cerrado |
| 2 — `20261117000200_security.sql` | Requiere 1; helpers, políticas y permisos de columnas; ningún perfil se activa por esta migración |
| 3 — `20261117000300_operations.sql` | Requiere 1+2 y rol `service_role`; RPC, numeración, integridad diferida, provisión privada explícita desde Auth, definición de bootstrap, relaciones PostgREST y publicación de 3 tablas si existe `supabase_realtime` |
| 4 — `20261117000400_reference_checklists.sql` | Requiere tabla de plantillas de 1; carga 35 pasos genéricos, sin cuentas ni registros empresariales |

Cada archivo contiene su propia transacción. En CLI 3.2.0, sus BEGIN/COMMIT
explícitos hacen que la versión se registre después del COMMIT del archivo;
una pérdida de conexión puede dejar DDL aplicado sin historial. 2B.3B cubre
ese caso y exige capturas por paso. **El lote de cuatro no es una
única transacción:** si falla el tercero, los dos primeros pueden permanecer
aplicados. No reejecutar migraciones ya confirmadas ni usar scripts SQL raíz,
`tests/support/auth_stub.sql`, `setup.js` o seeds para resolver un fallo.

## Procedimiento definitivo — requiere autorización para 2B.3

**Referencia histórica:** para ejecutar o recuperar, prevalece el procedimiento
2B.3B enlazado arriba. No ejecutar el push de cuatro archivos mostrado aquí sin
revisar su sustitución por un archivo pendiente y capturas de cada prefijo.

La autorización solicitada cubre conexión/preflight y aplicación de este
manifiesto únicamente si se superan todos los requisitos. No cubre cambios
arbitrarios de Auth/Data API, bootstrap, cuentas, datos de prueba, pruebas RPC
de escritura ni reversión destructiva. No se interpreta un fallo de preflight
como permiso para modificar opciones remotas o desactivar RLS.

**A. Preflight; ningún DDL de aplicación hasta completar todos los puntos.**

1. En Dashboard, contrastar nombre, URL/ref y organización con el destino local
   elegido por el usuario. Revisar que la Publishable key pertenezca a ese mismo
   proyecto y esté habilitada. Los valores solo se revisan en la terminal/editor
   del usuario. Si se corrige el archivo local, mantener permisos `600`; si
   cambia el ref, detenerse y volver a confirmar el destino antes de continuar.
2. Confirmar Data API habilitada y esquemas expuestos: `public` presente;
   `app_private` y `auth` ausentes. Reutilizar el diagnóstico 2B.3A: OpenAPI
   devuelve 401 por exigir clave secreta, mientras Auth acepta la publicable.
   No exigir HTTP 200 de OpenAPI ni cambiar la clave para sortear esa restricción.
   La aceptación de Auth no reemplaza la revisión de Data API en Dashboard.
3. Confirmar la versión PostgreSQL real y ajustar `db.major_version` local a
   ella; no inferir versión desde el TOML. Mantener la aplicación detenida.
4. Confirmar proyecto sin esquema de negocio previo, usuarios a preservar ni
   historial de migraciones inesperado. Verificar respaldo/restauración realmente
   disponible y guardar fuera de Git el estado inicial de esquema e historial.
   No asumir que existe PITR ni que un dry-run crea un punto de restauración.
5. Autenticar al operador por CLI interactiva y enlazar solo el ref fijado en
   `.supabase-local/target.json`. La Publishable key no autentica la CLI. No
   copiar tokens CLI a `.env.local` ni variables `VITE_*`. Después de link,
   comprobar localmente que `.temp/project-ref` coincida con el ref fijado.
6. Contrastar nombres/hashes con el manifiesto ya aprobado, inspeccionar historial
   y dry-run. La lista debe contener exactamente las cuatro versiones, en orden.
   Ante cualquier objeto o versión ajenos, hash distinto o destino diferente,
   detenerse y presentar el hallazgo antes de pedir una autorización ajustada.

**B. Aplicación y cierre de DDL.**

7. Si la autorización incluye aplicación condicionada y A está completamente
   satisfecho, ejecutar una sola vez el push indicado abajo. Registrar versiones
   confirmadas y resultado, sin credenciales. Ante error, no reintentar todo el
   lote: inspeccionar primero transacción e historial.
8. Realizar solo comprobaciones de lectura: cuatro versiones; 9 tablas públicas
   y 4 privadas con RLS; FK, índices, políticas y grants esperados; funciones con
   propietarios de confianza y search_path fijo; dos relaciones calculadas;
   ausencia de triggers propios Auth y función privada de provisión; publicación
   Realtime con las tres tablas; 35 plantillas.
   No activar la aplicación ni ejecutar altas RPC para "ver si funciona".
9. Entregar evidencias de aplicación y sus límites. La creación de la cuenta
   inicial y el bootstrap pasan por la autorización adicional siguiente.

Comandos para **una fase futura autorizada**, con la CLI fijada:

```bash
cd /home/procont/projects/ticketera-procont
PROCONT_SUPABASE_CLI=/home/procont/.local/lib/supabase-cli/3.2.0/supabase
"$PROCONT_SUPABASE_CLI" login
# Leer el ref del destino local fijado, sin mostrar su contenido:
PROCONT_SUPABASE_PROJECT_REF=$(python3 -c 'import json; print(json.load(open(".supabase-local/target.json"))["project_ref"])')
"$PROCONT_SUPABASE_CLI" link --project-ref "$PROCONT_SUPABASE_PROJECT_REF"
# Esta comprobación local no muestra el ref y evita un destino CLI diferente:
python3 -c 'import json; from pathlib import Path; expected=json.load(open(".supabase-local/target.json"))["project_ref"]; actual=Path("supabase/.temp/project-ref").read_text().strip(); assert actual == expected, "El destino CLI no coincide; detenerse"'
"$PROCONT_SUPABASE_CLI" migration list --remote
"$PROCONT_SUPABASE_CLI" db push --remote --skip-vault --dry-run
# Solo con aprobación explícita y TODOS los puntos de A satisfechos:
"$PROCONT_SUPABASE_CLI" db push --remote --skip-vault --yes
```

No se ejecutó ninguno de esos comandos remotos. No utilizar `--debug`, `set -x`,
`--include-seed`, `--include-roles`, `--include-all`, `config push`, `db reset`
o `migration repair` como parte del procedimiento normal. No pasar contraseñas
en argumentos o URLs. La CLI puede solicitar credenciales de plataforma/DB.
Incluso listar o simular puede requerir inicialización de credenciales/roles
temporales en plataforma: por esa razón no se ejecutó un dry-run remoto bajo
la restricción actual. `--skip-vault` excluye la sincronización de secretos Vault.

## Primer superadmin — preparación, no asignación

Requisitos: etapa B correcta, propietarios/grants comprobados; autorización
adicional para crear cuenta y conceder rol; identidad y correo elegidos por el
usuario; cuenta Auth en el mismo destino y UUID real contrastado en
Authentication → Users; ausencia de un superadmin activo. No hay emails,
contraseñas ni UUID reales prefijados. No utilizar la clave publicable para
ejecutar una operación de propietario.

Solo con autorización adicional para crear esa cuenta y conceder el rol:

1. Crear la cuenta Auth solo por un mecanismo autorizado de administración de
   confianza. No hay trigger propio: el propietario provisiona su perfil con la
   función privada; bootstrap también la utiliza. Ninguna de esas acciones se
   ejecuta en esta fase ni se autoriza por preparar migraciones.
2. Como propietario, invocar `app_private.bootstrap_superadmin(uuid)` con su
   UUID confirmado. No hacerlo mediante Data API ni conceder EXECUTE público.
3. Comprobar perfil activo/rol, un superadmin activo y evento privado de bootstrap;
   probar login solo cuando esté autorizado iniciar esa integración.
   La función impide repetir bootstrap si ya existe superadmin activo.

La única llamada de asignación prevista es la función existente, desde SQL
Editor como propietario o una conexión administrativa autorizada:

```sql
-- PROCEDIMIENTO FUTURO: sustituir el marcador por el UUID contrastado en Auth.
-- No ejecutar este bloque durante la preparación ni desde el navegador.
SELECT app_private.bootstrap_superadmin('UUID_REAL_CONFIRMADO_EN_AUTH'::uuid);
```

La función realiza la asignación y su auditoría dentro de la misma transacción.
Si falla, no forzar UPDATE de roles o grants alternativos. Si se perdió la
respuesta, comprobar perfil/auditoría antes de reintentar. Si se eligió una
identidad incorrecta, detenerse y solicitar un procedimiento correctivo
autorizado; no eliminar al último superadmin como mecanismo de reversión.

La autorización de migraciones no se interpreta como autorización para crear
cuentas ni ejecutar bootstrap. No usar `admin_setup.sql` o cuentas demo.

## Reversión y riesgos

Este diseño inicial se concreta en los cuerpos de `supabase/recovery/`, el
generador offline `scripts/build_migration_recovery.py` y el plan 2B.3B. Los
cuerpos no son migraciones ni se ejecutan sueltos. Las ACL de `public`, tablas,
columnas y helpers se restituyen desde capturas, no desde permisos supuestos.
El bundle 2B.3D compensa el prefijo completo en orden inverso y conserva el
historial. Su ajuste se hace después mediante CLI repair autorizado, en otra
transacción, con las versiones exactas del repair-plan; no hay DELETE manual
remoto del ledger ni atomicidad conjunta entre compensación y reparación.
Se rechaza ante drift o datos nuevos. No hay restauración automática en Free.

| Momento | Respuesta prevista |
|---|---|
| Antes del primer DDL | Cancelar; no hay esquema nuevo que revertir. Desvincular la CLI local, si se enlazó, no revierte nada en servidor |
| Falla una migración | Su transacción revierte; inspeccionar qué versiones anteriores sí se confirmaron. Detener frontend/altas y corregir el fallo con una intervención revisada, sin reejecución ciega |
| Lote aplicado y aún sin datos/usuarios | Preparar una migración compensatoria específica, revisada y autorizada, sobre los objetos creados por esta secuencia; no ejecutar `DROP SCHEMA public CASCADE` ni borrar plataforma |
| Ya existen cuentas o datos | Priorizar corrección hacia adelante. Una restauración solo puede usarse si existe un respaldo adecuado y se aprueba su pérdida de cambios posteriores |

La compensación vigente no retira triggers propios de Auth, que ya no se crean.
Retira los triggers de tablas propias y entradas añadidas a publicación, después RPC/políticas, relaciones FK
circulares y objetos de negocio en orden inverso. Preservar `auth`, `storage`,
roles de plataforma y `supabase_realtime` como publicación. La carga 4 no debe
borrarse ciegamente si alguien modificó las plantillas después.

Hay compensaciones preparadas y probadas localmente, pero no un down remoto
autorizado. Eliminar entradas del historial o marcar
una versión como reverted **no deshace su SQL**. Una compensación necesita una
autorización propia, alcance exacto y registro de historial coherente. No se
ejecutó ningún script destructivo remoto. Los scripts locales de 2B.3B no
autorizan por sí mismos su ejecución en Supabase.

## Verificaciones reales posteriores pendientes

- Auth: bootstrap, perfil inactivo, login/logout, revocación y jerarquía de roles.
- RPC: alta REQ/INT, reintento con misma clave, aprobación/rechazo, checklist,
  cambio de tipo, datos del solicitante y purga con registros ficticios.
- PostgREST: caché de esquema, relaciones calculadas con las dos FK, retorno
  de filas/void y seguimiento por número+token sin SELECT público a tablas.
- RLS/grants: las 13 tablas con RLS, anonimato limitado a dos RPC, protección
  de columnas, perfiles activos, autoría y notificaciones propias; `app_private`
  no expuesto. Propietarios de objetos y SECURITY DEFINER deben ser de confianza.
- Realtime: `projects`, `project_flows`, `notifications` publicados y visibilidad
  bajo RLS; contador de solicitudes por el sondeo previsto en 2B.1.
- Historial: cuatro versiones, hashes revisados, 35 plantillas y ninguna cuenta
  o registro empresarial incorporado por la migración.

Reutilizar las evidencias previas; no repetir íntegramente las suites de 72 SQL
y 19 consumidores. La preparación `c6e79f4` dejó **8 pruebas nuevas** del
asistente, sin red, más validación local CLI/TOML y hashes. Su corrección
`28acd95` dejó una prueba nueva de entradas visibles/URL inválida. Este cierre
no vuelve a ejecutar ninguna de esas pruebas: solo verifica presencia,
permisos, exclusiones y coherencia de la configuración local ya capturada.
Evidencias: [asistente](validation/fase-2b2-preparation.txt),
[CLI](validation/fase-2b2-cli.json). No se recompiló ni modificó el frontend.

## Decisión pendiente

Preparación y recuperación local completadas (2B.3B); aplicación remota no
autorizada. Data API, exposición e historial vacío se aceptan como confirmaciones
manuales del usuario y no se repiten. **NO APTO todavía para aplicar remoto**:
pendientes baseline real de recuperación y permisos efectivos de la conexión
CLI/fuente Auth. La versión 17.12 ya fue reportada. Las lecturas adicionales requieren autorización de SQL administrativo de
lectura, todavía no concedida. El 401 explicado no requiere cambiar credenciales.
Aplicación, compensación destructiva, bootstrap, cuentas y pruebas remotas con
escrituras mantienen autorizaciones independientes.

Referencias oficiales: [claves](https://supabase.com/docs/guides/getting-started/api-keys),
[CLI y opciones de db push](https://supabase.com/docs/reference/cli/supabase-db-push),
[identidad del proyecto](https://supabase.com/docs/reference/api/v1-get-project) y
[configuración Data API](https://supabase.com/docs/reference/api/v1-get-postgrest-service-config).
