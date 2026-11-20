# Conexión CLI y preparación del baseline desde af3259f

> **Revisión documental 20/11/2026 · base `c857a727c8e7640bbce8daada940f973acbf013e` · clasificación: HISTÓRICO.**
> Fuente oficial: [PRODUCT_REQUIREMENTS](specs/PRODUCT_REQUIREMENTS.md); estado operativo: [PROJECT_STATUS](PROJECT_STATUS.md).
> Informe histórico de una fase ya cerrada; sus estados «pendiente», conteos parciales y comandos corresponden a su fecha. M1–M15 están aplicadas según evidencia del 20/11. No repetir preparación, bootstrap, compensaciones o consultas antiguas para operar el sistema actual.

## Alcance del documento anterior

El contenido siguiente conserva sus fechas y evidencias originales. Los estados de activación o contratos sustituidos no se consideran vigentes; prevalecen las especificaciones enlazadas arriba.

**Aplicación remota verificada:** las versiones `20261117000100`, `20261117000200`, `20261117000300` y `20261117000400` quedaron registradas en ticketera-procont. Se comprobaron las cuatro transiciones con el alcance de recuperación, 13 tablas propias con RLS y 35 pasos genéricos de checklist. No se crearon cuentas ni superadmin. Las compensaciones se generaron solo en privado, sin ejecutarlas. La evidencia vigente está en `docs/validation/continuacion-af3259f-baseline.json`. Los estados NO APTO anteriores de estos informes son antecedentes, superados para este conjunto. Siguiente paso: definir con el propietario las áreas y la provisión inicial de acceso, bajo autorización separada.

## Estado vigente: baseline íntegro; aplicación autorizada pendiente

El usuario completó la conexión nativa con la CA corregida. Se verificaron
offline los archivos privados recién creados: `cli-identity.json`, `0.json` y
`cli-connection.json`, todos modo 600. Coinciden destino y endpoint guardados,
hash del baseline, hash de exportación, cuatro hashes de migraciones, OID de base,
PostgreSQL 17.12 y operador postgres/postgres. El validador de recuperación
acepta `0.json`: historial ausente/vacío, sin cuentas Auth, sin objetos propios
preexistentes y permisos públicos con grantors compatibles. No se repite la
captura inicial, el importador ni suites anteriores.

**Esto valida la evidencia local, no confirma todavía el estado remoto actual.**
La contraseña anterior no se guardó y no está disponible en este proceso. Para
ejecutar la autorización de aplicación se preparó un único comando de terminal:

```bash
python3 /home/procont/projects/ticketera-procont/scripts/apply_supabase_migrations.py
```

Reutiliza el enlace y pide únicamente entrada oculta local. No pega ni guarda
contraseñas, tokens o cadenas. Antes del primer DDL compara en read-only el estado
actual con el baseline existente, devolviendo solo un booleano. Un dry-run de CLI
3.2.0 exige que estén pendientes **exactamente** los cuatro archivos aprobados;
cualquier cambio de destino, historial, esquema, permisos o datos detiene el flujo.
No se presenta este dry-run como ya ejecutado.

Después prepara workdirs privados con prefijos exactos 1…K. Para cada paso exige
un plan con una sola migración pendiente, sin seeds ni roles, y ejecuta CLI nativa
`db push --remote=<endpoint sin contraseña> --skip-vault --yes`. El código no usa
`--include-all`, `--include-roles`, `--include-seed`, login, config push, bootstrap
ni repair. Se conservan todos los archivos y hashes originales.

Tras cada paso guarda K.json privado y exige transición permitida, versiones
exactas 1…K y checksum de statements registrado por CLI. Genera offline un bundle
de compensación y repair-plan del prefijo; no los ejecuta. Solo entonces pasa a
K+1. Un error, timeout o respuesta inválida detiene la secuencia; se intenta una
única captura del estado incierto y no se reenvía la migración. Si falla una
comparación posterior a un COMMIT, conservar el prefijo capturado y revisar su
recuperación; no volver a ejecutar el comando de aplicación.

