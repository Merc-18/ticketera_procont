# FASE 2B.2 — Preparación de Supabase

17/11/2026. Base: `eceb849`. Este informe complementa FASE 2A y sustituye los
comandos de conexión de 2B.1 para la CLI instalada **3.2.0**.

## Estado

- CLI oficial instalada fuera del repositorio en
  `/home/procont/.local/lib/supabase-cli/3.2.0/supabase`; SHA-256 del archivo de
  distribución comprobado contra `checksums.txt` de la misma publicación.
- `supabase init` ejecutado únicamente en local. `supabase/config.toml` validado
  mediante `config validate`: válido, sin advertencias ni contacto con la API.
- Data API local: habilitada, esquemas `public` y `graphql_public`;
  `app_private` y `auth` no expuestos. Seeds deshabilitados y sin rutas.
- `db.major_version=17` es el valor predeterminado de esta CLI, **no una versión
  remota comprobada**. Antes de enlazar, confirmar en Dashboard la versión real
  y ajustar ese valor local si corresponde. El SQL previo se probó en 18.6.
- No hay login/link CLI, cambios de configuración remota, SQL externo,
  migraciones aplicadas, usuarios ni privilegios asignados por esta fase.
- Al preparar este informe todavía se espera la captura local del usuario.
  No se afirma que exista `.env.local` ni que el destino real esté verificado.
  El resultado posterior se conserva solo en `.supabase-local/status.json`.

La configuración TOML es local: `project_id="ticketera-procont"` no acredita
el nombre del proyecto alojado. No ejecutar `config push` para trasladarla.

## Captura local sin revelar valores

El usuario eligió introducir URL y clave y confirmar el destino desde Dashboard,
sin proporcionar token personal. Ejecutar desde una terminal interactiva:

```bash
python3 /home/procont/projects/ticketera-procont/scripts/prepare_supabase_local.py
```

Pide Project URL, Publishable key y el nombre observado en Dashboard mediante
entrada oculta. Exige el nombre exacto `ticketera-procont` y una URL HTTPS
canónica. Rechaza claves secretas, JWT, placeholders y configuración existente;
no sobrescribe archivos. No solicita contraseñas ni tokens Management API.

Guarda `.env.local` con las dos variables requeridas y permisos `600`:
`VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`. El directorio privado
`.supabase-local/` tiene permisos `700`; contiene el destino fijado en
`target.json` y un resumen sin valores de entorno en `status.json`. Los tres
archivos están ignorados por Git. No imprimirlos con `cat`, `env` ni logs.

El único contacto opcional es **GET `/rest/v1/`** con la clave publicable, para
recibir OpenAPI. No sigue redirecciones, no consulta registros, no llama RPC,
Auth o Management API y no ejecuta SQL. `--offline` permite guardar sin ese GET.
Un GET aceptado confirma disponibilidad de Data API/clave, **no el nombre del
proyecto ni RLS**. Si falla, se registra como pendiente, sin mostrar respuesta
ni credenciales. El asistente no inicia Vite.

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

El manifiesto [fase-2b2-migrations.json](validation/fase-2b2-migrations.json)
fija nombres, orden y hashes. El asistente comprueba que sean exactamente cuatro
archivos y que su contenido no cambió. No se añadieron ni alteraron migraciones.

| Orden / archivo en `supabase/migrations/` | Dependencias y efectos |
|---|---|
| 1 — `20261117000100_schema.sql` | Supabase ya debe proporcionar `auth.users`, `auth.uid()`, roles `anon`/`authenticated`; crea 9 tablas públicas, 4 privadas, índices, FK y RLS inicialmente cerrado |
| 2 — `20261117000200_security.sql` | Requiere 1; helpers, políticas y permisos de columnas; ningún perfil se activa por esta migración |
| 3 — `20261117000300_operations.sql` | Requiere 1+2 y rol `service_role`; RPC, numeración, integridad diferida, trigger Auth, bootstrap, relaciones PostgREST y publicación de 3 tablas si existe `supabase_realtime` |
| 4 — `20261117000400_reference_checklists.sql` | Requiere tabla de plantillas de 1; carga 35 pasos genéricos, sin cuentas ni registros empresariales |

Cada archivo contiene su propia transacción. **El lote de cuatro no es una
única transacción:** si falla el tercero, los dos primeros pueden permanecer
aplicados. No reejecutar migraciones ya confirmadas ni usar scripts SQL raíz,
`tests/support/auth_stub.sql`, `setup.js` o seeds para resolver un fallo.

## Plan de ejecución — requiere autorización explícita posterior

1. Confirmar destino fijado, versión PostgreSQL, proyecto vacío, historial y
   permisos del operador. Guardar fuera de Git el estado inicial del esquema y
   del historial y verificar qué respaldo/restauración ofrece el plan contratado;
   no asumir que existe PITR. Confirmar que no hay usuarios o datos a preservar.
