# FASE 2B.3B — Recuperación de las cuatro migraciones

**Revisión vigente 2B.3D:** [resolución de bloqueos](fase-2b3d-resolucion-bloqueos.md)
retira los triggers propios de Auth y la edición SQL directa del ledger. La CLI
lo inicializa al primer push; la compensación conserva sus filas y emite un
repair-plan separado para CLI. Véase el nuevo manifiesto y las siete pruebas
del operador sin propiedad Auth. Las 26 pruebas de este informe son históricas,
no una reejecución con la migración 3 revisada.

**Siguiente lectura manual preparada desde `11b2c15`:** usar primero el
[preflight de catálogos](fase-2b3-catalog-preflight.md), aún no ejecutado. El
usuario pidió únicamente metadatos, sin cuentas, negocio ni credenciales. El
`inventory.sql` descrito abajo tiene un alcance mayor (conteos, historial y
definiciones/configuración) y **no debe ejecutarse para esta solicitud**. La
consulta nueva no es `0.json` ni sustituye el formato del generador. Este plan,
sus requisitos y compensaciones siguen sin autorización de ejecución remota.

17/11/2026. Base: `d48dbfb`. Trabajo exclusivamente local. La autorización de
esta fase cubre preparar y probar recuperación; no cubre conexión SQL remota,
DDL remoto, cuentas, bootstrap, push, merge o despliegue.

## Resultado y alcance

**NO APTO todavía para aplicar en Supabase remoto.** La recuperación está
preparada y probada en PostgreSQL aislado, pero falta el inventario real de
catálogo/permisos de recuperación y validar las condiciones de
entrada contra ese inventario. No se vuelve a pedir la revisión visual ya hecha.
La versión numérica 17.12 fue reportada posteriormente por el usuario. Las
lecturas restantes requieren una futura autorización de lectura SQL remota.
La autorización de aplicación y la de compensación destructiva son independientes.

La ausencia de PITR no exige contratar otro plan para esta instalación vacía.
La seguridad propuesta depende de que no existan cuentas ni datos que conservar,
de registrar cada estado y de detenerse ante cualquier discrepancia. No ofrece
recuperación de datos una vez que la aplicación empieza a recibir escrituras.

