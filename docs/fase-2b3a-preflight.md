# FASE 2B.3A — Diagnóstico de conectividad y preflight

> **Revisión documental 20/11/2026 · base `c857a727c8e7640bbce8daada940f973acbf013e` · clasificación: HISTÓRICO.**
> Fuente oficial: [PRODUCT_REQUIREMENTS](specs/PRODUCT_REQUIREMENTS.md); estado operativo: [PROJECT_STATUS](PROJECT_STATUS.md).
> Informe histórico de una fase ya cerrada; sus estados «pendiente», conteos parciales y comandos corresponden a su fecha. M1–M15 están aplicadas según evidencia del 20/11. No repetir preparación, bootstrap, compensaciones o consultas antiguas para operar el sistema actual.

## Alcance del documento anterior

El contenido siguiente conserva sus fechas y evidencias originales. Los estados de activación o contratos sustituidos no se consideran vigentes; prevalecen las especificaciones enlazadas arriba.

**Resultado posterior reportado y tratamiento 2B.3D:** PostgreSQL 17.12, operador
SQL Editor postgres, Auth de otro propietario, ledger inexistente y seis event
triggers administrados. No se repitió la lectura. [Resolución de bloqueos](fase-2b3d-resolucion-bloqueos.md)
revisa M3 y la recuperación; la ausencia de ledger no exige SQL manual.

**Consulta pendiente de ejecución manual, base `11b2c15`:**
[preflight de catálogos](fase-2b3-catalog-preflight.md) contiene una sola sentencia
de lectura para versión numérica, objetos y privilegios. El agente no la ejecutó.
No repite la conectividad ni las comprobaciones Dashboard y no consulta registros
de negocio, cuentas o versiones del historial. Los resultados siguen pendientes.

**Continuación 2B.3B (17/11/2026):** comprobaciones visuales ya completadas por
el usuario, sin nuevas peticiones: Data API habilitada; esquemas `public` y
`extensions`; historial vacío; sin tablas de negocio; Free sin backups
automáticos/PITR. «Última versión soportada» no aporta número de PostgreSQL.
La recuperación está preparada y probada solo localmente en
[el plan 2B.3B](fase-2b3b-recovery-plan.md). NO APTO todavía para aplicar remoto:
faltan inventario real de catálogo/ACL y versión numérica/privilegios del operador.

17/11/2026. Base: `f77c378`. Alcance autorizado: diagnóstico local y GET de
conectividad/metadatos, sin registros de negocio ni SQL remoto.

## Resultado confirmado

La causa del 401 reproducido es la restricción de acceso a **la raíz OpenAPI**
con una clave publicable. El servidor contestó:

```json
{"message":"Secret API key required","hint":"Only secret API keys can be used for this endpoint."}
```

La misma clave y URL obtuvieron **HTTP 200** en configuración pública Auth.
El control sin clave obtuvo **HTTP 401**, «No API key found in request».
Esto confirma que la clave configurada es aceptada para ese destino y servicio.
No hace falta cambiar `.env.local`, añadir una clave secreta ni iniciar sesión
para explicar el 401 original. No hubo acceso a usuarios ni creación de sesiones.

La respuesta original solo conservaba estado HTTP; no se puede reconstruir su
cuerpo descartado. La repetición exacta actual aporta el mensaje causal que
faltaba y permite explicar el fallo persistente del mismo método de prueba.

