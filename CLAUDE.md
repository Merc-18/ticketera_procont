# CLAUDE.md — Reglas del proyecto

## Commits

- **No incluir Co-Authored-By en ningún commit.** No agregar líneas `Co-Authored-By: Claude` ni ninguna variante al mensaje de commit. Los commits deben aparecer solo con el autor del proyecto.

## Corrección funcional autorizada — regla vigente del 27/11/2026

El usuario solicita implementar y publicar la corrección en una intervención, sin depender de Claude. Las restricciones documentales del cierre siguiente son históricas y quedan sustituidas para este trabajo por la autorización de regresiones, TypeScript, build y publicación normal GitHub/Vercel.

- Tickets **sin vencimiento**, sin KPIs, filtros, inputs, CSV ni alertas de entrega. Columnas y datos históricos intactos; no escribir ni limpiar due_date/start_date/SLA desde estas pantallas.
- Antigüedad civil de Lima desde **projects.created_at**: Hoy / 1 día en tablero / N días en tablero. No reiniciar por fase, edición o responsable ni colorear la antigüedad como alerta. No confundir antigüedad con Cycle/Lead Time ni con expiración de sesiones/reservas.
- **Producto → Subproducto → Portafolio → Proyecto → Ticket → Checklist**. catalog_systems y catalog_subsystems son producto/subproducto; portfolio_initiatives es el proyecto operativo; projects es el ticket. Relaciones reales por IDs, sin nombres prefijados ni asociaciones inventadas. Cada ticket tiene fase, prioridad, responsable y checklist propios.
- Tarjetas con nombres completos de los cuatro primeros niveles, título destacado, número separado, checklist 0/0 explícito, avatar y nombre. No superponer progreso/contador/responsable/asignación. Preservar colores personales y bloqueo, con estados ausentes explícitos.
- Comprobar nombres largos, bloqueo, 0/0, 3/3, 3/18, dos responsables en el mismo proyecto, antigüedad sin alertas, temas claro/oscuro y tres tamaños. Capturas antes/después, regresiones, TypeScript y build. Revisión del usuario en Vercel, sin pedir revisiones localhost.
- No modificar Supabase ni datos existentes, no aplicar migraciones. Conservar la carpeta original protegida y usar la copia independiente escribible. Los 17 PASS SQL externos no son pruebas de estas nuevas pantallas.

## Documentación vigente

Revisión documental vigente: **27/11/2026**; base funcional `406a46351411fdf845a73a811cb798b7964617b1`, más el cierre documental iniciado en `94b2329`. Corte histórico anterior: 20/11/2026 sobre `c857a727c8e7640bbce8daada940f973acbf013e`. [Fuente oficial de requisitos](docs/specs/PRODUCT_REQUIREMENTS.md). Las evidencias históricas no sustituyen el estado de [PROJECT_STATUS](docs/PROJECT_STATUS.md).

## Estado final verificado — revisión independiente 27/11/2026

Revisión independiente recuperada del CLAUDE.md sin commit del checkout original `integration/board-operations`. Se conserva su evidencia fechada y se reconcilia con el cierre documental y los 17 casos externos de ChatGPT. README, PROJECT_STATUS y las cabeceras de las specs ya están actualizados; sus secciones históricas conservan fecha y alcance. No se fusionó la rama antigua.

| Dimensión | Estado comprobado el 27/11/2026 |
|---|---|
| GitHub | Base funcional antes del cierre: `406a46351411fdf845a73a811cb798b7964617b1` (fix Realtime `requests`). El cierre incorpora `94b2329` y esta actualización exclusivamente documental. Ramas remotas observadas en el corte independiente: `main`, `fix/qa-catalog-refresh-20261125`, `fix/realtime-requests-publication-20261126` (catálogo por ascendencia y Realtime por parche equivalente ya incorporados en main). |
| Vercel | Corte independiente anterior a este push: check GitHub del commit 406a463 `success`. El dominio sirve `index-DBuMAsFW.js` (382.960 bytes, mismo tamaño que b69afbd), **Versión 202611261821**. Vercel CLI sin sesión: el panel no se consultó. |
| Supabase | `xsxdpaiivklqeudgqoqf`: **22/22 migraciones remotas**; la última es `20261126231933_realtime_requests_postgres_changes` (añade `public.requests` a `supabase_realtime`). |
| Checkout local | La carpeta original permanece en `integration/board-operations`, con main antiguo `16064c5` y `.git` de solo lectura. La publicación se realiza desde la copia independiente escribible, en main con remoto origin de GitHub. No forzar la sincronización original ni eliminar archivos locales. |

### Pruebas APROBADAS (no repetir)