| Evidencia | Qué acredita | Qué no acredita |
|---|---|---|
| Confirmaciones Dashboard del usuario | Data API habilitada; `public` y `extensions` expuestos; sin tablas de negocio ni versiones; Free sin backup automático/PITR | ACL, propietarios, funciones preexistentes, metadatos completos, versión numérica |
| Código de las cuatro migraciones | Dependencias, límites de transacción y objetos afectados | Permisos reales del operador alojado |
| [26 comprobaciones locales](validation/fase-2b3b-recovery.json) | Compensación, detención y preservación del catálogo/ACL iniciales en PostgreSQL 18.6 | Servicios Supabase, Auth real, controlador CLI o conexión alojada |
| [Código CLI 3.2.0](https://github.com/supabase/cli/blob/v3.2.0/apps/cli/src/command-internal/migration-apply.ts) | Con archivos que incluyen control de transacción, el registro de versión ocurre después de ejecutar el archivo | Atomicidad conjunta entre su `COMMIT` y la escritura posterior de historial |

En la entrega original 2B.3B no se modificaron migraciones ni hashes. 2B.3D revisa
M3 sin aplicación remota y fija un nuevo manifiesto. No se repitieron
las 72 comprobaciones de 2A ni las 19 de integración de 2B.1. No se crearon
cuentas Auth ni superadmin, tampoco en las pruebas nuevas. El soporte local
crea únicamente roles PostgreSQL `NOLOGIN` de plataforma y un esquema Auth mínimo.

## Inventario completo del cambio

El inventario de nombres exactos está en
[`scope.json`](../supabase/recovery/scope.json). Se obtuvo aplicando solo las
cuatro migraciones originales en el clúster aislado y cotejando cada transición;
su lista de campos modificables limita las diferencias aceptables. No contiene
identificadores ni estado remoto. Los conteos excluyen duplicar NOT NULL como
restricciones de catálogo de PG18: se registran en las columnas.

| Migración | Objetos nuevos y modificaciones | Dependencia |
|---|---|---|
| 1 — schema | Esquema `app_private`; `valid_phase`; 9 tablas `public` y 4 privadas; 99 columnas; 77 restricciones CHECK/PK/UNIQUE/FK; 34 índices; 26 tipos implícitos de fila/array; RLS cerrado en las 13 tablas; revoca CREATE de `public` a PUBLIC/anon/authenticated y acceso a objetos nuevos | `auth.users`, `auth.uid()`, roles anon/authenticated, permisos de creación |
| 2 — security | 2 funciones privadas (`has_role`, `can_read_project`); 20 políticas; USAGE privado para authenticated; EXECUTE de helpers; SELECT y grants por columna en las 9 tablas públicas | 1 |
| 3 — operations (2B.3D) | 26 funciones nuevas (15 privadas y 11 públicas); 12 triggers de tablas propias; provisión privada explícita desde Auth; 4 entradas de restricciones de triggers diferidos; EXECUTE limitado; 3 tablas Realtime y NOTIFY | 1+2, service_role, SELECT de fuente Auth y propiedad de publicación; sin propiedad/TRIGGER Auth |
| 4 — reference_checklists | 35 filas genéricas en `public.checklist_templates`; ningún objeto nuevo ni cuenta | 1; operativamente siempre después de 3 |

Tablas públicas: `users`, `requests`, `projects`, `project_flows`,
`checklist_templates`, `checklist_items`, `comments`, `activity_logs`,
`notifications`. Privadas: `number_counters`, `request_access`, `rpc_calls`,
`security_events`.

Desde 2B.3D no se crean `procont_auth_profile_insert`/`procont_auth_profile_email`
ni se compensan triggers propios en Auth. Se conserva su FK y los triggers
internos que PostgreSQL administra para esa dependencia. La provisión de perfil
es explícita y privada. Crear `bootstrap_superadmin` no la invoca ni asigna roles.
Realtime incorpora únicamente `public.projects`, `public.project_flows` y
`public.notifications`; no crea ni elimina la publicación `supabase_realtime`.
`storage`, `realtime`, `extensions`, roles, extensiones y defaults de plataforma
no son destinos de DDL de aplicación.

**Colisión importante:** la migración 3 revoca por nombre de función, incluyendo
sobrecargas. Aunque no haya tablas de negocio, una función pública previa con
alguno de esos nombres sería afectada. El validador rechaza todas esas colisiones
antes de permitir la aplicación. También rechaza un `app_private` preexistente.

## Captura inicial y comparación

[`inventory.sql`](../supabase/recovery/inventory.sql) solo consulta: incluye
versión numérica, OID de base, operador, esquemas, propietarios, ACL efectivas
(grantor/grantee/grant option), tablas/vistas/secuencias, columnas/defaults,
restricciones, índices, tipos, funciones/definiciones/search_path, triggers,
políticas/RLS, publicaciones y membresías, extensiones, defaults de permisos,
roles/membresías, reglas y event triggers. Incluye conteos de tablas de la aplicación y
Auth, checksum de plantillas y versiones/nombres/checksum de statements del
historial. No exporta identidades Auth ni filas de negocio. Es metadato privado:
las funciones de terceros y opciones de roles podrían contener información
sensible. No publicar el resultado completo de una captura remota.

Capturar en una transacción READ ONLY, mismo operador y `search_path` fijado a
`pg_catalog,public`. Guardar el único JSON resultante como `0.json`, `1.json`,
etc., fuera de Git, directorio 700 y archivos 600. Nunca sustituir un archivo ya
aprobado. Los OID ligan las capturas a esa instancia: no reutilizarlas tras una
recreación de base/proyecto. No copiar el ejemplo local de evidencia al remoto.

**Corrección 2B.3D:** `0.json` puede registrar historial ausente. No crearlo
manualmente para cumplir el preflight. CLI 3.2.0 inicializa esquema, tabla,
version/name/statements y PK antes de su primera migración pendiente, bajo la
futura autorización de push. Se admite esa adición exacta en la transición 1.
Si el ledger ya existe se valida su forma y que no haya versiones inesperadas.
No se borra/recrea. La compensación conserva el ledger y sus filas; el ajuste
posterior solo se realiza por CLI repair, con versiones exactas y autorización.

Validación offline, sin conexión:

```bash
python3 scripts/build_migration_recovery.py --check-baseline /RUTA_PRIVADA/0.json
```

Rechaza cuentas/datos existentes, colisiones, historial inesperado, ausencia de
publicación estándar, publicación ALL TABLES o publicaciones de esquema completo.
La herramienta no comprueba identidad de proyecto por nombre: el operador debe
ligar la captura al destino privado ya fijado. Se conserva esa confirmación previa.
El inventario exige PG15+; la ejecución comprobada en esta fase es PG18.6.

## Compensaciones específicas

Los cuatro cuerpos están fuera del directorio de migraciones. **No ejecutar
estos cuerpos sueltos**: exigen un contexto temporal que solo arma el bundle.
Los permisos se restauran mediante SQL generado desde las capturas reales,
no mediante grants predeterminados ni supuestos sobre Supabase.

| Cuerpo | Acción |
|---|---|
| [`compensate_04.sql`](../supabase/recovery/compensate_04.sql) | Retira las 35 plantillas solo tras comprobar conteo y checksum exactos; rechaza cambios posteriores |
| [`compensate_03.sql`](../supabase/recovery/compensate_03.sql) | Retira los 12 triggers propios de tablas públicas; ninguna operación sobre triggers Auth; quita 3 membresías Realtime añadidas; elimina 26 funciones propias, incluida provisión privada; restaura ACL de helpers |
| [`compensate_02.sql`](../supabase/recovery/compensate_02.sql) | Elimina las 20 políticas y los 2 helpers propios; restaura USAGE privado, ACL de tablas, columnas y helper existente a la captura 1 |
| [`compensate_01.sql`](../supabase/recovery/compensate_01.sql) | Elimina las 13 tablas en un solo DROP RESTRICT, incluidos sus índices/FK/tipos/triggers internos; elimina valid_phase y esquema privado vacío; restaura ACL de `public` |

Para un prefijo aplicado K se genera un bundle que ejecuta K→…→1. No omitir
pasos ni usar un archivo de otra base. Ejemplo **solo offline**:

```bash
python3 scripts/build_migration_recovery.py \
  --snapshots /RUTA_PRIVADA/capturas --through 3 \
  --output /RUTA_PRIVADA/compensar-hasta-3.sql
```

El generador valida hashes originales y diferencias contra la lista permitida;
rechaza datos/cuentas, versiones ajenas y grantors distintos del dueño en ACL
que tenga que restituir. Los grants de terceros requieren un plan específico:
no se convierten en permisos de owner por conveniencia.

El bundle completo usa **una transacción** con límites de espera, bloqueo
cooperativo y bloqueos de tablas propias e historial, sin LOCK Auth. Comprueba el estado
exacto inicial, después de cada compensación y antes del COMMIT. Restaura los
permisos efectivos con sus grant options; la representación interna NULL/array
de ACL no se exige si los permisos efectivos son idénticos.

Los DROP son RESTRICT, sin `CASCADE`, sin `IF EXISTS` para ocultar discrepancias.
Retirar una tabla elimina sus propios índices, reglas, triggers y restricciones:
por eso el inventario también los vigila. Un objeto extraño, ACL diferente,
fila nueva, plantilla editada o dependencia inesperada provoca parada/rollback.
La comparación final incluye plataforma e historial retenido; se admite únicamente
la inicialización nativa CLI. Las versiones permanecen hasta el repair posterior.
El bloqueo cooperativo
no impide por sí solo todo DDL de un administrador no cooperante: reservar una
ventana exclusiva, sin otros operadores ni automatizaciones.

No se tocan filas Auth, esquemas administrados, extensiones, roles ni la
publicación como objeto. El NOTIFY solo pide recargar caché al confirmar la
compensación; no es una copia ni una restauración de datos.

## Procedimiento futuro de aplicación y detención

**Nada de este apartado se ejecutó contra Supabase.** Sustituye el push único
del procedimiento 2B.2 cuando se autorice esta vía de recuperación.

1. Obtener autorización de lectura administrativa SQL para capturar el inventario
   y versión exacta; mantener datos, cuentas y bootstrap fuera del alcance.
   La revisión visual de Dashboard ya confirmada se reutiliza. Comparar la versión
   instalada con TOML; cualquier ajuste será local y explícito, nunca config push.
2. Revisar baseline y privilegios reales del operador sobre esquema público,
   SELECT/RLS de fuente Auth, publicación e historial existente. La ausencia
   de historial es normal: la CLI lo inicializará al push autorizado. Guardar 0.json.
   El resultado local no concede permisos en Supabase ni evita estas condiciones.
3. Obtener autorización expresa de aplicación, con ventana sin clientes/otros
   operadores y un procedimiento de recuperación acordado. Tener la aplicación
   detenida no bloquea por sí solo las RPC anónimas que habilita la migración 3.
   Si aparece cualquier dato, no usar compensación de instalación vacía.
4. Aplicar **una sola migración por invocación CLI**. Preparar un workdir privado
   con configuración CLI, enlace al mismo destino fijado y solo el prefijo exacto
   1..K de archivos originales. Así, tras confirmar K−1, queda solo K pendiente.
   No mover/eliminar archivos del repositorio; no incluir los cuerpos de recovery,
   seeds, tests o roles. Revisar el dry-run y destino antes de cada ejecución.
   Las copias privadas conservan nombres y hashes, no se fusionan archivos.
5. Para cada K, usar CLI 3.2.0 `db push --remote --skip-vault --yes` **solo bajo
   la autorización futura** en ese workdir. Encapsular la operación en shell con
   `set -Eeuo pipefail`; cualquier retorno no cero termina el flujo. Si se usa
   `tee`, pipefail es obligatorio. No usar un bucle que siga ante error ni un
   reintento automático. La CLI no tiene una opción de atomicidad para el lote.
6. Tras cada resultado, incluyendo un error o respuesta perdida, detener la
   secuencia y capturar catálogo/historial. Si K se confirmó, guardar K.json y
   contrastarlo con K−1 y scope. No iniciar K+1 hasta resolver cualquier duda.
   Si K falló antes de COMMIT, la captura debe coincidir con K−1 y no se agrega
   una captura ficticia. Si K confirmó SQL sin historial, se conserva esa captura
   como K.json sin inventar una versión: el generador admite exactamente ese caso.
7. No reejecutar un archivo solo porque falta su versión. Si hubo timeout o
   desconexión, verificar primero el estado. Una conexión con transacción abierta
   debe cerrarse/terminarse de forma controlada antes de capturar o compensar.
   No asumir rollback si ya se había enviado COMMIT.
8. Ante fallo, preferir intervención revisada hacia adelante o generar el bundle
   del prefijo demostrado. Revisar el SQL concreto y solicitar autorización propia
   para ejecutarlo. Un error SQL con transacción abortada no deja un archivo
   parcialmente aplicado: investigar si se estaba antes o después de COMMIT.
9. Ejecutar el bundle aprobado en sesión dedicada, directa o pooler de sesión,
   con `psql -X --set ON_ERROR_STOP=1 --file ARCHIVO_PRIVADO`. No poner contraseñas
   en argumentos, historial, logs ni URLs. No usar pooler de transacción. Ante
   error, terminar/cerrar la sesión para asegurar rollback; no seguir en la misma
   sesión. No hay cambios SQL en el historial dentro del bundle. Solo después
   de compensación confirmada, revisar el repair-plan y autorizar CLI repair
   sobre sus versiones exactas. Es otra transacción: mantener el servicio detenido
   y verificar el resultado antes de cualquier push o reintento.
10. Tras resultado o conexión perdida durante recuperación, recapturar: debe
    coincidir con el estado inicial o con el prefijo anterior completo. Si no se
    conoce cuál, parar. El bundle no es idempotente y su segunda ejecución se
    rechaza por inventario diferente. No repetir sin volver a comparar.
11. Contrastar por lectura catálogo/ACL, cuatro versiones cuando corresponda,
    plantillas y ausencia de cuentas. Entregar evidencia saneada. No arrancar la
    aplicación ni crear cuenta inicial/superadmin dentro de esta autorización.

La inicialización CLI puede crear credenciales/roles temporales de plataforma:
también exige autorización. Si cambia ese metadato entre capturas, el comparador
se detiene; no ampliar la lista permitida para ignorarlo automáticamente.

No usar `db reset`, `DROP SCHEMA public CASCADE`, seeds, SQL históricos,
`migration down` genérico ni `migration repair` como sustituto de compensación.
El repair seleccionado posterior de 2B.3D solo corrige historial ya contrastado;
no deshace SQL y nunca se ejecuta antes del bundle.
No borrar versiones de forma anticipada. Si se elige conservar SQL confirmado
sin su versión, una reparación de historial es otra operación administrativa
revisada y autorizada, después de demostrar contenido; no se ejecuta aquí.

## Atomicidad del conjunto e historial

Con los cuatro archivos **sin cambios**, cada COMMIT hace permanente su archivo.
Un BEGIN externo no envuelve sus COMMIT y un comando CLI abre su propia conexión.
Por tanto, esta entrega no presenta el push como una única transacción.

Se revisaron las ramas `hasTransactionControl` y `executeSequentially` de
[`migration-apply.ts` v3.2.0](https://github.com/supabase/cli/blob/v3.2.0/apps/cli/src/command-internal/migration-apply.ts),
y el formato de ledger en
[`migration-history.ts`](https://github.com/supabase/cli/blob/v3.2.0/apps/cli/src/command-internal/migration-history.ts).
Para estos archivos, el insert de versión ocurre después de su COMMIT. Se cubre
la ventana «DDL aplicado, historial ausente» sin atribuir al rollback de SQL la
capacidad de deshacer lo ya confirmado. Los hashes de fuentes revisadas quedan
en [la revisión de artefactos](validation/fase-2b3b-review.json).

**Sí es técnicamente posible** confirmar DDL de los cuatro e historial en una
transacción propia: en copias de prueba se retiraron solo las líneas externas
BEGIN/COMMIT y se incluyeron inserts de ledger dentro de un único BEGIN/COMMIT.
Fallos en los cuatro puntos revirtieron DDL y ledger; una ejecución completa
confirmó cuatro versiones y 35 plantillas. No se utilizó el controlador CLI y
los arrays statements del modelo no reproducen su splitter. Esto prueba
atomicidad PostgreSQL, no equivalencia completa con el ejecutor Supabase CLI.

No se adopta esa vía: requeriría aprobar un nuevo ejecutor o reorganizar el
manifiesto y validar formato/semántica de historial con CLI. No se modifican
archivos aprobados para aparentar atomicidad ni se usa repair después como
segunda confirmación separada. Se conserva la vía por pasos con recuperación.

## Pruebas nuevas y reproducción

[`recovery_local.py`](../supabase/tests/recovery_local.py) elimina variables PG
heredadas, no lee `.env`, exige clúster/socket bajo `/tmp`, marcador explícito,
data_directory esperado y TCP deshabilitado. Crea bases descartables y al final
las elimina. Roles PostgreSQL NOLOGIN no son cuentas Auth. El clúster se detiene
al cerrar esta fase; no se instala un servicio ni se toca producción.

```bash
LD_LIBRARY_PATH=/tmp/procont-2b3b-db/runtime/usr/lib/x86_64-linux-gnu \
python3 supabase/tests/recovery_local.py \
  --pg-bin /tmp/procont-2b3b-db/runtime/usr/lib/postgresql/18/bin \
  --socket /tmp/procont-2b3b-db/socket \
  --cluster /tmp/procont-2b3b-db/cluster \
  --evidence /tmp/otra-evidencia-recovery.json
```

El ejemplo requiere provisionar de nuevo ese clúster descartable si ya no existe.
Los paquetes PostgreSQL 18.6, cliente y bibliotecas se extrajeron únicamente bajo
`/tmp`; no se instaló ni actualizó PostgreSQL del sistema.

Resultados: 4 fallos después de migración con compensación y reaplicación de las
cuatro originales; 4 fallos antes de COMMIT; 4 casos sin última versión en ledger;
1 fallo dentro de compensación; rechazo por dependencia ajena, drift de permisos,
plantillas editadas, tabla privada con datos, sobrecarga RPC inicial/publicación
ALL TABLES adicional e historial
ajeno; rechazo de los cuatro cuerpos sueltos; 4 fallos atómicos en copias y
1 éxito atómico; generador offline con salida 600 y rechazo de sobrescritura.
Son **26 comprobaciones nuevas**, exclusivamente de recuperación.

Los objetos centinela de `auth`, `storage`, `public`, `realtime`, `extensions`,
defaults, roles, publicación y su membresía anterior permanecieron en las
comparaciones de catálogo; una fila sintética en storage también se preservó.
No se simuló la implementación completa de los servicios gestionados. Un drift
de un administrador/servicio puede impedir la recuperación automática: se para
sin eliminarlo y se necesita revisión manual.

## Dashboard e intervención manual

Las cinco comprobaciones visuales ya están confirmadas; no repetirlas. No se
necesita Orca para usar esta evidencia. En una fase futura, el usuario debe:

- Reutilizar PostgreSQL 17.12 reportado por el usuario, sin repetir Infrastructure
  ni actualizar el servidor. No equivale a verificar permisos de una sesión CLI.
- Elegir acceso administrativo seguro y operador con permisos suficientes.
  Si se usa SQL Editor, la captura READ ONLY puede ejecutarse tras autorización;
  exportar el JSON completo de forma privada y comprobar que no fue truncado.
- Para recuperación en SQL Editor, revisar el bundle entero y ejecutar todo en
  una sola sesión, sin seleccionar fragmentos ni repetirlo tras un timeout.
  La opción preferida es psql con ON_ERROR_STOP, por su detención explícita.
  Si el editor deja una sesión incierta, hace falta intervención administrativa
  para confirmar/cerrar la transacción antes de seguir. No realizarla a ciegas.
- No crear restauraciones ni cambiar el plan durante esta fase. Si no hay
  privilegios o la plataforma cambia fuera del alcance previsto, detenerse y
  acordar una intervención específica. No recrear el proyecto como fallback.

## Plan Free y decisión de cierre

Se reutiliza la confirmación del usuario: sin backups programados ni PITR en este
destino Free. No se verificaron precios ni se presupuestó un upgrade. Un inventario
de esquema/ACL **no respalda datos** ni permite recuperar escrituras eliminadas.
Antes de admitir cuentas o tráfico debe definirse una estrategia de copias y
restauración de datos, con su propia autorización.

Preparación de recuperación local completada. **NO APTO para aplicación remota
en el estado actual de evidencias**: falta baseline real/versionado y compatibilidad
del operador real/fuente Auth. La versión 17.12 ya fue reportada; ledger ausente
es normal antes del primer push y la CLI lo inicializa sin SQL manual externo.
El riesgo de estados parciales tiene ahora scripts y pruebas, pero no se
confunde una simulación con garantía sobre una base alojada aún no inventariada.
Siguiente paso posible: autorización expresa y acotada para esos metadatos;
aplicación, compensación, cuentas y bootstrap siguen sin autorización.

Referencias de semántica PostgreSQL:
[COMMIT](https://www.postgresql.org/docs/current/sql-commit.html),
[DROP TABLE y RESTRICT](https://www.postgresql.org/docs/current/sql-droptable.html).
