# FASE 2B.2 — Preparación de Supabase

17/11/2026. Base funcional: `eceb849`; preparación: `c6e79f4`; asistente con
entradas visibles: `28acd95`. Cierre de preparación después de la captura local
confirmada por el usuario. Este informe complementa FASE 2A y sustituye los
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
- `.env.local` existe con permisos `600`; sus dos variables están presentes,
  no están versionadas y la URL coincide con el destino privado fijado. Los
  archivos de estado tienen permisos `600`, dentro de un directorio `700`.
- El usuario confirmó `ticketera-procont` desde Dashboard. Se conserva esa
  confirmación manual, sin presentarla como verificación de Management API.
- La evidencia existente de Data API contiene **HTTP 401** (`accepted=false`).
  No se repitió la petición. No están confirmados la correspondencia funcional
  URL/clave, los esquemas expuestos ni la versión PostgreSQL remota.
- **No apto todavía para ejecutar DDL**: primero hay que resolver el 401 y
  comprobar los requisitos remotos. Puede autorizarse la siguiente fase de
  forma condicionada a superar esas comprobaciones.

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
ni credenciales. El asistente no inicia Vite. El 401 registrado debe tratarse
como un resultado no satisfactorio; por sí solo no distingue clave incorrecta,
clave de otro destino, restricciones de API u otra causa. No atribuirlo a la
falta de migraciones ni repetir peticiones sin una corrección o motivo concreto.

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

## Procedimiento definitivo — requiere autorización para 2B.3

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
   `app_private` y `auth` ausentes. Resolver el 401. Solo tras una revisión o
   corrección concreta realizar un GET de OpenAPI, sin enviar SQL ni llamar RPC
   de escritura; conservar estado/HTTP, no respuesta ni credenciales. Si sigue
   fallando, detenerse. Un resultado 200 no reemplaza la revisión de exposición.
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
   triggers Auth; publicación Realtime con las tres tablas; 35 plantillas.
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

1. Crear la cuenta Auth por un mecanismo de administración de confianza. El
   trigger genera un perfil viewer inactivo, ignorando roles de metadatos.
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
y 19 consumidores. La preparación `c6e79f4` dejó **8 pruebas nuevas** del
asistente, sin red, más validación local CLI/TOML y hashes. Su corrección
`28acd95` dejó una prueba nueva de entradas visibles/URL inválida. Este cierre
no vuelve a ejecutar ninguna de esas pruebas: solo verifica presencia,
permisos, exclusiones y coherencia de la configuración local ya capturada.
Evidencias: [asistente](validation/fase-2b2-preparation.txt),
[CLI](validation/fase-2b2-cli.json). No se recompiló ni modificó el frontend.

## Decisión pendiente

Preparación local completada; aplicación remota no autorizada. Se solicita
autorización para iniciar 2B.3 con preflight y aplicación condicionada de las
cuatro migraciones. El 401, la exposición Data API, la versión PostgreSQL y el
historial remoto son condiciones de parada hasta comprobarlos. El bootstrap,
las cuentas y las pruebas con escrituras requieren autorización adicional.

Referencias oficiales: [claves](https://supabase.com/docs/guides/getting-started/api-keys),
[CLI y opciones de db push](https://supabase.com/docs/reference/cli/supabase-db-push),
[identidad del proyecto](https://supabase.com/docs/reference/api/v1-get-project) y
[configuración Data API](https://supabase.com/docs/reference/api/v1-get-postgrest-service-config).