2. Dar acceso CLI al operador mediante login interactivo de plataforma. La clave
   publicable **no autentica la CLI**. Enlazar exclusivamente el ref del destino
   fijado en `.supabase-local/target.json`; no seleccionar proyectos por similitud
   de nombre. No se guardan tokens CLI en `.env.local` ni variables `VITE_*`.
3. Inspeccionar historial y el dry-run. Detenerse ante cualquier versión remota
   inesperada, objeto existente o lista distinta de las cuatro migraciones.
4. Presentar destino, hashes y resultado de preflight para autorización de DDL;
   aplicar las cuatro migraciones y conservar resultados sin credenciales.
5. Verificar historial, objetos, RLS, grants, funciones y publicación antes de
   iniciar la aplicación o crear la cuenta inicial.

Comandos para **una fase futura autorizada**, con la CLI fijada:

```bash
cd /home/procont/projects/ticketera-procont
PROCONT_SUPABASE_CLI=/home/procont/.local/lib/supabase-cli/3.2.0/supabase
"$PROCONT_SUPABASE_CLI" login
# Leer el ref del destino local fijado, sin mostrar su contenido:
PROCONT_SUPABASE_PROJECT_REF=$(python3 -c 'import json; print(json.load(open(".supabase-local/target.json"))["project_ref"])')
"$PROCONT_SUPABASE_CLI" link --project-ref "$PROCONT_SUPABASE_PROJECT_REF"
"$PROCONT_SUPABASE_CLI" migration list --remote
"$PROCONT_SUPABASE_CLI" db push --remote --skip-vault --dry-run
# Solo tras aprobación explícita para aplicar el manifiesto revisado:
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

Requisitos: cuatro migraciones confirmadas; propietario/operador autorizado;
identidad inicial definida por el usuario; cuenta Auth con correo en el mismo
destino; UUID real contrastado en Authentication → Users; ausencia de un
superadmin activo. No hay emails, contraseñas o UUID reales prefijados.

Solo con autorización adicional para crear esa cuenta y conceder el rol:

1. Crear la cuenta Auth por un mecanismo de administración de confianza. El
   trigger genera un perfil viewer inactivo, ignorando roles de metadatos.
2. Como propietario, invocar `app_private.bootstrap_superadmin(uuid)` con su
   UUID confirmado. No hacerlo mediante Data API ni conceder EXECUTE público.
3. Comprobar perfil activo/rol y evento privado de bootstrap; probar login.
   La función impide repetir bootstrap si ya existe superadmin activo.

La autorización de migraciones no se interpreta como autorización para crear
cuentas ni ejecutar bootstrap. No usar `admin_setup.sql` o cuentas demo.

## Reversión y riesgos

| Momento | Respuesta prevista |
|---|---|
| Antes del primer DDL | Cancelar; no hay esquema nuevo que revertir. Desvincular la CLI local, si se enlazó, no revierte nada en servidor |
| Falla una migración | Su transacción revierte; inspeccionar qué versiones anteriores sí se confirmaron. Detener frontend/altas y corregir el fallo con una intervención revisada, sin reejecución ciega |
| Lote aplicado y aún sin datos/usuarios | Preparar una migración compensatoria específica, revisada y autorizada, sobre los objetos creados por esta secuencia; no ejecutar `DROP SCHEMA public CASCADE` ni borrar plataforma |
| Ya existen cuentas o datos | Priorizar corrección hacia adelante. Una restauración solo puede usarse si existe un respaldo adecuado y se aprueba su pérdida de cambios posteriores |

La compensación debe retirar primero los triggers Auth `procont_auth_profile_*`
y las entradas añadidas a publicación, después RPC/políticas, relaciones FK
circulares y objetos de negocio en orden inverso. Preservar `auth`, `storage`,
roles de plataforma y `supabase_realtime` como publicación. La carga 4 no debe
borrarse ciegamente si alguien modificó las plantillas después.

No hay un down automático aprobado. Eliminar entradas del historial o marcar
una versión como reverted **no deshace su SQL**. Una compensación necesita una
autorización propia, alcance exacto y registro de historial coherente. No se
generó ni ejecutó un script destructivo de reversión.

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
y 19 consumidores. En esta fase solo se ejecutaron **8 pruebas nuevas** del
asistente de preparación, sin red, más validación local CLI/TOML y hashes.
Evidencias: [asistente](validation/fase-2b2-preparation.txt),
[CLI](validation/fase-2b2-cli.json). No se recompiló ni modificó el frontend.

Referencias oficiales: [claves](https://supabase.com/docs/guides/getting-started/api-keys),
[CLI y opciones de db push](https://supabase.com/docs/reference/cli/supabase-db-push),
[identidad del proyecto](https://supabase.com/docs/reference/api/v1-get-project) y
[configuración Data API](https://supabase.com/docs/reference/api/v1-get-postgrest-service-config).
