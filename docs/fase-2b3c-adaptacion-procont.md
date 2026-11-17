# FASE 2B.3C — Adaptación organizacional de Ticketera Procont

**Cambio técnico posterior 2B.3D:** se revisa únicamente la integración de perfiles
Auth y su recuperación, sin nuevas áreas, personas o reglas organizacionales.
La revisión 2B.3C y su cierre `11b2c15` siguen como evidencia histórica;
[resolución de bloqueos](fase-2b3d-resolucion-bloqueos.md) documenta el nuevo hash M3.

**Continuidad posterior al cierre `11b2c15`:** la preparación de la
[consulta manual de catálogos](fase-2b3-catalog-preflight.md) es una entrega
posterior, sin ejecución SQL ni repetición de pruebas. La revisión organizacional
permanece cerrada; no cambia frontend, migraciones, áreas o usuarios.

17/11/2026. Base: `cb468be`. Revisión estática y documentación, sin SQL local
ni remoto, sin aplicar migraciones ni repetir pruebas anteriores.

## Resultado

Las **cuatro migraciones preparadas ya son independientes de la estructura de
Gilat**: no contienen catálogos de áreas, personas, correos corporativos, cuentas
iniciales, datos empresariales ni matrices de plazos de esa organización. No
requieren cambios para retirar esas dependencias. Se conservan sus nombres,
orden, hashes, contratos y el procedimiento de recuperación de 2B.3B.

Esto no significa que toda la aplicación esté adaptada. El frontend todavía
contiene nombres, áreas, valores del importador y parámetros SLA heredados.
Se identifican abajo y quedan pendientes, conforme a la restricción de no
modificarlo. No se inventan áreas, usuarios ni reglas de Procont.

La [evidencia nueva](validation/fase-2b3c-organizational-review.json) registra
hallazgos, rutas, hashes y límites. Es una revisión de fuentes; no una ejecución
de migraciones, una prueba funcional ni una inspección del servidor.

## Revisión de las cuatro migraciones

| Archivo | Independencia organizacional comprobada por lectura | Qué conserva |
|---|---|---|
| `20261117000100_schema.sql` | Área como texto, sin lista empresarial; nombres/correos son campos, no personas precargadas; sin áreas en RLS ni dominios de correo obligatorios | 9 tablas públicas, 4 privadas, integridad, índices, RLS cerrado, tipos de proyecto/fases/estados y roles genéricos |
| `20261117000200_security.sql` | Acceso por perfil/rol activo; ninguna política compara áreas, nombres o correos de Gilat | Políticas, permisos por columna y operaciones de administradores/editores/lectores |
| `20261117000300_operations.sql` | Personas y responsables se reciben como datos o UUID autorizados; no crea cuentas; no contiene matriz SLA por área o producto | RPC transaccionales, idempotencia, numeración, integridad, perfil Auth inactivo, definición de bootstrap, relaciones y Realtime |
| `20261117000400_reference_checklists.sql` | Solo 35 tareas genéricas de desarrollo/administración; sin personas, departamentos, plazos corporativos ni registros de negocio | Plantillas de checklist reutilizables, con edición permitida a administradores autorizados |

`Usuario` es una etiqueta genérica de respaldo para el perfil, no una identidad
empresarial. La función de bootstrap recibe un UUID y solo queda definida; no se
invoca en la migración. El UUID cero usado para idempotencia anónima es un
identificador técnico, no una cuenta. No hay INSERT de usuarios Auth en la cadena.

Se mantienen `superadmin`, `admin`, `developer` y `viewer` como roles iniciales
genéricos. No se asignan a personas ni se equiparan a gerencias de Procont. Los
roles de plataforma `anon`, `authenticated` y `service_role` tampoco son puestos
de trabajo. El esquema conserva un único espacio compartido; asignación de
responsables no equivale a separación de visibilidad por área. No se agrega
jerarquía ni segregación organizacional en esta fase.

## Áreas: flexibilidad actual y límite

`public.requests.requester_area` es `text`, máximo 200 caracteres, sin ENUM de
áreas, catálogo precargado, FK organizacional ni CHECK con nombres de Gilat.
`submit_request` exige un valor no vacío suministrado por el solicitante. El alta
interna permite un área no definida y `update_request_details` recibe el texto
del operador. Ninguna RPC sustituye ese valor por DDC u otra área prefijada.

Esto permite usar valores organizacionales definidos posteriormente **sin
cambiar una enumeración SQL**. No existe todavía una tabla ni una interfaz
administrable de áreas, y los selectores actuales de frontend siguen usando
listas estáticas. No se presenta esa limitación como una gestión dinámica ya
implementada. La fuente del catálogo, su mantenimiento y los nombres concretos
se decidirán con el propietario; no se diseñan ahora tablas ni formularios nuevos.

## Dependencias heredadas identificadas

Se retiran de la documentación operativa la identidad empresarial anterior y
su lista de áreas como configuración vigente. También se elimina la indicación
de que conservar el cálculo SLA autoriza usar sus parámetros como política de
Procont. La retirada de listas/textos del frontend se deja expresamente pendiente;
no se afirma haber eliminado esa configuración del código de la aplicación.