Supabase anunció la retirada de acceso público a OpenAPI para nuevos proyectos
desde marzo de 2026 y para los existentes en abril. El comportamiento observado
es coherente con ese cambio; el texto específico para la clave publicable se
constató directamente en este destino. [Anuncio oficial](https://github.com/orgs/supabase/discussions/42949).

## Petición que produjo el 401

`scripts/prepare_supabase_local.py:103–122`, función `probe_data_api`:

- Método `GET`, HTTPS al origen fijado en el archivo privado de destino.
- Ruta exacta `/rest/v1/`, sin query: solicita el documento OpenAPI.
- Encabezados explícitos `apikey: [omitida]` y
  `Accept: application/openapi+json`; **sin Authorization**.
- urllib añade Host, User-Agent Python-urllib y encabezados de transporte.
  Timeout 20 segundos, sin proxies de entorno ni seguimiento de redirecciones.
- Ante HTTPError, el asistente guarda únicamente código y `reason=http_error`;
  cierra y descarta el cuerpo. Por eso el registro anterior no permitía distinguir
  una clave inválida de la restricción del endpoint.
- `accepted` exige HTTP 200 y un documento JSON con `paths`. Es aceptación de
  OpenAPI, no una prueba universal de Data API ni del par URL/clave.

El asistente se conserva sin cambios en esta fase diagnóstica. Para una captura
nueva, usar `--offline` según 2B.2; no repetirlo sobre la configuración existente.
Una futura mejora deberá distinguir descubrimiento OpenAPI, aceptación de clave
y configuración Data API. No debe reemplazar el endpoint por otro y llamarlo
«Data API validada» sin comprobar ese servicio.

## Evidencia nueva, acotada

[fase-2b3a-connectivity.json](validation/fase-2b3a-connectivity.json) contiene
horas UTC, método, rutas, presencia de encabezados, estados y errores saneados.
Omite URL, project ref, claves, identidades, cuerpos de éxito y opciones Auth.

| Petición | Clave / Authorization | Resultado | Alcance probado |
|---|---|---|---|
| GET `/rest/v1/`, Accept OpenAPI | Publicable / ausente | 401, requiere clave secreta | Restricción del descubrimiento de esquema |
| GET `/auth/v1/settings`, Accept JSON | Publicable / ausente | 200, JSON de configuración Auth | Aceptación de la clave por el destino y disponibilidad de ese servicio |
| GET `/auth/v1/settings`, control | Sin clave / ausente | 401, falta apikey | El éxito anterior no provino de un endpoint accesible sin clave |

Fueron **tres peticiones**, exclusivamente al origen que coincide con el pin
privado. No se solicitaron endpoints de tablas, RPC, usuarios, tokens ni SQL.
`.env.local` mantuvo su contenido; su huella se comparó en memoria sin publicarla.
No se modificó el estado privado histórico para ocultar el 401 inicial.

## Diferenciación de causas

| Posible causa | Conclusión |
|---|---|
| Restricción de OpenAPI por tipo de clave | **Confirmada** por el mensaje del servidor |
| Clave inválida o de otro origen | No explica el resultado actual: la clave es aceptada por Auth en el origen fijado |
| Falta de sesión o JWT de usuario | No necesaria para el GET público Auth; no se añade Bearer ni se intenta login para abrir OpenAPI |
| Data API deshabilitada | Descartada por confirmación manual posterior del usuario; no se repitió el GET |
| `public` no expuesto u otros esquemas expuestos | Usuario confirmó `public` y `extensions`; `auth`/`app_private` excluidos |
| RLS o tablas/migraciones faltantes | No hay evidencia de que causen este 401; no se probaron tablas ni políticas remotas |
| Origen distinto de `ticketera-procont` por nombre | Pin local coherente y nombre confirmado por el usuario; no hay verificación administrativa automática del nombre |

## Estado de requisitos para aplicar migraciones

| Requisito | Estado y evidencia |
|---|---|
| Destino fijado y sin redirecciones | Confirmado localmente; las tres peticiones usaron solo ese origen |
| Nombre `ticketera-procont` y organización correctos | Confirmación manual previa reutilizada; no consultada Management API |
| Par URL/clave aceptado | Confirmado en Auth con control negativo |
| Causa de 401 OpenAPI | Confirmada; no requiere corregir credenciales |
| Data API habilitada | Confirmada manualmente por usuario; sin verificación repetida |
| `public` expuesto, `auth` y `app_private` excluidos | Confirmado manualmente: lista `public`, `extensions`; TOML no se aplica al remoto |
| Versión PostgreSQL instalada | Usuario reportó 17.12 (`170012`) en inventario; major local 17 coincide; sin lectura repetida por agente |
| Historial remoto vacío | Confirmado manualmente por usuario en Dashboard; captura administrativa para recuperación pendiente |
| Ausencia de tablas de negocio previas | Revisión visual completada y confirmada por usuario |
| Respaldo/restauración y alcance de reversión | Free sin backup automático/PITR confirmado por usuario; compensaciones 2B.3B probadas localmente, no autorizadas para remoto |
| Inventario de objetos/ACL y privilegios del operador | Usuario ejecutó consulta y reportó resultados; no equivale al baseline de recuperación ni a verificar sesión CLI |
| CLI administrativa autenticada/enlazada | No realizada; la clave publicable no autentica Management API ni CLI |
| Cuatro archivos, hashes, orden | M3 revisada en 2B.3D, nuevo manifiesto preparado; 1/2/4 sin cambios |
| Compatibilidad funcional SQL/RPC | Evidencia local de 2A/2B.1 reutilizada; integración real pendiente |
| Autorización de aplicar | **No otorgada en esta fase** |

## Comprobaciones manuales sin ejecutar SQL

**Lista histórica ya completada por el usuario. No repetir.** El inventario
posterior aportó PostgreSQL 17.12. La conexión CLI y el baseline de recuperación
son asuntos distintos, todavía pendientes de autorización/comprobación.

El usuario eligió Dashboard sin token personal en 2B.2. Se mantiene esa opción:

1. En el proyecto `ticketera-procont`, revisar nombre y organización y contrastar
   Project URL/ref con el archivo local, sin pegarlos en informes o chat.
2. En la configuración **Data API**, confirmar habilitación y lista completa de
   esquemas expuestos. Debe incluir `public` y excluir `auth`/`app_private`.
   Comunicar solo estado y nombres de esquemas; no cambiar opciones en esta fase.
3. En **Settings → Infrastructure**, o la sección Database equivalente del panel,
   anotar la versión PostgreSQL **instalada**, no una actualización disponible.
   No iniciar una actualización. Después se ajustará el TOML local si corresponde.
4. En **Database → Migrations**, comprobar si hay versiones aplicadas. Una
   pantalla vacía debe distinguirse de un error de permisos/carga. Si esa vista
   no está disponible, marcar pendiente; no ejecutar consultas como alternativa.
5. Inspeccionar únicamente nombres de objetos/esquemas en la vista de esquema,
   sin abrir filas del Table Editor, para descartar tablas de negocio existentes.
   El historial vacío por sí solo no demuestra un esquema vacío.
6. Revisar disponibilidad real de respaldo/restauración y anotar sus límites,
   sin crear restauraciones ni asumir PITR por existir el proyecto.

Enviar solo: nombre confirmado, Data API sí/no, esquemas expuestos, versión
instalada, historial vacío/sus versiones, esquema de negocio vacío sí/no y
disponibilidad de restauración. No enviar claves, contraseñas ni capturas de ellas.

Si se autoriza y facilita posteriormente un mecanismo administrativo seguro,
existen alternativas **GET de Management API**, sin enviar SQL:

| Metadato | Ruta relativa a `https://api.supabase.com` | Campos mínimos a conservar |
|---|---|---|
| Identidad y PostgreSQL | `GET /v1/projects/{ref}` | Nombre, coincidencia de ref/organización, `database.version` |
| Exposición PostgREST | `GET /v1/projects/{ref}/postgrest` | `db_schema`; no confundir extra_search_path con exposición |
| Historial | `GET /v1/projects/{ref}/database/migrations` | Versiones/nombres; no cuerpos SQL ni datos personales |

Estos GET no se ejecutaron. Requieren permisos administrativos de lectura
apropiados; no sirven la clave publicable ni una sesión Auth de la aplicación.
La respuesta PostgREST puede incluir secretos según permisos: procesar con lista
de campos permitidos en memoria y nunca registrar su cuerpo completo.
El estado de habilitación de Data API debe confirmarse explícitamente en el
panel; no inferirlo solo de `db_schema`. No usar endpoints de query/migrations
POST ni probar variantes CLI que inicialicen credenciales/roles durante esta fase.
`migration list --remote` y los dry-run de CLI se reservan para otra autorización
porque implican conexión de base de datos; no son la vía usada aquí sin SQL remoto.

Referencias: [proyecto y versión](https://supabase.com/docs/reference/api/v1-get-project),
[configuración PostgREST](https://supabase.com/docs/reference/api/v1-get-postgrest-service-config),
[historial por GET](https://supabase.com/docs/reference/api/v1-list-migration-history),
[versión en Infrastructure](https://status.supabase.com/incidents/01KWB68EBBD19JAJ235CFSC4BK).

## Cuatro migraciones preparadas

Se contrastaron nombres y SHA-256 con
[el manifiesto aprobado](validation/fase-2b2-migrations.json), sin ejecutar SQL:

| Orden | Archivo | Dependencia |
|---|---|---|
| 1 | `20261117000100_schema.sql` | Base Supabase con Auth y roles de plataforma; tablas, restricciones, índices y RLS cerrado |
| 2 | `20261117000200_security.sql` | 1; helpers, permisos y políticas |
| 3 | `20261117000300_operations.sql` | 1+2, rol service_role; RPC transaccionales, integridad, bootstrap y Realtime |
| 4 | `20261117000400_reference_checklists.sql` | Tabla de plantillas de 1; 35 pasos genéricos |

Las cuatro siguen preparadas **como artefactos locales**, cada una con su
transacción; el conjunto no es atómico. La aptitud del destino aún depende de
los requisitos pendientes. Se conservan las 72 comprobaciones SQL de 2A y las
19 pruebas locales de 2B.1; no se repitieron ni se volvió a compilar frontend.
No se modificaron migraciones, aplicación, asistente, dependencias ni `.env.local`.
Se validaron la estructura/coherencia del JSON nuevo, la ausencia de los valores
reales de configuración en los tres archivos de entrega y el formato del diff.

## Decisión

Diagnóstico del 401 completado. Se corrigió la exigencia errónea de obtener
HTTP 200 en OpenAPI. Las cinco comprobaciones Dashboard fueron confirmadas
manualmente después de este diagnóstico, sin repetir llamadas ni pruebas.
2B.3B aporta compensación y 26 pruebas locales específicas. **NO APTO todavía
para aplicar remoto**, hasta disponer del baseline y privilegios reales de
conexión CLI. En 2B.3D el usuario ya reportó 17.12 y metadatos; no se repitió esa
consulta ni se aplicó ninguna migración o SQL remoto por el agente,
cambio de configuración, cuenta o bootstrap. Las autorizaciones siguen separadas.
