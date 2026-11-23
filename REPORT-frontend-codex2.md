GATE histórico de Taste: **OPEN 19 (rounds used up)**. No se reiniciaron rondas, ejecutó un gate nuevo ni simuló PASS.

# Entrega frontend — experiencia del cliente

Fecha: 23/11/2026. Repositorio independiente y persistente:
`/home/procont/projects/ticketera-procont/.agent-workspaces/agent2`.

- Base publicada y `origin/main` comprobados antes de trabajar: `a61450c93f5180ecd623d945b100424a47a3a5d3`.
- Origin: `https://github.com/Merc-18/ticketera_procont.git`.
- Rama: `rebuild/ticketera-client-experience-ui-20261123`.
- Checkpoint local verificado: `016d72476ff86e9a97930b8251c720491abd7bc9`.
- Bundle final: `/home/procont/projects/ticketera-procont/.agent-backups/ticketera-client-experience-ui.bundle`.
- El SHA final y el checksum del bundle se entregan en el recibo externo `.agent-backups/ticketera-client-experience-ui-receipt.json`, evitando la referencia circular de incluir el hash de este mismo commit en su árbol. También se proporcionan en la respuesta de entrega.

Es una implementación nueva de las correcciones sobre el diseño publicado. No representa la recuperación del objeto original `474d8b29`, que no estaba disponible.

## Cambios implementados

El portal conserva logo, marca Procont, ingreso independiente del personal y versión. Muestra únicamente **Nueva Solicitud** y **Rastrear Solicitud**. La composición usa las tarjetas publicadas, dos columnas en escritorio y una en móvil; la cabecera estrecha mantiene el nombre de la marca completo.

El espacio autenticado mantiene **Nuevo ticket** y **Mis tickets**, sin otro login al alternar. No cambian los campos de ingreso, el almacenamiento del token, la revocación ni las funciones de autenticación. El borrador de campos y el intento de creación viven solo en memoria del espacio y sobreviven al cambio de sección. Enviar o cancelar limpia el borrador; un resultado incierto conserva payload y clave para reintentar sin duplicar.

Quipu muestra solo lectura del nombre verificado o del username exacto, rotulado **Usuario autenticado** cuando corresponde. No pide nombre manual ni envía un nombre libre: el payload omite `requester_name` para Quipu y el servidor lo deriva. Si falta una etiqueta confiable o supera el límite del contrato, se informa y se bloquea el envío sin inventarla. QuipuFac conserva el nombre obligatorio, editable y guardado por ticket; no se utiliza como autorización.

El formulario ofrece **Bajo / Medio / Alto / Urgente**, inicialmente **Medio**. Envía `requested_priority` como `low / medium / high / urgent`. El checkbox **Solicito atención urgente** sigue siendo un dato independiente: cambiar cualquiera de los dos controles no modifica el otro. Se prueban combinaciones como prioridad Bajo con urgencia y prioridad Alto sin urgencia.

La prioridad solicitada aparece en Mis tickets, detalle, RequestInbox y RequestValidationModal. La bandeja y el modal la rotulan **Prioridad solicitada por el cliente**; el selector administrativo se rotula **Prioridad definitiva asignada por el personal**. No se altera la aprobación, su prioridad inicial, clasificación, responsable ni payload administrativo.

Los subproyectos se consultan al seleccionar producto mediante `client_subprojects` y el token de la sesión. Solo se muestran los hijos autorizados de ese producto. Se limpia la selección al cambiar, se descartan respuestas tardías y se distinguen carga, error y catálogo vacío. Se exige selección cuando `requires_subproject` es verdadero y hay opciones activas. No hay opciones Web/Móvil/Android hardcodeadas ni consultas a `projects` para alimentar el selector.

Mis tickets utiliza páginas del servidor de hasta 50 registros. Quipu ve su identidad individual; QuipuFac ve la cuenta empresarial del RUC autenticado y los nombres declarados de cada solicitud. Se muestran REQ, producto, subproyecto original cuando existe, nombre de solicitante empresarial, fecha, prioridad solicitada y estado. Las tarjetas se usan también en tablet para conservar legibilidad; escritorio utiliza tabla con desplazamiento interno cuando hace falta.

La paginación avanza por la cantidad realmente recibida, confirma el final con respuesta `[]`, conserva la página anterior si falla la siguiente y permite reintentar esa misma página. No inventa un total ni descarga todos los tickets para filtrar en React. Los nombres de subproyecto se resuelven mediante opciones autorizadas; si un hijo ya no está disponible, se indica esa ausencia sin usar la clasificación interna como sustituto.

