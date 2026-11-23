# Reconstrucción backend, seguridad y M16 — Ticketera Procont

Revisión: **23/11/2026**. Base remota comprobada:
`a61450c93f5180ecd623d945b100424a47a3a5d3`.
Repositorio persistente independiente:
`/home/procont/projects/ticketera-procont/.agent-workspaces/agent1`.
Rama: `rebuild/ticketera-client-data-security-20261123`.
No se reconstruyó Ticketera completa ni se modificó el sistema publicado.

## Handoff y respaldo

- Primer handoff: **`8fabd88e99cc0e53dbc43c3402730d785c148a7a`**, commit local real.
- [Contrato versionado](docs/validation/client-experience-contract-handoff.md), con copia igual
  en `.agent-coordination/client-experience-contract-handoff.md` del workspace anfitrión.
- El SHA final de implementación es la cabecera de esta rama; se entrega al usuario y queda
  registrado en `.agent-backups/ticketera-client-data-security-receipt.json` fuera del árbol
  versionado para evitar una referencia imposible al hash del propio documento.
- Bundle previsto: `.agent-backups/ticketera-client-data-security.bundle`, relativo al workspace
  anfitrión, con esta rama y sus ancestros originales. Resultado de `git bundle verify` y checksum
  se guardan en el recibo externo después de crear el commit. No sustituirlo por un bundle antiguo.

## Contratos y cambios implementados

Nueva migración [20261123000100_client_request_data_security.sql](supabase/migrations/20261123000100_client_request_data_security.sql).
**Preparada y validada localmente; no aplicada a Supabase remoto.** M1–M15 permanecen idénticas.
No cambia propietarios, funciones Edge, login, reglas de productos, cuotas ni permisos M15.
Requiere PostgreSQL 15+ por `NULLS NOT DISTINCT`; validada con PostgreSQL 17.12.

| Área | Contrato final y persistencia |
|---|---|
| Quipu | RUC/proveedor y username exacto sensible a mayúsculas; identity_id de Ticketera. Mismo username resuelve la misma cuenta entre subject/direct/platform cuando hay candidato único. No identifica por nombre. |
| QuipuFac | Identidad empresarial compartida por RUC/proveedor; sus sesiones ven todos los tickets de la cuenta, con nombre declarado por ticket. Otro RUC y Quipu no acceden. |
| Nombre Quipu | Servidor usa verified_name confiable si existe, si no username autenticado. Si requester_name viene del navegador, debe coincidir exactamente. Username no se presenta como nombre humano verificado. |
| Nombre QuipuFac | requester_name obligatorio, editable al crear y almacenado por ticket; no interviene en autorización. businessName no identifica persona. |
| requested_priority | low/medium/high/urgent; default medium para solicitudes nuevas. Null en históricos, sin inferencia/backfill. Original inmutable. |
| urgent_requested | Booleano independiente, default false omitido. **No derivado de requested_priority**; low+true y urgent+false válidos. Se preservan métricas de urgencia M11. |
| Prioridad administrativa | projects.priority y aprobación por personal autorizado sin cambios; una solicitud high puede aprobarse con prioridad administrativa low. |
| Producto/sistema | catalog_systems identificado por system_id; no confundir con projects operativo. Catálogos existentes, sin asociaciones añadidas. |
| Subproyecto | Nueva client_subprojects(p_session_token,p_system_id) devuelve JSON array `{id,system_id,name}` activo/autorizado. Payload subsystem_id validado otra vez al crear. |
| Original del subproyecto | requested_subsystem_id guarda la selección original e inicializa subsystem_id; clasificación interna conserva su operación y no borra el original. |
| Procedencia | requester_name_source: verified_name / username / declared / internal_correction / null histórico. requester_name_verified true solo para verified_name. |
| Consulta cliente | Mismas firmas M13 de lista/detalle; añaden los campos anteriores. Propiedad comprobada en SQL, no ampliada por estudio o nombre. |
| Lectura interna | SELECT autorizado sobre public.requests y embedding existente public.requests(public.projects) entregan requested_priority. Proyección frontend explícita debe incluirla; Agente 2 implementa pantalla/adaptador. |