Al terminar verifica las cuatro versiones, el alcance esperado, 13 tablas propias
con RLS y 35 pasos genéricos. No crea cuentas ni superadmin. Actualiza los informes
con resultados reales y ejecuta el cierre Git local desde esa misma terminal
Ubuntu. No hace push, merge ni despliegue. Si el commit falla, el mensaje distingue
ese fallo local de un backend ya aplicado: corregir solo Git, sin repetir SQL.

La preparación del comando pasó cuatro comprobaciones nuevas offline de plan
exacto, prefijo aislado, parada ante fallo y rechazo de historial incompleto.
No se reejecutaron las suites históricas. **Ninguna migración fue aplicada en
esta preparación**; se conserva la autorización para el comando anterior.

Los apartados de fallos y estados pendientes que siguen documentan el recorrido
anterior; quedan superados por esta validación local y por el resultado que emita
la aplicación cuando se ejecute.

**Diagnóstico de los dos intentos fallidos (vigente):** el script anterior
descartaba stderr/stdout en errores, de modo que el mensaje genérico no permite
recuperar su causa histórica exacta. No existen `cli-identity.json` ni `0.json`:
el fallo ocurrió antes de guardar la identidad, no durante la captura del
baseline. El mensaje podía proceder de `--version` o de la primera lectura;
el binario local arranca correctamente y la prueba TLS descrita abajo reproduce
un problema concreto de la ruta PostgreSQL.

