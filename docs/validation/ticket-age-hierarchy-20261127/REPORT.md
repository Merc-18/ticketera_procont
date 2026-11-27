# Tickets sin vencimiento, jerarquía y tarjetas — 27/11/2026

Base: main `99a0be897cad2cb21fb6ff8ef2949a248cb425cf`. Implementación única de Codex en la copia escribible; sin depender de Claude. Alcance: frontend, contratos de entrada del navegador, regresiones y documentación. Sin cambios de Supabase, migraciones ni datos existentes.

## Comportamiento resultante

- Se retiran fechas límite, estados «Vencido», «vence hoy/pronto», KPIs de vencimiento, campos de planificación, columna/sort de vencimiento, exportaciones y alertas antiguas asociadas. La importación de Planner ignora Due date; los campos históricos permanecen en el esquema y los tipos de lectura, sin borrarlos ni sobrescribirlos con NULL.
- La antigüedad usa **projects.created_at**, incorporación real del ticket al tablero, y días civiles de **America/Lima**: Hoy / 1 día en tablero / N días en tablero. No utiliza la solicitud, fase, responsable, inicio editable ni updated_at. Un reloj compartido actualiza las etiquetas al cambiar el día de Lima o recuperar foco/visibilidad. La edad no genera color/alerta.
- Dashboard y Equipo muestran antigüedad media neutra; los CSV incluyen antigüedad/creación. Se preservan Cycle/Lead Time de eventos: no son fechas límite ni estimaciones. La tabla puede ordenar por antigüedad.
- Gantt muestra el intervalo observado creación→hoy, con eje civil coherente y meses sin columna fantasma. Roadmap agrupa por trimestre de incorporación en Lima; ya no por entrega planificada.
- Tarjetas activas, completadas y archivadas comparten presentación: título principal, cuatro niveles completos, número en fila propia, checklist separado, avatar y nombre completo. Casos 0/0 («Sin checklist»), 3/3 y 3/18; sin responsable/portafolio/proyecto explícitos. Se conservan colores personales, prioridad, etapas y bloqueo.
- Vencimientos de sesiones y reservas de archivos mantienen sus controles existentes; no se cambia autenticación, RLS, RPC SQL ni políticas de Storage.

## Jerarquía real y consistencia

**Producto → Subproducto → Portafolio → Proyecto → Ticket → Checklist.**

| Nivel visible | Relación existente |
|---|---|
| Producto | requests.system_id → catalog_systems |
| Subproducto | requests.subsystem_id, o requested_subsystem_id original cuando no hay clasificación final → catalog_subsystems; se verifica system_id |
| Portafolio | projects.portfolio_id → portfolios |
| Proyecto operativo | projects.initiative_id → portfolio_initiatives; se verifica portfolio_id |
| Ticket | Una fila public.projects y sus flujos; requests es la solicitud previa |
| Checklist | checklist_items del flujo de ese ticket |

No se prefijan nombres como Quipu/Gestión; se resuelven por UUID y se conservan nombres completos, incluidos nombres largos. Un ID desconocido se muestra «no disponible» y no como «sin asignar». El selector limpia el subproducto al cambiar producto y el proyecto al cambiar portafolio. Creación/aprobación validan la pertenencia del subproducto; edición/asociación conserva el control proyecto→portafolio de la RPC existente. Filtros y búsqueda incorporan las cuatro dimensiones; exportaciones usan el mismo resolver.

El esquema no contiene FK de subproducto a portafolio: no se inventa esa asociación ni se crea una migración. Los tickets internos e históricos sin catálogo conservan esa ausencia («Sin producto», «Sin subproducto»). Dos tickets con la misma iniciativa mantienen responsable, fase, prioridad y checklist propios.

## Pruebas ejecutadas

| Comprobación | Resultado | Alcance |
|---|---|---|
| Node | **215 PASS, 0 FAIL** | Incluye seis casos nuevos: medianoche de Lima, origen inmutable, fechas ausentes/futuras, relaciones válidas/cruzadas y ausencia de fechas en payloads antiguos |
| Regresión UI completa | **154 PASS, 0 FAIL, 6 SKIP / 160 casos** | React y Chromium reales; servicios Auth/REST locales simulados; conserva los seis SKIP anteriores |
| Casos específicos | **8 PASS, 0 FAIL** | Incluidos en la suite y repetidos de forma focalizada tras ajustar el eje Gantt; no se suman a los 154 |
| TypeScript + build | **PASS** | npm run build ejecuta tsc y Vite; log completo conservado |
| Captura del antes | **6 capturas, sin errores JS** | Fuente main@99a0be8 aislada, mismo escenario ficticio; no constituye aprobación de las reglas nuevas |

Los ocho casos específicos cubren: claro/oscuro × escritorio 1440, tablet 834 y móvil 390; nombres largos en jerarquía y responsables; bloqueo; 0/0, 3/3, 3/18; dos responsables del mismo proyecto; fechas históricas de entrega en 2020 ignoradas; CSV, Gantt/Roadmap, detalle, formulario sin fechas, Equipo y tarjetas completadas/archivadas. La geometría comprueba overflow del documento/tarjeta y cruce entre número, checklist y responsable.

Las regresiones relacionadas también cubren 320/360/768/1920 px, colores/contraste, creación/aprobación con IDs, portafolios dependientes, importador, filtros, refresco compartido, exportación paginada, adjuntos y contratos de cliente. Las expectativas antiguas de fechas límite y responsables ocultos se actualizaron a las reglas aprobadas. Se corrigió una lectura redundante de catálogos: Dashboard solo los solicita al exportar.

[Resultados estructurados](results.json) · [Node](node-results.txt) · [UI completa](ui-regression-results.txt) · [Casos específicos](specific-cases-results.txt) · [TypeScript/build](typecheck-build-results.txt).

## Capturas antes/después

[Galería y enlaces](GALLERY.md), [manifiesto antes](before-captures.json), [manifiesto después](after-captures.json). Las capturas se realizaron con React/Vite/Chromium y datos ficticios locales; **no son sesiones autenticadas de producción**. No se solicita revisión del usuario en localhost: la revisión se hará directamente en Vercel tras publicar.

## Conservación, publicación y límites

- Cero migraciones; ningún cambio bajo supabase/. Snapshot tests/ui/qa-dataset.json y package-lock.json idénticos byte a byte a main inicial; hashes en results.json. No se llamaron SQL, Auth Admin ni Storage alojados ni se escribieron datos de producción.
- La carpeta original mantiene su .git protegido; no se fuerza su sincronización ni se elimina su material. No se mezcla el archivo histórico 0f353de ni una rama antigua.
- AGENTS.md, CLAUDE.md, requisitos oficiales, README y estado de proyecto describen la regla vigente y diferencian las evidencias históricas del cierre anterior.
- Entrega por rama/PR a main y despliegue normal GitHub/Vercel, expresamente autorizados. El SHA de integración, deployment y versión servida se registran al finalizar en el recibo local de publicación y en la entrega al usuario; no se fija un SHA propio circular dentro del commit.
- La comprobación Vercel verifica publicación/artefacto; no convierte los fixtures en pruebas E2E de servicios alojados. Los seis SKIP siguen pendientes. Login real de proveedores, UI con cuatro perfiles internos alojados, reservas binarias y entrega E2E de Realtime mantienen los límites previos; no se modifican ni repiten sus pruebas de producción.