Se conserva el límite de nombre guardado existente de 200 caracteres. Etiqueta autenticada
excesiva se rechaza sin truncarla ni sustituirla por un dato libre. El piloto no confirmó nombre
personal ni id estable adicional Quipu; no se llamó a proveedores ni se inventaron campos.

### RPC, paginación y errores

El [handoff](docs/validation/client-experience-contract-handoff.md) contiene tipos TypeScript,
payload JSON ficticio, respuestas y todos los argumentos exactos. El servidor devuelve:

- Creación: `{id,request_number,tracking_token}`; estudio/identidad decididos por servidor.
- Resumen: `id,request_number,title,created_at,status,general_status,system_id,requester_name,
  requester_name_verified,requester_name_source,requested_priority,requested_subsystem_id`.
- Detalle: resumen más `description,urgent_requested,rejection_reason,timeline` público permitido
  a la identidad; no se exponen notas internas.
- Listado: limit1..100, offset0..100000, defaults50/0; orden created_at DESC,id DESC y propiedad
  antes de paginar. Sin total nuevo ni fotografía transaccional única; concurrencia puede desplazar
  offsets. Se probaron106 solicitudes propias, empates de timestamp, cuatro páginas y final vacío.
- PT401: sesión ausente/inválida/vencida/revocada o histórica ambigua; PT403 producto ajeno;
  PT404 ticket ajeno/inexistente, conservando sesión válida. Entrada22023/UUID22P02;
  asociación/estado23514. Nunca fallback a una tabla abierta o a otra identidad.

## Auditoría focalizada e históricos

M13 ya filtra por identity_id en lista/detalle. La vulnerabilidad reproducida fue el UPSERT con
provider_id: dos usernames del mismo RUC reutilizaban UUID y se sobrescribía username, permitiendo
que B leyera el ticket de A. No se acredita un incidente remoto en esta tarea. El piloto conocido
utiliza fallback username, no un provider_id individual confirmado.

M16 incluye username en la clave única y evita mutar el alcance de identidad. La resolución de
cuenta por username exacto se serializa con el lock de la empresa; no se unen usuarios por nombre
ni por mayúsculas normalizadas. Un único candidato se reutiliza entre directo/plataforma; varios
UUID históricos para el mismo usuario requieren revisión, sin selección arbitraria ni fusión.

Nuevos enlaces, sesiones y códigos guardan snapshot privado del username autenticado. Históricos:

1. Enlaces/sesiones username exactos y cuenta QuipuFac conservan acceso.
2. Links provider_id sin evidencia se conservan, pero quedan fuera del listado y deniegan detalle,
   reserva y replay. No se reasignan ni borran. El personal interno autorizado conserva sus lecturas.
3. Sesiones/códigos antiguos provider_id sin snapshot fallan cerrados: no pueden adoptar el username
   sobrescrito. Un nuevo ingreso verificado crea capacidad segura, sin recuperar propiedad incierta.
4. Duplicados históricos de username no se fusionan: nueva emisión rechazada22023 hasta revisión.

Esta denegación conservadora tiene impacto de disponibilidad documentado. Cualquier recuperación
de tickets ambiguos requiere evidencia fiable y autorización separada; no se ofrece un mecanismo
administrativo improvisado ni se altera el histórico para superar una prueba.

## Matriz de identidad y permisos

