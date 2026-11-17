# Preflight de catálogos — consulta manual de solo lectura

**Continuación 2B.3D:** el usuario ejecutó este inventario y comunicó PostgreSQL
17.12 y los bloqueos. Los resultados recibidos y las correcciones están en
[resolución de bloqueos](fase-2b3d-resolucion-bloqueos.md). El SQL v1 se conserva
como el artefacto histórico ejecutado por el usuario; los checks de propiedad
Auth y ledger ausente ya no son los requisitos vigentes. El seguimiento v2 está
preparado aparte y no se ejecutó. No confundir SQL Editor con conexión CLI.

Base confirmada: `11b2c15`, FASE 2B.3C cerrada. Esta entrega prepara un archivo;
**la consulta no fue ejecutada**, ni localmente ni en Supabase. No hay resultados
remotos nuevos, ni autorización para modificar Supabase o aplicar migraciones.

## Archivo y ejecución manual

Abrir [fase-2b3-catalog-preflight.sql](validation/fase-2b3-catalog-preflight.sql),
copiar su contenido completo al SQL Editor del proyecto `ticketera-procont` ya
confirmado y ejecutarlo manualmente. Es **una única sentencia WITH…SELECT**;
no añadir otro inventario, comandos de sesión, login, SQL histórico o migraciones.
No requiere claves, contraseñas, tokens ni una conexión CLI.

Desactivar o ampliar el límite de resultados del editor y exportar todas las
filas. La cantidad exportada debe ser igual a `total_metadata_rows`, que se
repite en cada fila; `metadata_row_number` debe cubrir 1…N sin huecos.
Una exportación truncada o
un error no demuestra ausencia de objetos. No recortar las secciones finales.
Si hay error de permisos, conservar el mensaje saneado y detenerse: no conceder
privilegios ni cambiar de rol automáticamente para obtener un resultado.

El resultado contiene nombres y permisos internos; conservarlo de forma privada,
fuera de Git. No publicar credenciales ni capturas de otras secciones del panel.

## Qué obtiene y qué evita

| Sección | Contenido |
|---|---|
| `00_context` | `server_version_num` entero exacto; versión legible y major; base/OID; `current_user` y `session_user`; alcance y límites |
| `01_summary`, `02_checks` | Comprobaciones preliminares de compatibilidad; requisitos fallidos y pendientes |
| `03_collisions` | Colisiones con nombres de tablas, índices, tipos y todas las sobrecargas RPC de la secuencia preparada |
| `10_schemas` | Todos los esquemas, propietarios, privilegios efectivos y conteos **de objetos del catálogo** |
| `20`–`26` | Relaciones/tablas/vistas/secuencias/índices, columnas/tipos, restricciones, rutinas y otros objetos de esquemas no internos: operadores, collations, conversiones, búsqueda de texto y definiciones de estadísticas |
| `30`–`33` | Políticas (roles, comando, modo y presencia de condiciones), triggers de fila/internos, event triggers y reglas; sin cuerpos ni expresiones |
| `40`–`44` | ACL de base/esquemas/objetos/columnas, grantor/grantee/grant option; defaults de permisos; atributos y membresías de roles PostgreSQL; lenguajes |
| `50`–`52` | Publicaciones, propietario/operaciones/ALL TABLES; tablas añadidas explícitamente; membresías por esquema |
| `60`–`61` | Extensiones, versiones y dependencias de objetos pertenecientes a extensiones |

Los nombres de todos los esquemas están incluidos. El detalle de objetos omite
`pg_*` e `information_schema`, cuyos objetos se cuentan por esquema. Sí incluye
los esquemas gestionados como `auth`, `storage`, `realtime`, `extensions` y
`supabase_migrations`. Los objetos no internos se identifican por nombre, OID,
tipo y propietario; no se extrae un dump de definiciones.

En publicaciones, las tablas explícitas y los alcances automáticos se muestran
por separado: no se expande artificialmente ALL TABLES, particiones ni tablas
alcanzadas por un esquema. No se extraen filtros de filas/columnas de publicación.
La membresía por esquema se identifica mediante sus dependencias de catálogo;
no se referencia directamente el catálogo añadido en PG15 para poder informar
una versión anterior sin fallar solo por esa ausencia. La recuperación existente
requiere PostgreSQL 15+; esto se marca como comprobación separada. No se ha
validado por ejecución la consulta en ninguna versión del servidor.

**No se leen filas de tablas de negocio, `auth.users`, storage, Realtime ni
`supabase_migrations.schema_migrations`.** Ver que una tabla exista y comprobar
sus privilegios no equivale a consultarla. No se usa COUNT de esas tablas,
estimaciones de filas, contenido de estadísticas, checksums de registros,
`query_to_xml` ni SQL dinámico. Los únicos COUNT son sobre metadatos del catálogo
y resultados derivados de la propia consulta.

No se consultan passwords, configuraciones de roles/rutinas, opciones de conexión,
suscripciones ni mapeos de usuarios externos. Se eligen columnas explícitas de
la vista segura `pg_roles`, sin `pg_authid`. No se obtienen cuerpos de funciones,
defaults ni expresiones SQL que puedan contener constantes sensibles. Los roles
PostgreSQL del resultado son metadatos administrativos, no cuentas de la aplicación.
Las únicas configuraciones leídas son versión numérica, versión legible y el
indicador `transaction_read_only`; la sentencia no cambia ese indicador ni la sesión.