## Contrato y compatibilidad

Se leyó íntegramente `.agent-coordination/client-experience-contract-handoff.md`, publicado por el agente 1 en el commit **`8fabd88e99cc0e53dbc43c3402730d785c148a7a`**. Su copia versionada está en el repositorio del agente 1. SHA-256 del handoff consultado:
`8b02cc9bdb9e088cb1225056bdbee2a11e2b96abf46ea2a48be31be3e7557fa9`.

Se implementaron sus firmas en `contracts/client-access-client.*` y en el adaptador frontend, incluidos `client_subprojects`, el payload con `system_id/subsystem_id`, la prioridad y la urgencia independientes, los campos originales `requested_priority/requested_subsystem_id` y la procedencia del nombre. El listado conserva `p_limit/p_offset`; no se añadió un total o un filtro por RUC suministrado por el navegador.

`PT401` regresa al ingreso. `PT403` y `PT404` conservan sesión válida. Un error de catálogo no equivale a una lista vacía. Se conservan valores históricos null, sin inferir prioridad Medio ni un subproyecto anterior. El seguimiento público REQ sigue mostrando exclusivamente número y estado.

El agente 1 entregó backend **`b795fb9368b2e9a9104f516b9933e04af254f610`** y ejecutó este consumidor exacto contra PostgreSQL 17/M16 desechable: **21/21 grupos en instalación limpia y 25/25 en upgrade**. No fueron respuestas RPC simuladas ni operaciones HTTP remotas; Auth/Storage de esa clase de prueba tienen sus stubs locales, según su informe. El agente 2 verificó que los hashes de los seis consumidores coinciden con esas evidencias. [Contraste y procedencia](docs/validation/client-experience-ui-20261123/backend-compatibility.json).

La propiedad efectiva y las salvaguardas históricas `provider_id` pertenecen al servidor. No se añadió un fallback frontend por RUC, nombre o estudio para recuperar registros denegados. M16 sigue **sin aplicación remota**; la integración y activación posterior requieren una tarea autorizada independiente.

## Pruebas

| Comprobación | Resultado | Evidencia |
| --- | --- | --- |
| Galería y suite completa sobre build de producción | **36/36 PASS; 0 FAIL; 0 SKIP** | [Salida](docs/validation/client-experience-ui-20261123/production-ui-tests.txt) |
| Navegación, cuatro roles, adjuntos y regresiones existentes | **31/31 PASS** con servicios simulados | [Salida](docs/validation/client-experience-ui-20261123/navigation-tests.txt) |
| Adaptador frontend | **23/23 PASS**, incluidas las ocho combinaciones de prioridad/urgencia | [Salida](docs/validation/client-experience-ui-20261123/adapter-tests.txt) |
| TypeScript y Vite | **PASS** | [Build](docs/validation/client-experience-ui-20261123/build.txt) |
| Consumidor TypeScript del contrato | **PASS**, compilación sin red | `tests/client-access-contract.types.mts` |
| Lógica de aprobación | `decide`, `priority`, `missing` y `urgent` iguales a la base mediante comparación AST | [Scope](docs/validation/client-experience-ui-20261123/approval-scope.json) |
| Integridad de alcance | Cero archivos backend/SQL modificados; login, sesiones, operaciones, App y dependencias conservados | [Scope](docs/validation/client-experience-ui-20261123/scope.json) |

La suite nueva comprueba formulario por proveedor, readonly/fallback de Quipu, nombre obligatorio de QuipuFac, ausencia de etiqueta confiable, cuatro prioridades, urgencia independiente, conservación y cancelación del borrador, reintento con misma clave/payload, selección y cambio de producto, opciones autorizadas, respuesta tardía, errores/vacíos, identidad individual, cuenta compartida del mismo RUC, otro RUC, `PT404` sin logout, `PT401` y bandeja/modal sin aprobar.

La paginación recorre **137 tickets empresariales ficticios** en páginas de 50/50/37 y una respuesta vacía para confirmar el final, incluye fallo intermedio y reintento, retorno de página y otra sesión de la misma cuenta. La interfaz no acumula páginas, por lo que no necesita deduplicar una colección descargada completa. La paginación offset no constituye un snapshot transaccional bajo cambios concurrentes y conserva el límite de offset del contrato.

Las primeras pruebas del harness en modo DEV usaban el simulador del navegador y no permitían observar las solicitudes HTTP. Se corrigió el harness para usar el transporte HTTP simulado tanto en DEV como en producción. La comprobación de paginación admite el montaje duplicado de efectos de React StrictMode en DEV; la secuencia de avance/reintento y la confirmación del fin siguen comprobándose. Los resultados anteriores se conservan en `.agent-artifacts`, sin contarlos como aprobaciones finales.