| Actor | Mis tickets/detalle | Creación | Tablas directas |
|---|---|---|---|
| Quipu A | Solo A; distinto username, incluso misma empresa, PT404 | Sesión/producto/estudio/hijo válidos | No por capacidad cliente |
| Quipu B o caso distinto de username | Solo B; UUID A rechazado y sesión conservada | Cuenta independiente | No |
| QuipuFac sesiones mismo RUC | Compartidos de esa empresa, nombres por ticket | Nombre declarado obligatorio, productos permitidos | No |
| QuipuFac otro RUC / otro proveedor | Tickets empresariales ajenos PT404 | Bajo su propia empresa | No |
| Sesión ausente/vencida/revocada/antigua ambigua | PT401 antes de consultar | PT401 antes de crear/replay | No |
| anon sin sesión | Sin datos | Helper antiguo sin EXECUTE | Sin SELECT requests/privadas |
| Auth externo/inactivo | Sin datos por RLS | RPC internas rechazadas | Requests0 filas; privadas sin grants |
| viewer activo | Lectura interna autorizada | RPC internas rechazadas | RLS interna, no tablas privadas |
| superadmin/admin/developer activos | Operaciones internas conservadas | Ambas RPC internas con idempotencia, bajo M15 | Grants existentes |
| service_role técnico | No sustituye una cuenta cliente o superadmin | Emisión/canje de capacidades existente; helper antiguo cerrado | No grants nuevos |

RLS fue comprobada en motor real incluso concediendo SELECT/USAGE temporalmente en la base
desechable: tablas privadas siguen devolviendo cero filas al público/externo; grants de fixture
se retiran. Permisos existentes y propietarios se comparan antes/después de M16.

## Pruebas realmente ejecutadas

| Ejecución | Resultado | Evidencia / clase |
|---|---|---|
| Instalación limpia M1–M16 | **21/21 grupos** con adaptador | [JSON](docs/validation/client-data-security-clean-20261123.json), [log final](docs/validation/client-data-security-20261123/clean-bridge.txt). PostgreSQL real, clase B. |
| Upgrade M15→M16 con históricos | **25/25 grupos** con adaptador | [JSON](docs/validation/client-data-security-upgrade-20261123.json), [log final](docs/validation/client-data-security-20261123/upgrade-bridge.txt). PostgreSQL real, clase B. |
| Node existente | **171/171**, cero omitidas | [Log](docs/validation/client-data-security-20261123/node.txt). Unitarias/servicios simulados, clase E. |
| Preparación Supabase | **8/8** | [Log](docs/validation/client-data-security-20261123/preparation.txt). Unitarias Python, clase E. |

Sin el puente opcional también pasaron 20/20 y 24/24; esas ejecuciones son separadas y no se suman.

Los escenarios incluyen seis identidades y todas las combinaciones de UUID ajeno, misma cuenta
entre directo/plataforma, QuipuFac compartido, nombre por ticket, prioridad/urgencia, pertenencia,
RLS/ACL reales, ocho reintentos concurrentes y ocho canjes con un ganador. Se preservan datos
históricos mediante hash de cada columna previa de todas las tablas public/app_private/auth/storage.
Rollback transaccional probado antes de COMMIT, no como down posterior a datos nuevos.

Auth.uid y Storage son schemas/stubs locales: los roles, políticas, SQL, locks y triggers sí
son PostgreSQL reales. Adjuntos cubren reserva y escritura de metadata bajo política SQL, **no
HTTP Storage**. Seguimiento REQ conserva exactamente número/estado. No se certifica E2E remoto.

Primer intento del arnés falló por nombre regprocedure dependiente del search_path (KeyError),
no por el SQL M16; corregido con firma canónica. Los logs `*-attempt1.txt` se conservan como
evidencia fallida. Rondas posteriores y logs intermedios se conservan identificados; no se suman
sus resultados ni se presentan como una sola suite. El [puente SQL](supabase/tests/client_data_security_bridge.mjs) importa en modo lectura el
adaptador actual del Agente2 y sus contratos. Usa respuestas reales de las RPC en PostgreSQL,
no fixtures de respuesta; comprueba creación, prioridades/urgencia independientes, nombres,
subproyectos, paginación, empresas, detalle ajeno y logout. Hashes de seis fuentes antes/después
aseguran consumidor estable durante cada prueba; están en los JSON. El código frontend estaba
en su worktree y no se incorpora a esta rama. Esto no verifica HTTP/PostgREST ni render React.