## Cómo interpretar la compatibilidad

`PASS` significa que el requisito concreto se pudo comprobar en catálogos para
**el rol que ejecuta esta sentencia**. `BLOCKER` identifica una condición que no
satisface la base prevista o el procedimiento de recuperación. `PENDING` indica
que la consulta no puede demostrarla con el alcance autorizado.

Se comprueban, entre otros, CREATE/TEMP de base, USAGE/CREATE de `public`,
propiedad efectiva de `public`, grantors compatibles con compensación, roles
de plataforma, ausencia de `app_private` y nombres reservados por la secuencia.
También la estructura/referencia/privilegio TRIGGER de Auth, retorno UUID y
EXECUTE de `auth.uid()` **sin invocarla**, UUID nativo y lenguajes disponibles.
La comprobación de forma Auth acepta los tipos text/varchar previstos; una
variante de tipos se marca para revisión en vez de asumir compatibilidad.

Para retirar triggers propios de Auth se comprueba propiedad de la tabla;
tener TRIGGER no basta. Para modificar una publicación se comprueba propiedad
de la publicación; las tablas nuevas deberían pertenecer al operador de la
migración. Se informa membresía y disponibilidad inmediata de privilegios
(`pg_has_role(...,'USAGE')`); no se ejecuta SET ROLE ni se presupone que una
membresía permita ejercer todos los derechos sin cambiar de rol.

Se comprueba existencia/forma del ledger y sus privilegios SELECT/INSERT/DELETE,
**no sus versiones ni si tiene filas**. Si falta, se marca como bloqueo para la
preparación de recuperación; no se crea. La ausencia de cuentas o datos también
queda pendiente por diseño. Se conservan como evidencia diferenciada las
confirmaciones Dashboard previas, sin convertirlas en verificación SQL nueva.

Los event triggers activos requieren revisión adicional: se enumeran, pero
no se ejecutan ni inspeccionan sus cuerpos. Tampoco se demuestra qué rol usará
una futura CLI. Una función disponible o un permiso de catálogo no acredita el
comportamiento real de todos los servicios alojados ni evita restricciones de
plataforma o cambios concurrentes posteriores.

Aunque todos los checks comprobables pasen, el resumen dice
`NO_CATALOG_BLOCKER_DETECTED_REVIEW_STILL_REQUIRED`, **no APTO para migrar**.
Ante un fallo dice `BLOCKERS_IN_CATALOG_METADATA`. No corregir permisos,
publicaciones, versiones o esquema para hacer desaparecer esos resultados sin
una autorización posterior específica.

## Relación con la recuperación 2B.3B

Esta consulta nueva **no reemplaza**
[`supabase/recovery/inventory.sql`](../supabase/recovery/inventory.sql), ni modifica
los cuerpos de compensación, el generador, el scope o las migraciones. Ese
inventario anterior sí lee conteos Auth/negocio, plantillas e historial, y puede
extraer definiciones/configuración sensible; **no usarlo para esta solicitud**.

El resultado nuevo tiene formato `procont-catalog-preflight-v1`; no es
`procont-recovery-v1`. No renombrarlo `0.json` ni entregarlo al generador de
compensación como baseline. Primero se revisarán estos metadatos. Cualquier
adaptación posterior del formato/runner o consulta adicional de historial/datos
queda fuera de esta entrega. Los requisitos de recuperación pendientes no se
consideran satisfechos por preparar el archivo ni por un resumen sin bloqueos.

## Validación realizada

Se revisó la sintaxis mediante el parser PostgreSQL de `pglast`, instalado solo
bajo `/tmp`, sin conexión a una base. El árbol contiene una sentencia SELECT,
CTE de lectura y referencias de relaciones explícitas únicamente a `pg_catalog`;
las llamadas son a funciones de sistema con nombre cualificado. Se comprobó
que no hay CTE de escritura, SELECT INTO, bloqueos explícitos ni acceso a las columnas de
credenciales/configuración excluidas. Se cotejaron nombres reservados con el
scope de las cuatro migraciones y se revisaron enlaces y formato de entrega.

Esta validación estática **no** comprueba resolución de columnas/funciones ni
permisos contra un servidor. No se ejecutó EXPLAIN, SELECT, SQL remoto o local;
no se inició PostgreSQL ni se repitieron suites, build o conectividad. La
[evidencia estática](validation/fase-2b3-catalog-preflight-review.json) no contiene
resultados del servidor. Se detiene el trabajo para la ejecución manual del usuario.

Referencias oficiales consultadas: [funciones de privilegios](https://www.postgresql.org/docs/15/functions-info.html),
[propiedad y derechos](https://www.postgresql.org/docs/15/ddl-priv.html),
[CREATE TRIGGER](https://www.postgresql.org/docs/15/sql-createtrigger.html),
[ALTER PUBLICATION](https://www.postgresql.org/docs/15/sql-alterpublication.html),
[dependencias de publicación/esquema](https://github.com/postgres/postgres/blob/REL_15_STABLE/src/backend/catalog/pg_publication.c).