## Galería y responsive

**133 capturas**, todas de **Versión 202611231008**. Cuatro tamaños: desktop 1440×900, laptop 1366×768, tablet 768×1024 y móvil 390×844. [Galería completa](docs/validation/client-experience-ui-20261123/gallery.md) y [manifest con hashes de fuentes, assets y PNG](docs/validation/client-experience-ui-20261123/gallery-manifest.json).

| Tamaño | Portal | Quipu | QuipuFac / urgencia independiente | Cuenta empresarial | Bandeja | Modal / prioridad definitiva |
| --- | --- | --- | --- | --- | --- | --- |
| Desktop | [PNG](docs/validation/client-experience-ui-20261123/screenshots/desktop-01-portal.png) | [PNG](docs/validation/client-experience-ui-20261123/screenshots/desktop-30-quipu-prioridad-alto.png) | [PNG](docs/validation/client-experience-ui-20261123/screenshots/desktop-33-quipufac-bajo-con-urgencia.png) | [PNG](docs/validation/client-experience-ui-20261123/screenshots/desktop-34-cuenta-empresarial.png) | [PNG](docs/validation/client-experience-ui-20261123/screenshots/desktop-35-bandeja-prioridad-solicitada.png) | [PNG](docs/validation/client-experience-ui-20261123/screenshots/desktop-36b-modal-prioridad-definitiva.png) |
| Laptop | [PNG](docs/validation/client-experience-ui-20261123/screenshots/laptop-01-portal.png) | [PNG](docs/validation/client-experience-ui-20261123/screenshots/laptop-30-quipu-prioridad-alto.png) | [PNG](docs/validation/client-experience-ui-20261123/screenshots/laptop-33-quipufac-bajo-con-urgencia.png) | [PNG](docs/validation/client-experience-ui-20261123/screenshots/laptop-34-cuenta-empresarial.png) | [PNG](docs/validation/client-experience-ui-20261123/screenshots/laptop-35-bandeja-prioridad-solicitada.png) | [PNG](docs/validation/client-experience-ui-20261123/screenshots/laptop-36b-modal-prioridad-definitiva.png) |
| Tablet | [PNG](docs/validation/client-experience-ui-20261123/screenshots/tablet-01-portal.png) | [PNG](docs/validation/client-experience-ui-20261123/screenshots/tablet-30-quipu-prioridad-alto.png) | [PNG](docs/validation/client-experience-ui-20261123/screenshots/tablet-33-quipufac-bajo-con-urgencia.png) | [PNG](docs/validation/client-experience-ui-20261123/screenshots/tablet-34-cuenta-empresarial.png) | [PNG](docs/validation/client-experience-ui-20261123/screenshots/tablet-35-bandeja-prioridad-solicitada.png) | [PNG](docs/validation/client-experience-ui-20261123/screenshots/tablet-36b-modal-prioridad-definitiva.png) |
| Móvil | [PNG](docs/validation/client-experience-ui-20261123/screenshots/movil-01-portal.png) | [PNG](docs/validation/client-experience-ui-20261123/screenshots/movil-30-quipu-prioridad-alto.png) | [PNG](docs/validation/client-experience-ui-20261123/screenshots/movil-33-quipufac-bajo-con-urgencia.png) | [PNG](docs/validation/client-experience-ui-20261123/screenshots/movil-34-cuenta-empresarial.png) | [PNG](docs/validation/client-experience-ui-20261123/screenshots/movil-35-bandeja-prioridad-solicitada.png) | [PNG](docs/validation/client-experience-ui-20261123/screenshots/movil-36b-modal-prioridad-definitiva.png) |

El modal tiene capturas de su parte superior (`36-modal-prioridades-distintas`) y de su parte inferior (`36b-modal-prioridad-definitiva`) para revisar ambos datos en pantallas pequeñas. Son capturas del navegador con el pie nativo de versión, sin reconstruir imágenes. La franja roja identifica datos/servicios ficticios; no forma parte de la aplicación publicada. Se revisaron ausencia de desborde horizontal, botones nombrados y errores React, además del comportamiento de hover, pulsación, teclado y movimiento reducido. No se presenta como prueba física de dispositivos ni auditoría completa de accesibilidad.

## Diseño y rendimiento conservados

