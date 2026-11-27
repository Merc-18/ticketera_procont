# Estado operativo — Ticketera Procont

## Refinamiento visual vigente — 27/11/2026

Base main `7cf700390310fd0d6622806451de18034e03944e`. Solo frontend: avatares sin nombres visibles, nombre completo accesible/tooltip, selección explícita del Kanban sin checkbox, antigüedad Hoy/1d/Nd y barra de checklist de 30 px. Se conservan cálculo Lima, acciones masivas, relaciones y administración. [Informe, pruebas, capturas y autocrítica](validation/card-refinement-20261127/REPORT.md). Sin cambios de Supabase ni datos.

## Simplificación anterior de tarjetas — 27/11/2026

Base: main `40f582de2f314be5f2b46bbaa2f39ecfeb5eaa14`. Se compacta la presentación a Producto → Subproducto → Proyecto; título de dos líneas, prioridad/antigüedad juntas y checklist/responsable separados. Portafolio, INT/REQ, área y solicitante permanecen en detalle; filtros, RPC y administración conservados. Sin Supabase, migraciones ni escrituras de datos. [Pruebas y capturas de esta entrega](validation/compact-ticket-cards-20261127/REPORT.md). La copia original protegida permanece intacta.

## Corrección funcional anterior — 27/11/2026

Se implementa sobre main `99a0be8`: tickets sin vencimiento, antigüedad civil de Lima desde creación en tablero, jerarquía de cuatro niveles visible y tarjetas sin superposición. No se modifica Supabase, esquema ni datos ficticios. La publicación de esta corrección y sus regresiones está autorizada por el usuario. [Reglas y evidencia de esta entrega](validation/ticket-age-hierarchy-20261127/REPORT.md). El cierre documental que sigue es el corte anterior, con sus 22 migraciones y 17 PASS SQL externos; esos resultados no sustituyen las pruebas de esta interfaz.

Revisión: **27/11/2026**. Base funcional: **`406a46351411fdf845a73a811cb798b7964617b1`**. [Cierre técnico y evidencias](validation/technical-close-20261127/REPORT.md).

| Área | Estado y procedencia |
|---|---|
| Código | Base funcional `406a463`; cierre documental iniciado en `94b2329`, con CLAUDE.md recuperado selectivamente. Publicación por push normal a main autorizada; sin cambios funcionales. |
| Vercel | Estado GitHub del commit: **SUCCESS**, [deployment](https://vercel.com/merc-18s-projects/ticketera-procont/EncbzJ62P6ZyWXLkN5wjMJQtBQuv). Ese deployment corresponde al corte funcional anterior. El usuario autorizó el despliegue automático de este cierre; su check se verifica para el SHA final sin repetir pruebas de la web. |
| Web | https://ticketera-procont.vercel.app. El cierre no certifica nuevamente versión visible ni SHA del bundle servido. |
| Supabase | Único proyecto autorizado `xsxdpaiivklqeudgqoqf`. **22/22 migraciones** contrastadas con archivos Git y con `list_migrations` de solo lectura. |
| Backend de cliente | **17 PASS, 0 FAIL**, evidencia externa de ChatGPT del 27/11, SQL/RPC reales en producción con BEGIN/ROLLBACK. Lista y alcance en el informe; no E2E. |
| RLS / Realtime | Según comprobación externa posterior al ROLLBACK: RLS en 19 tablas públicas; publicación de `projects`, `project_flows`, `notifications`, `requests`. Configuración no equivale a entrega de eventos. |
| Auth / Storage / transporte | Auditoría Codex anterior: Auth real, Storage binario en bucket QA aislado y broadcast Realtime comprobados. Perfiles de aplicación no provisionables con service_role (403/42501). No prueba UI con roles activos ni reservas de adjuntos. |
| Datos | Conservados; este cierre no realizó escrituras ni volvió a generar datos. Conteos posteriores al ROLLBACK reportados por ChatGPT se detallan abajo. |
| Git local | Copia independiente de cierre en main sobre `406a463`; cambios documentales registrados y publicación normal en main autorizada. Carpeta original sigue protegida por `.git` de solo lectura; no afirmar que fue cambiada a main. |
| Ramas | 34 heads locales revisados por ascendencia/equivalencia; ambas correcciones remotas ya incorporadas. Respaldo antiguo de preparación y snapshot local se conservan como archivo, sin mezclarlos con código actual. |

## Datos conservados: comprobación externa del 27/11

ChatGPT reportó tras ROLLBACK: **30 tickets QA, 35 solicitudes QA (5 pendientes), 2 tickets reales y 6 solicitudes reales**. Se conservaron **27 sesiones de cliente y 5 vínculos cliente-solicitud** preexistentes. Cero empresas/identidades sintéticas residuales y cero cuentas Auth QA restantes. Estos valores son evidencia externa proporcionada por el usuario, no un nuevo inventario ejecutado por Codex. [JSON de procedencia](validation/technical-close-20261127/chatgpt-production-validation.json).

## Validaciones pendientes — sin aprobación implícita

1. Login real contra Quipu y QuipuFac y sus contratos/URLs oficiales de producción. El uso anterior de APIs de desarrollo sigue siendo el entorno autorizado hasta nueva decisión.
2. UI publicada con sesiones reales de superadmin, admin, developer y viewer activos: Dashboard, Boards, Requests, Equipo, Gantt/Roadmap y acciones permitidas/prohibidas.
3. Flujo completo de aprobación M20 y operaciones de tablero/checklist desde UI con sesiones de personal en producción. Hay evidencia local previa; las 17 pruebas SQL nuevas no lo cubren.
4. Transferencia binaria mediante reservas reales de Ticketera: autoría, límites de cuatro archivos/2.500.000 bytes y acceso propio/ajeno. El bucket aislado ya probado no sustituye este flujo.
5. Recepción E2E de eventos PostgreSQL Realtime, incluida actualización de Dashboard por `requests`. M22 y publicación confirmada no prueban entrega ni actualización de UI.
6. Invitaciones, callback, Site URL/allowlist y SMTP de Auth; plan, protecciones y auto-deploy de Vercel no revalidados en este cierre.
7. Los seis SKIP UI históricos siguen omitidos; no cuentan como PASS. Windows/WSL y sesiones/dispositivos reales conservan sus limitaciones documentadas.
8. Completar sincronización del checkout original y limpieza física de su worktree histórico requiere escritura de sus metadatos Git. La evidencia y los cambios preexistentes están registrados en el archivo local, pero esa carpeta no está limpia.

## Alcance del cierre

**Dictamen final: APROBADO CON OBSERVACIONES.** Publicación exclusivamente documental en main desde la copia independiente y despliegue automático de Vercel expresamente autorizados. Sin repetición de pruebas, cambios funcionales, cambios en Supabase ni eliminación de datos ficticios. No declarar validación E2E integral ni limpieza de todos los directorios históricos. Ver [nota de publicación](validation/technical-close-20261127/PUBLICATION.md).

El estado anterior al cierre se conserva íntegro en el historial de [PROJECT_STATUS en 406a463](https://github.com/Merc-18/ticketera_procont/blob/406a46351411fdf845a73a811cb798b7964617b1/docs/PROJECT_STATUS.md). Los antiguos 17/17, 19/19 y 21/21 eran cortes históricos, superados por el inventario actual de 22 migraciones.