- Local: Node 209/209; UI Chromium 146 PASS / 0 FAIL / **6 SKIP** (los SKIP no cuentan como aprobados); `tsc` + build PASS. Las suites UI usan fixtures, no Supabase alojado.
- PostgreSQL 17 local: viewer, subproyectos, checklist persistente, M20 (evidencia de los informes de cierre del 25/11).
- Producción, pantallas públicas: portal, selección y formularios Quipu/QuipuFac sin enviarlos, login interno y seguimiento `REQ26-007`, con 0 errores JS.
- Producción, Auth/Storage/Realtime (26/11, `.agent-artifacts/authenticated-qa-20261126`): login con JWT, rotación de refresh, rechazo de identidades sin perfil (RLS/RPC), Storage binario en un bucket QA aislado (MIME, tamaño, URL firmada), rechazo de subidas sin reserva y broadcast Realtime. Limpieza verificada: 0 cuentas y 0 buckets QA residuales.

### Evidencia adicional incorporada — ChatGPT, 27/11/2026

**17 PASS, 0 FAIL** externos: SQL/RPC reales de producción vía Supabase MCP, identidades/sesiones sintéticas y BEGIN/ROLLBACK, según información proporcionada por el usuario. Incluyen separación de identidades Quipu/QuipuFac con mismo RUC, listado/detalle/adjuntos ajenos denegados, sesiones desconocidas/expiradas/revocadas, logout y rechazo de acceso interno sin perfil. No fueron ejecutados por Codex, no se repiten y no son E2E. [Casos exactos y metodología](docs/validation/technical-close-20261127/chatgpt-production-validation.json).

Los conteos post-ROLLBACK reportados, RLS en 19 tablas y publicación Realtime de cuatro tablas se conservan con procedencia externa en [el informe](docs/validation/technical-close-20261127/REPORT.md). No se modifican Supabase, código ni datos en este cierre.

### NO VERIFICADO en producción (pendientes reales)

1. Operaciones con perfiles internos activos (superadmin/admin/developer/viewer): Dashboard, Boards, Gantt, Roadmap, Equipo, fase/checklist/comentarios, cierre/reapertura y confirmación M20. Bloqueo: `service_role` recibe 42501 sobre `public.users` y no hay una cuenta QA interna autorizada.
2. Login real Quipu/QuipuFac y recorridos UI de cliente (sesión, Mis tickets, detalle y subidas). El aislamiento de backend de listado/detalle/sesiones ya tiene los 17 PASS SQL externos; esto no acredita login externo ni UI.
3. Flujo de adjuntos de la aplicación: reserva válida, límite de 4 archivos, descarga autorizada y vínculo con el actor.
4. **Realtime Postgres Changes sobre `requests` bajo RLS por rol.** La migración 22 está confirmada en el manifiesto y la configuración consta en la evidencia externa. Falta prueba de recepción del evento y actualización del Dashboard; no convertir configuración en PASS E2E.
5. Configuración de Auth interno (Site URL `localhost:3000`, allowlist vacía, SMTP/invitaciones) según la última lectura del 23/11; no se ha vuelto a comprobar.
6. No existen un proyecto Supabase QA separado ni un Preview protegido; Vercel CLI no tiene sesión.

### Contradicciones documentales reconciliadas en el cierre

- `README.md`, `docs/PROJECT_STATUS.md` y las cabeceras de TESTING_SPEC, DATABASE_SPEC y TRACEABILITY_MATRIX ya establecen la base funcional `406a463`, las 22 migraciones y la procedencia de los 17 PASS externos. Las antiguas referencias 17/17, 21/21, «M16 no aplicada» y versiones anteriores se mantienen solo como cortes históricos.
- Los informes del 23–25/11 conservan sus límites originales. El [informe vigente del 27/11](docs/validation/technical-close-20261127/REPORT.md) y la [nota de publicación](docs/validation/technical-close-20261127/PUBLICATION.md) prevalecen para el cierre; no convertir sus antiguos NO VERIFICADOS en PASS por inferencia.
- `REPORT-backend-codex1.md` es un informe histórico del 23/11, no el estado vigente de migraciones.

### Observaciones menores

- Hay ramas locales obsoletas cuyo único commit «exclusivo» (`c6e79f4`) es la versión anterior a la reescritura de un commit que ya está en main: no se pierde nada al archivarlas.
- Hay un archivo vacío `1` sin seguimiento en la raíz del checkout.
- Tolerancia M16b: pendiente de retirar con una migración futura. Exportación sin snapshot transaccional.

## Publicación documental anterior — corte histórico

El usuario autorizó publicar por push normal a main y el despliegue automático de Vercel resultante. El alcance es exclusivamente documentación: integrar `94b2329`, recuperar este archivo y registrar observaciones. No fusionar `integration/board-operations` ni el archivo `0f353de`; no ejecutar pruebas ni modificar código funcional, Supabase o datos.

**Dictamen final: APROBADO CON OBSERVACIONES.** Documentación de cierre reconciliada. Continúan pendientes los recorridos E2E señalados y la limitación de permisos de la carpeta original. El SHA final y el check Vercel se confirman al completar el push; no declarar la producción completamente validada.