La primera consulta prevista es `supabase db query --remote=<endpoint guardado
sin contraseña> --file supabase/recovery/connection_check.sql --read-only
--output json --agent no`. El script forzaba `verify-full` sin CA explícita.
En [CLI 3.2.0](https://github.com/supabase/cli/blob/v3.2.0/apps/cli/src/command-internal/supabase-tls.ts),
un sslmode explícito evita añadir la CA integrada. Dos comprobaciones nuevas,
solo de negociación TLS, verificaron: CA del sistema rechazada con código **19**;
CA oficial de CLI 3.2.0 con **cadena y hostname válidos**. No se enviaron usuario,
contraseña ni SQL en esas conexiones. La autenticación PostgreSQL todavía no
se ha probado y puede revelar un problema distinto después de corregir TLS.

La corrección conserva `verify-full` y añade `PGSSLROOTCERT` con
[`cli-root-ca.pem`](../supabase/recovery/cli-root-ca.pem), las tres CA públicas
del bundle oficial de ese tag. No desactiva TLS ni su validación. Los errores
ahora indican etapa (`cli_version`, `connection_check_native`, `inventory_native`)
y categoría: contraseña DB, conexión/DNS/timeout, TLS, endpoint, ejecución CLI,
autenticación API, permisos SQL, SQL o causa sin clasificar. Se guarda un JSON
privado `cli-diagnostic-*.json` con etapa/categoría/retorno y fecha; **sin salida
cruda, contraseñas, tokens, URLs, SQL ni registros**. Los errores desconocidos
no se presentan como contraseña incorrecta y no hay reintento automático.

También se probó una sola lectura de identidad con CLI nativa
`db query --remote --read-only` y la sesión existente. Respondió con una identidad
incompatible con el par requerido; se detuvo antes de consultar el baseline.
La [ruta API](https://github.com/supabase/cli/blob/v3.2.0/apps/cli/src/commands/db/query/query.handler.ts)
no acredita la conexión de `db push`. Por eso no se entrega esa alternativa como
sustituto del baseline operativo de este procedimiento. No se crearon roles ni
se alteraron permisos para adaptarla.

**Único comando para continuar**, desde la raíz del proyecto:

```bash
python3 scripts/connect_supabase_cli.py --use-saved-link
```

Reutiliza el endpoint ya guardado; la entrada local sigue oculta. No se solicita
pegar secretos ni cadenas en el chat. El comando solo verifica identidad y
captura el primer baseline si pasa los controles. No aplica migraciones. No se
repitieron inventarios, importador ni suites anteriores. Cuatro comprobaciones
unitarias nuevas vigentes validaron la clasificación, privacidad del diagnóstico,
etapa de fallo desconocido y carga de la CA.

**Última continuación — enlace existente confirmado:** el usuario ejecutó
`link` y `migration list` con CLI 3.2.0 y reportó las cuatro versiones locales
sin aplicar remotamente. Se verificó localmente que el ref y nombre del enlace
coinciden con el destino fijado y que su endpoint es un pooler de sesión 5432
sin contraseña guardada. No se repitieron esos comandos ni el inventario.
El token de acceso existente no acredita credenciales PostgreSQL persistidas;
usarlo para obtener un nuevo login temporal crearía un rol, fuera del alcance.
En esa entrega, el siguiente paso era introducir la contraseña DB de forma oculta mediante
`python3 scripts/connect_supabase_cli.py --use-saved-link`. Ese comando reutiliza
el enlace y emplea `--remote=<URL sin contraseña>` para el driver nativo. No
guarda credenciales ni ejecuta las cuatro migraciones. Estas siguen autorizadas
condicionalmente, pendientes del baseline y los permisos efectivos. No se abrió
una conexión SQL remota en esta continuación.

**Continuación 18/11/2026:** se recuperó HEAD `af3259f` conservando todos los
cambios locales posteriores. La instrucción nueva permite avanzar con conexión
CLI, baseline y aplicación exclusiva de las cuatro migraciones cuando se
satisfagan sus condiciones. Sustituye la suspensión de lecturas del 17/11
descrita abajo; no autoriza repetir el inventario ni las pruebas anteriores.
La exportación ya está importada: **3382 filas**, recibo privado existente y hash
coincidente con el archivo. No se repitió el importador ni el preflight. CLI
3.2.0 arranca con `SUPABASE_HOME` privado, sin cambiar HOME ni escribir fuera
del proyecto; telemetría desactivada. La conexión real y el primer baseline
operativo requieren la entrada segura de contraseña en la terminal del usuario.
Ejecutar el comando de conexión indicado abajo, sin volver a copiar el archivo.
Los antecedentes del 17/11 se conservan como historia, no como una suspensión
vigente de las lecturas necesarias ahora autorizadas.

17/11/2026. FASE 2B.3D cerrada en `af3259f`. **NO APTO para aplicar las cuatro
migraciones:** siguen pendientes la identidad de la conexión CLI real y un
baseline operativo compatible con el generador. Esta continuación no modifica
las migraciones, las compensaciones ni sus condiciones de seguridad.

## Antecedente del 17/11 (superado por la instrucción del 18/11)

El usuario confirmó que la exportación completa existe en ChatGPT como
`Texto pegado(2).txt`, sin ruta WSL confirmada. Pidió **no repetir el inventario
ni ejecutar otra consulta SQL**. Se suspende también la lectura CLI inicialmente
solicitada; no se vuelve a proponer ejecutar los SQL de preflight. No se ejecuta
`supabase/recovery/inventory.sql`, que tiene mayor alcance que el catálogo.

No se necesita ninguna credencial para recuperar el archivo. No pegar su
contenido en el chat ni incluir otras exportaciones, filas de Auth, correos,
metadatos personales, contraseñas o tokens. La consulta histórica solo produjo
metadatos: nombres de columnas como `email` son parte del esquema, no valores
de cuentas.

## Copiar la evidencia existente sin volver a consultar Supabase

**Paso ya completado por el usuario. No repetir copia ni importador.** Los
comandos se conservan como referencia del procedimiento realizado.

1. En el mensaje original de ChatGPT, descargar el adjunto ya compartido
   `Texto pegado(2).txt`. No generar otra exportación desde Supabase.
2. Localizar esa descarga en Windows o WSL. Si está en Windows, sustituir
   `TU_USUARIO` y, si corresponde, el directorio/nombre en el ejemplo siguiente.
3. Desde una terminal Ubuntu local ejecutar:

```bash
cd /home/procont/projects/ticketera-procont
umask 077
mkdir -p .supabase-local/recovery
chmod 700 .supabase-local .supabase-local/recovery
cp -n -- '/mnt/c/Users/TU_USUARIO/Downloads/Texto pegado(2).txt' \
  .supabase-local/recovery/source-catalog.txt
chmod 600 .supabase-local/recovery/source-catalog.txt
python3 scripts/import_supabase_inventory.py \
  --source .supabase-local/recovery/source-catalog.txt
```

`cp -n` conserva cualquier copia anterior: si ya existe, no la reemplaza. Revisar
localmente que sea la descarga correcta antes de importar. Si se descargó en
Ubuntu, usar su ruta en lugar de `/mnt/c/...`. El archivo y el recibo permanecen
en `.supabase-local/`, ya excluido de Git; no copiarlos a `docs/validation/`.
Confirmar después únicamente la ruta o «archivo copiado», sin pegar contenido.

El importador es completamente offline. Acepta un array JSON o CSV/TSV con las
seis columnas originales, aunque la extensión sea `.txt`; comprueba claves de
detalle permitidas, contexto v1/base `11b2c15`, secciones esenciales y numeración
única 1…N con `total_metadata_rows` coincidente. Rechaza JSON con claves repetidas,
columnas ajenas y recibos existentes. No ejecuta SQL ni utiliza credenciales.

Si el TXT contiene una tabla Markdown, prosa o una copia truncada, se detiene.
Conservar la descarga: su formato se revisará localmente y, si es posible, se
convertirá sin consultar otra vez Supabase. No rellenar filas ausentes ni cambiar
los contadores. El validador estructural no es un detector general de secretos
ni demuestra autenticidad del archivo; utilizar exclusivamente el adjunto de
metadatos original.

## Qué queda preparado y qué sigue pendiente

| Elemento | Estado |
|---|---|
| Directorio local privado | Preparado, modo 700, ignorado por Git |
| Exportación original | Disponible en la carpeta privada; 3382 filas según recibo, modo 600 |
| Recibo offline | Existente, modo 600; hash cotejado con el archivo sin repetir la importación |
| Cuatro migraciones y compensaciones | Se conservan las de 2B.3D; no se aplican ni se repiten pruebas SQL |
| Manifiesto de preparación local | `.supabase-local/recovery/preparation.json`, modo 600; hashes y pendientes, sin estado remoto |
| Baseline `procont-recovery-v1` | Pendiente; no se genera `0.json` a partir de este catálogo |
| Conexión CLI y operador efectivos | Pendientes; SQL Editor `postgres/postgres` no demuestra una sesión CLI |

El recibo registra hash SHA-256, cantidad de filas/secciones y limitaciones; no
incluye filas de origen. Una importación satisfactoria no equivale a APTO.
El catálogo omite deliberadamente definiciones, expresiones y otros campos que
el generador existente compara, además de no acreditar ausencia de cuentas o
filas del historial. No se inventan estos valores, no se rebajan las validaciones
de recuperación y no se renombra el archivo como `0.json`.

## Conexión CLI y primer baseline operativo: entrada segura pendiente

En una terminal Ubuntu local ejecutar una sola vez:

```bash
cd /home/procont/projects/ticketera-procont
python3 scripts/connect_supabase_cli.py --use-saved-link
```

El comando reutiliza el enlace y endpoint de sesión ya guardados por la CLI y
pide únicamente la contraseña PostgreSQL, de forma oculta. No volver a ejecutar
login/link/list ni pegar cadenas de conexión o contraseñas en el chat. No pide
Publishable key, service_role ni token Management API. El modo original sin
`--use-saved-link` conserva la entrada de URL solo para instalaciones sin enlace;
no hace falta aquí.

El script verifica la referencia contra `.supabase-local/target.json` antes de
conectar. Solo permite `db.<ref>.supabase.co` con usuario `postgres`, o el host
Supavisor reconocido con usuario `postgres.<ref>`. Rechaza otros proyectos,
usuarios, transaction pooler 6543, destinos locales y opciones de redirección.
Fuerza `sslmode=verify-full`; la contraseña solo pasa en memoria/entorno del
proceso hijo, sin argumentos ni persistencia. No repite login/link ni usa
Management API o `cli_login_*`. La lectura utiliza la ruta nativa con
`--remote=<URL sin contraseña>`; `--remote` sin URL elegiría Management API para
`db query` en esta versión y no demostraría la misma conexión de migración.

Primero ejecuta [connection_check.sql](../supabase/recovery/connection_check.sql)
en una transacción de solo lectura. Exige `postgres/postgres`, misma versión y
OID de base de la exportación, y los privilegios imprescindibles para crear el
esquema, referenciar/leer Auth y modificar la publicación. No repite las 27
comprobaciones del preflight. `pg_stat_ssl` registra la conexión vista por el
servidor; en pooler no representa el tramo TLS del cliente, cuya política se
fuerza en la URL.

Después realiza **la primera captura operativa** ya prevista por 2B.3B usando
[inventory.sql](../supabase/recovery/inventory.sql), en modo read-only. No vuelve
a ejecutar el inventario de preflight v1/v2: esta captura agrega las definiciones,
ACL, configuración y conteos necesarios para `procont-recovery-v1`, ausentes en
el archivo importado. Incluye COUNT de Auth y tablas propias, y metadatos de
historial si existe; no exporta identidades ni filas de negocio. Las definiciones
y configuración son privadas y no se imprimen. Se ejecuta el validador existente
del baseline, sin modificarlo ni rebajar sus condiciones; cuentas, datos,
colisiones o una forma de ledger inesperada impiden continuar.

Los resultados se guardan con modo 600, sin sobrescribir evidencia existente:

- `.supabase-local/recovery/cli-identity.json`: identidad y permisos reales.
- `.supabase-local/recovery/snapshots/0.json`: baseline solo si valida.
- `.supabase-local/cli-connection.json`: ruta sin contraseña y hashes de enlace
  entre exportación, baseline y las cuatro migraciones.

Ante un fallo se detiene sin reintento ni compensación automáticos. Una identidad
guardada antes de fallar el baseline es evidencia parcial: conservarla y revisar
el fallo antes de ejecutar otra vez. Informar únicamente del resultado general;
no pegar salidas privadas. El comando no aplica migraciones ni crea cuentas.
Al volver al agente se comprobarán los archivos locales y las condiciones para
la aplicación por pasos ya autorizada; no se repetirá la captura inicial.

La ejecución local `--prepare-only` ya confirmó recibo/destino, hashes de las
cuatro migraciones y arranque de CLI 3.2.0. Ese modo no ejecuta SQL ni abre una
conexión de base de datos.

## Evidencias y limitaciones

Los permisos Auth SELECT y BYPASSRLS, la versión 17.12 y los seis event triggers
siguen siendo los reportados por el usuario en la exportación anterior. No se
revalidan ni se presenta el resumen como archivo completo. Las pruebas SQL,
integración y recuperación anteriores conservan su alcance histórico.
En esta entrega pasaron seis pruebas nuevas del importador con datos sintéticos
(JSON/CSV/TSV, truncado/duplicados, campos ajenos, contexto, privacidad y no
sobrescritura). Se cotejan hashes de los cuatro archivos con el manifiesto
2B.3D y enlaces documentales; no se inicia PostgreSQL ni se ejecuta SQL
local/remoto. Esas seis pruebas no se repiten en la continuación. El archivo real
ya fue importado por el usuario y se cotejó su recibo. Pasaron cinco pruebas
nuevas y exclusivamente offline del comando de conexión: aislamiento de destino,
contraseña fuera de la ruta persistida, entorno privado, invocación read-only y
parada ante identidad/permisos inválidos. No se ejecutaron suites SQL anteriores.

La entrada segura sigue pendiente: no se afirma haber conectado al destino ni
capturado `0.json`. No hubo migraciones, cuentas, cambios de frontend ni push.
Los cambios permanecen locales sin commit; `.git` está en solo lectura en este
entorno.

El mecanismo de cierre local está en
[`close_supabase_preparation.py`](../scripts/close_supabase_preparation.py).
Desde una terminal Ubuntu normal, al cerrar la preparación revisada:

```bash
cd /home/procont/projects/ticketera-procont
python3 scripts/close_supabase_preparation.py
```

Solo admite los archivos públicos explícitos de esta entrega, se detiene si
hay cambios ajenos, crea un commit local y comprueba Git limpio. No añade
`.supabase-local/` ni `supabase/.temp/`, y no ejecuta SQL, suites ni push. El modo
`--check` valida el cierre sin escribir en `.git`. Este cierre no acredita que
las migraciones se hayan aplicado ni sustituye su verificación pendiente.

El plan Free reportado no ofrece backups automáticos ni PITR. Un recibo de
metadatos no es un backup ni permite recuperar datos. Mantener el **NO APTO**
hasta disponer del baseline operativo y la identidad CLI comprobada.

Evidencia nueva sin datos privados:
[preparación local](validation/continuacion-af3259f-baseline.json).