UI/Chromium/build son responsabilidad de
integración/frontend y no se ejecutaron en esta entrega SQL, sin cambios de aplicación.

### Reproducción

Desde este repositorio, como usuario normal, usando el runtime persistente ya comprobado:

```bash
python3 -B supabase/tests/client_data_security_local.py --pg-bin /home/procont/projects/ticketera-procont/.agent-backups/postgresql17-runtime/runtime/usr/lib/postgresql/17/bin --runtime-lib /home/procont/projects/ticketera-procont/.agent-backups/postgresql17-runtime/runtime/usr/lib/x86_64-linux-gnu --work-root /home/procont/projects/ticketera-procont/.agent-backups/pg --scenario clean --frontend-repo /home/procont/projects/ticketera-procont/.agent-workspaces/agent2
python3 -B supabase/tests/client_data_security_local.py --pg-bin /home/procont/projects/ticketera-procont/.agent-backups/postgresql17-runtime/runtime/usr/lib/postgresql/17/bin --runtime-lib /home/procont/projects/ticketera-procont/.agent-backups/postgresql17-runtime/runtime/usr/lib/x86_64-linux-gnu --work-root /home/procont/projects/ticketera-procont/.agent-backups/pg --scenario upgrade --frontend-repo /home/procont/projects/ticketera-procont/.agent-workspaces/agent2
node --test tests/*.test.mjs
python3 -B -m unittest discover -s tests -p test_supabase_preparation.py
```

Runtime PostgreSQL17.12 extraído de paquetes oficiales PGDG, checksums SHA256 verificados contra
su índice recibido por HTTPS. Sin instalar servicios ni modificar permisos. El runner exige ruta
persistente, no acepta DSN remoto, elimina variables PG* heredadas, usa socket privado y desactiva
TCP/registro de sentencias. Detiene servidor en finally y conserva clusters como evidencia local.

## Aceptación y pendientes

| Requisito | Estado / límite |
|---|---|
| Aislamiento individual Quipu, empresa QuipuFac y separación entre proveedores | CUMPLE local; remoto NO VERIFICADO. |
| Nombre confiable/declarante y campos exactos del handoff | CUMPLE local; adaptador del Agente2 comprobado contra SQL real; integración de ramas pendiente. |
| Prioridad solicitada, urgencia y prioridad administrativa independientes | CUMPLE local, incluidas respuestas internas autorizadas. |
| Subproyectos autorizados y persistidos | CUMPLE local sobre catálogo real de migraciones; catálogo remoto no consultado. |
| Migración aditiva, históricos, propietarios/ACL y rollback transaccional | CUMPLE local; sin backfill ni reasignación. |
| M16 remota, UI integrada y Supabase HTTP/Auth/Storage real | NO VERIFICADO; fuera de esta autorización. |

Pendientes: revisión cruzada e integración posterior autorizada; aplicación remota separada;
validación alojada si se autoriza. Identidades históricas ambiguas requieren decisión individual
con evidencia. No se pidieron credenciales ni se contactó a Quipu/QuipuFac.

Comparación de integridad: [scope.json](docs/validation/client-data-security-20261123/scope.json)
acredita 672 archivos protegidos sin cambios (src, contratos, Edge, configuración, M1–M15 y demás
archivos fuera de alcance). [Validación documental](docs/validation/client-data-security-20261123/documentation-check.json)
comprueba archivos destino de enlaces locales y bloques de código balanceados en ocho documentos;
no afirma validación de URLs HTTP o anchors ni un linter Markdown externo.

Archivos de implementación: una nueva migración y dos pruebas en supabase/tests; no se editan
migraciones previas. Documentación: seis especificaciones técnicas/requisitos, handoff y este informe,
más logs y JSON de validación. El inventario exacto de archivos se incorpora al recibo externo.

**Veredicto: APROBADO CON OBSERVACIONES para revisión backend local.**
Sin push, merge, SQL remoto, despliegue ni modificación de tickets reales.