| Ubicación | Hallazgo | Tratamiento en esta fase |
|---|---|---|
| `README.md` | Presentaba el producto como Ticketera Controlling para Gilat Perú y enumeraba áreas anteriores | Se reemplaza por identidad y alcance de Procont; se retira la lista como estructura vigente |
| `src/lib/constants.ts:42` y `:68` | Colores/lista de AASS, ATC, Controlling, DDC, GERE, OC, PMO, QA y SAQ | Inventariado; sin cambios de frontend; no se copia a SQL ni se adopta como catálogo de Procont |
| `src/components/requests/PublicRequestForm.tsx:9` | Lista propia de seis áreas, diferente del catálogo compartido | Pendiente de adaptación posterior; no se reemplaza por áreas inventadas |
| `src/components/requests/PlannerImportModal.tsx:162` y `:339` | Envía `requester_area: 'DDC'` y lo anuncia en pantalla; conserva supuestos de importación/prioridad | Pendiente; no utilizar para importar datos anteriores ni asumir el área por defecto de Procont |
| `NewProjectModal`, `ProjectModal`, `DashboardView` y consumidores de `AREAS`/`AREA_COLORS` | Selectores, etiquetas y métricas dependen del catálogo compartido | Se conserva su funcionalidad; adaptación del catálogo pendiente, sin edición de componentes |
| `src/lib/sla-config.ts` y `PublicRequestForm.tsx:25` | Tipos/plazos numéricos y cálculo de SLA incrustados, con valores duplicados | No se trasladan a SQL ni se validan como compromisos nuevos; revisión con propietario pendiente |
| `src/App.tsx:59`, `PublicLanding.tsx`, `LoginForm.tsx`, `index.html:6` | Marca/textos «Controlling» o «Gilat» | Identificados para la fase futura de frontend; permanecen sin cambios ahora |
| `package.json:2` | Nombre técnico `ticketera-controlling` | Inventariado; no se altera manifiesto/lockfile ni se confunde con nombre empresarial vigente |
| `setup.js` | Generador histórico que reintroduce marca, plantillas y archivos antiguos | Excluido del procedimiento; no ejecutar, regenerar ni usar para adaptar la aplicación |
| `admin_setup.sql`, `seed_data.sql` | Identidades, nombres, correos del dominio anterior `gilat.pe` y datos de ejemplo; administración con credenciales prefijadas en el histórico | No ejecutar ni importar; no se reproducen nombres, direcciones completas o contraseñas en este informe |
| `seed_test_data.sql` | Escenarios anteriores con solicitantes, áreas, fechas y SLA | Excluido; no es el soporte de pruebas aisladas de las fases actuales |
| `tags_migration.sql`, `tags_cleanup.sql` | Marca anterior y operaciones sobre etiquetas ligadas a áreas heredadas | Excluidos de la secuencia; no se ejecuta la limpieza ni se añade catálogo de etiquetas |

Los SQL históricos permanecen en la raíz como antecedentes. **No se borraron ni
se sanearon sus datos en esta fase**; tampoco se convirtieron en configuración,
seeds, migraciones ni cuentas de Procont. Su retención no autoriza su uso.
El único directorio de migraciones sigue siendo `supabase/migrations/` y el
TOML mantiene seeds deshabilitados. Los scripts de tests actuales con correos
`example.invalid` son fixtures locales, no importaciones de Gilat; no se ejecutaron.

`.env.example` está vacío de valores; `supabase/config.toml` utiliza el identificador
local `ticketera-procont` y URLs localhost de desarrollo, no catálogos empresariales.
No se modificó ni se recapturó `.env.local`, el pin privado o la configuración remota.
La revisión no vuelve a comprobar la conectividad ni la identidad del Dashboard.

## SLA: conservar la capacidad sin adoptar los parámetros anteriores

Se conservan fechas, seguimiento, avisos y los contratos `sla_target_date` y
`sla_formal_days`. El SQL no calcula una matriz por producto/área; acepta fechas
y valida días formales de 1 a 3650 cuando la aprobación incluye SLA. La aprobación
con prioridad `low` elimina su fecha SLA y no registra `sla_started`: es una
regla existente, conservada por compatibilidad y pendiente de ratificación para
el nuevo entorno, no una política nueva diseñada aquí.

El frontend conserva factores urgent 0,50 / high 0,70 / medium 1,00 / low sin
SLA, la combinación de tipos con días adicionales y calendario sin sábados ni
domingos. No incorpora un calendario de feriados de Procont. Estos valores y
el momento de inicio del plazo requieren definición del propietario.

Se detectó por lectura una diferencia preexistente: «Dashboard / Visualización
(Streamlit)» tiene **4 días** en el formulario público y **5** en `sla-config.ts`.
Se documenta sin corregirla ni decidir un valor. Los factores, tipos y plazos
heredados no deben utilizarse como aprobación implícita de una política de Procont.