Se conservaron SaaS corporativo, login minimalista, formularios, panel Enterprise, Procont, contraste medio, Lucide y microinteracciones. Se reutilizó la dirección de las instrucciones de diseño ya revisadas y las excepciones publicadas de Taste/Emil; no se descargó otro kit ni se creó una nueva dirección artística. El bloque CSS de animaciones publicado permanece idéntico.

| Before | After | Why |
| --- | --- | --- |
| Tres tarjetas públicas | Dos tarjetas con los mismos estilos | Decisión nueva del usuario |
| Nombre manual para ambos proveedores | Quipu informativo y QuipuFac editable | Identidad automática sin introducir otro login |
| Urgencia como único selector del cliente | Prioridad solicitada y urgencia independientes | Conservar ambas decisiones y sus significados |
| Listado limitado al primer lote | Navegación de páginas autorizadas | Consultar toda la cuenta mediante la API existente |
| Sin prioridad solicitada visible en revisión interna | Dato readonly y selector administrativo claramente rotulados | Evitar que el valor del cliente reemplace la decisión interna |

No se modifican los límites de carga diferida de `App.tsx` ni Planner. JavaScript realmente cargado en portal y cliente: **452.982 bytes**, inferior al umbral de advertencia de 450 KiB. Dashboard: 474.499; bandeja: 511.664; Planner abierto: 855.589; Kanban: 682.543 bytes. Estas vistas internas tienen **WARN** por superar 450 KiB, permaneciendo bajo el umbral FAIL de 900 KiB. Las mediciones se realizan por recorrido, sin afirmar que visitar toda la SPA mantiene eternamente el acumulado por debajo del límite. [Medición y scripts cargados](docs/validation/client-experience-ui-20261123/browser-bundle.json).

El gate Taste histórico conserva **OPEN 19 (rounds used up)** y sus [excepciones documentadas](docs/validation/ux-ui-final-adjustments-20261120/taste-findings.md). La aprobación de las pruebas funcionales y del presupuesto medido no se presenta como un PASS global nuevo de Taste.

## Archivos y alcance

- Contrato consumidor: `contracts/client-access-client.mjs`, `.d.mts`.
- Cliente: `ClientWorkspace`, `ClientNewTicket`, `MyTickets`, `ClientTicketDetail`, `ClientTicketStatus`, `useSubprojectNames`.
- Formularios y revisión: `PublicLanding`, `PublicRequestForm`, `RequestedPriority`, `RequestInbox`, `RequestValidationModal`.
- Adaptadores/tipos: `src/lib/client-portal.ts`, `src/lib/client-request-data.ts`, `src/types/database.types.ts`.
- Estilos: ajustes acotados de `src/index.css`; sin cambio de Tailwind, fuentes, librerías o assets publicados.
- Fixtures y pruebas: simulador cliente, contratos TypeScript, tests del adaptador, navegación y suite UX con HTTP local.
- Evidencias: este informe, la galería y los JSON/logs bajo `docs/validation/client-experience-ui-20261123`.

No se modificaron `supabase/**`, SQL, migraciones, RPC, RLS, Edge Functions, contratos de servidor ni archivos del agente 1. Los archivos de login y almacenamiento de sesión se conservaron byte a byte. El checkout compartido no recibió cambios de código; solo se utilizaron las carpetas explícitamente autorizadas para copias, coordinación y respaldo.

## Pendientes y reproducción

No quedan correcciones frontend pendientes dentro del alcance solicitado. Quedan fuera de esta entrega la integración de las ramas, la aplicación remota de M16, el despliegue y la comprobación alojada posterior. El borrador en memoria conserva campos y selecciones, no archivos adjuntos o recibos al abandonar su vista; se mantiene el ciclo de adjuntos existente.

No se realizaron logins externos reales, creación de tickets reales, escrituras en Supabase remoto, push, merge o despliegue. No se modificó `config.toml` ni se solicitaron permisos adicionales.

Desde este repositorio independiente:

```bash
node --test tests/client-portal.test.mjs
node --test tests/ui/portal-navigation.ui.test.mjs
UI_UX_BUILD_DIR="$PWD/.agent-artifacts/review-build" UI_UX_EVIDENCE="$PWD/.agent-artifacts/review-evidence" UI_UX_SCREENSHOTS="$PWD/.agent-artifacts/review-evidence/screenshots" node --test tests/ui/ux-four-areas.ui.test.mjs
git bundle verify ../../.agent-backups/ticketera-client-experience-ui.bundle
```

Las rutas `.agent-artifacts` y `.npm-cache` están excluidas localmente en este repositorio independiente. El trabajo y el bundle se guardan en disco persistente dentro del workspace; `/tmp` no es el almacenamiento de entrega.