`America/Lima` en la numeración y el locale `es-PE` son parámetros regionales
existentes, compatibles con el contexto de Perú indicado por el propietario;
no identifican a Gilat. Se mantienen, sin cambios de calendario o reglas nuevas.

## Funcionalidades y parámetros que se conservan

- Solicitudes públicas/internas, seguimiento por número y token, aprobación y
  rechazo, vínculo con proyecto y numeración REQ/INT.
- Proyectos de desarrollo/administrativos/duales, fases, asignación a perfiles
  autorizados, prioridades, progreso, bloqueos y papelera.
- Checklist por flujo/fase, tareas, comentarios, historial y notificaciones;
  publicaciones Realtime y contratos RPC/RLS actuales.
- Kanban, tabla, Gantt, roadmap y métricas, sin reconstruir componentes.
- Roles genéricos y provisión segura: un nuevo perfil Auth sería viewer inactivo;
  activar usuarios o conceder superadmin requiere una autorización futura separada.

Las descripciones/orden de plantillas admiten edición mediante los permisos ya
previstos. Las fases, tipos de flujo, estados y roles son valores técnicos con
CHECK; **no** se presentan como catálogos dinámicos. Cambiarlos más adelante
requeriría revisión de esquema, consumidores y recuperación.

No se eliminan estas funcionalidades para sustituir la estructura empresarial.
La importación se conserva como código existente, pero no se ejecuta ni se toma
su mapeo de área como configuración aprobada para el nuevo entorno.

## Decisiones organizacionales pendientes

| Decisión del propietario | Estado |
|---|---|
| Áreas reales, nombres, códigos y responsables de mantenerlas | Sin definir; ningún valor nuevo creado |
| Usuarios, correos, asignaciones de rol y primera cuenta administrativa | Sin definir; ninguna cuenta/privilegio creado |
| Tipos de solicitud y sistemas que corresponden al nuevo trabajo | Sin definir; listas anteriores no adoptadas |
| Plazos SLA, prioridades, urgencia, calendario, feriados e inicio del cómputo | Sin definir; conservar mecanismo no aprueba parámetros heredados |
| Confirmar las plantillas genéricas y fases para el nuevo uso | Base reutilizable conservada; ajustes organizacionales pendientes |
| Confirmar visibilidad compartida y responsabilidades | Base actual por rol conservada; no se implementan nuevas reglas por área |
| Marca visible y mapeo de importación al nuevo catálogo | Pendiente de fase frontend; no diseñado ni implementado aquí |

No se especifica un formulario nuevo, una estructura empresarial ni una política
SLA alternativa. La nueva configuración debe proceder del propietario, no de
inferencias sobre el nombre Procont.

## Verificación y continuidad de recuperación

Se leyeron las cuatro migraciones y los puntos de configuración relevantes.
Se cotejaron sus hashes con el manifiesto preparado y se registró que los
artefactos de recuperación, su runner y plan 2B.3B permanecen intactos respecto
de `cb468be`. Se revisaron enlaces locales, JSON de evidencia y formato del diff.
No fue necesario cambiar SQL, por lo que **no se inició PostgreSQL ni se ejecutó
ningún SQL**, prueba de recuperación, suite de 72 SQL, 19 consumidores o build.

Los hashes documentales de la evidencia 2B.3B describen su entrega histórica;
no se reescribe esa evidencia al actualizar Markdown en 2B.3C. Su procedimiento
operativo sigue siendo [el plan de recuperación](fase-2b3b-recovery-plan.md).

Revisión organizacional del SQL completada. La adaptación de la configuración
visible sigue pendiente del propietario y de la fase posterior de frontend.
La decisión remota sigue siendo **NO APTO** por los requisitos pendientes de
2B.3B (inventario real de objetos/ACL, versión numérica y privilegios del operador).
Esta revisión no suplanta esos requisitos ni autoriza modificaciones remotas.

No se crearon usuarios/superadmin, no se importaron datos, no se aplicaron
migraciones y no hubo push, merge ni despliegue.

## Cierre operativo

El cierre se realiza desde una terminal Ubuntu normal, fuera del montaje de
solo lectura del agente. Propietario procont y permisos Unix ya permitían
escritura: no se cambian chmod/chown ni archivos fuente. Se comprueba exactamente
el conjunto de siete documentos y se conserva el código y recuperación de 2B.3B.

El PostgreSQL temporal de `/tmp/procont-2b3b-db/cluster` se identifica por ejecutable,
UID, argumentos, PID de su namespace y hora de inicio. Se detiene con pg_ctl en
modo rápido y ordenado; si el PID interno difiere del visible, se usa pg_ctl kill
INT únicamente sobre el master verificado. Se comprueba la desaparición del PID
file y del master, sin señales a otros servidores ni kill -9.

Este informe y su evidencia forman parte del commit
`docs: revisar adaptación organizacional de Procont`. No se ejecutan pruebas,
SQL, migraciones, cuentas, push ni merge. El script de cierre verifica Git limpio
después del commit y muestra su identificador; consultar `git log -1` para obtenerlo.
