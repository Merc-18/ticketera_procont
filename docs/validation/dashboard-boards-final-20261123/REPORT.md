# Dashboard, Boards y M17 — informe final de implementación local

Fecha: 23/11/2026 (America/Lima)
Repositorio: Merc-18/ticketera_procont
Rama: `dashboard-boards-20261123`
Base remota consultada: `origin/main@3ec665907bfc13dc64f17f7236c0dcb02bebf8f2`
Commit de Claude conservado: `5c6640ec390685cc097a51de42fddd679efa3731`

## Estado recuperado

Se continuó desde la rama y commit local existentes. El bundle original `.agent-backups/ticketera-dashboard-boards-20261123.bundle` coincide con el SHA-256 proporcionado y `git bundle verify` pasa. El commit 5c6640e queda como ancestro del trabajo final. No se reconstruyeron ni duplicaron sus seis ajustes. `origin/main` se leyó y seguía en la base esperada; no se encontró una base posterior.

Los seis cambios originales conservados son: reorganización de Dashboard; área visible para el código PROCONT en frontend; paleta de prioridad independiente; selección personal de color en Boards; prioridad solicitada sin checkbox de urgencia; y etiqueta «Acceso del equipo de TI».

## Implementación adicional local

### Áreas — código exacto PROCONT

M17 resuelve el código canónico desde `studio_codes`, asociado al UUID y estudio de la solicitud. Solo igualdad exacta `code='PROCONT'` permite clasificar/validar áreas. No se decide por nombre, prefijo, ID enviado desde React ni por el estudio BUSINESS ACCOMPANYING SAC completo.

ARAPA, DISFARMADENT, PROCONT_CUZ, PROCONT_OLICH y cualquier otro código distinto no persisten nuevas áreas/subáreas. Se limpian asociaciones cuando se cambia desde PROCONT a un código excluido. Los flujos legacy Planner y creación interna ignoran área; las RPC no aceptan inyección nueva desde detalle. Los registros históricos no se reescriben ni reasignan. PROCONT exige una raíz activa del catálogo cuando ese catálogo tiene áreas configuradas; área ajena/inactiva y subárea que no pertenece a esa área se rechazan.

Funciones reemplazadas conservan sus firmas y controles existentes: `guard_request_classification`, `classify_request`, `assign_request_studio_code`, `submit_request`, `submit_classified_request`, `board_creation_payload`, `create_internal_project`, `update_request_details`. No se alteraron migraciones M1–M16b.

### Color personal persistente

M17 crea `internal_card_color_catalog` en `app_private` y `public.internal_card_preferences(user_id,color_id,updated_at)`. Solo guarda el UUID real de usuario, ID estable del color y fecha. Se conservan exactamente los seis colores preexistentes en Light/Dark (los mismos HEX) y se amplían a 24 identificadores tonales derivados; no se aceptan HEX arbitrarios. Kanban y Tabla obtienen asignaciones desde la misma fuente Supabase; no hay preferencia persistente en `localStorage` ni uso de Realtime.

La restricción UNIQUE por `color_id`, transacción, bloqueo de tabla y validación del servidor impiden que dos usuarios obtengan simultáneamente un color. `internal_card_colors()` devuelve catálogo y asignaciones del equipo; `set_my_internal_card_color(p_color_id)` solo modifica el actor `auth.uid()`. Ambas RPC requieren perfil interno activo con `superadmin`, `admin`, `developer` o `viewer`; clientes y anon son rechazados. El trigger asigna color al activar un perfil y lo libera al desactivarlo.

Capacidad catalogada: 24 perfiles activos con color distinto. El contraste WCAG de cada tono frente a la superficie Light/Dark está en `color-contrast.json`; los tonos claros de identificación son decorativos y redundantes al nombre/iniciales, y los swatches, franjas y anillos incorporan contorno de alto contraste. El número actual de perfiles activos en Supabase remoto no pudo verificarse, por lo que la suficiencia de capacidad para el equipo real es **NO VERIFICADA**; debe confirmarse antes de aplicar M17. Si supera 24, la migración rechazará la asignación sobrante y habrá que ampliar catálogo/CSS en otra revisión local antes de aplicar.

### Dashboard, Boards y formulario

Se conservan la separación Solicitudes/Trabajo, Tiempos, prioridad del trabajo, carga por responsable, urgencia actual frente al histórico, vistas Kanban/Tabla/Gantt/Roadmap y prioridad visual Urgente rojo/Alto dorado/Medio azul/Bajo neutro. Áreas del Dashboard y filtro quedan limitados al código exacto PROCONT. El filtro de periodo está rotulado para resultados de solicitudes y Cycle/Lead Time; no se presenta como global para trabajo actual. La prioridad solicitada Medio y sus cuatro opciones se mantienen separadas de `urgent_requested` y de la prioridad administrativa. El cambio de texto de acceso TI permanece.

## Migración M17

Archivo: `supabase/migrations/20261123000300_internal_area_scope_and_card_preferences.sql`

SHA-256: `b5836823e9e9d4234a05007e8ca19ba636102d200348bc0cbbee7050bacd9b32`

M17 es transaccional/aditiva y no contiene DML que modifique tickets históricos. Fue aplicada en instalación limpia M1–M17 y upgrade con históricos, incluyendo prueba de rollback dentro de transacción en PostgreSQL 17 desechable. M1–M16b permanecen intactas. Se conservan 82 imágenes históricas originales de antes/después; la galería final de build contiene 135 capturas (desktop 1440: 40, laptop 1366: 28, tablet 768: 28, móvil 390: 39), todas con versión única `202611231858`; incluye dos capturas del modal de área PROCONT/ARAPA. Las capturas del build final están marcadas como entorno local con servicios simulados; no contienen datos remotos.

## Validación local

| Comprobación | Resultado | Naturaleza |
|---|---:|---|
| PostgreSQL clean M1–M17 | 25 grupos PASS | PostgreSQL 17 local real; Auth/Storage simulados |
| PostgreSQL upgrade M15→M16→M16b→M17 | 29 grupos PASS | PostgreSQL 17 local real; fixture histórico Administrative preservado |
| Node | 173/173 PASS | Suite local de Node; servicios simulados donde corresponde |
| UI focalizada color personal | 2/2 PASS | React/Chromium, simulador Supabase, Light/Dark |
| UI completa | 91 PASS, 0 FAIL, 6 omitidas | `npm run test:ui` con React/Chromium y fixtures locales. Planner ahora verifica que no ofrece ni envía área. |
| Suite de galería final | 37/37 PASS | Build de producción local + Chromium; 135 capturas, cuatro tamaños, todos con `Versión 202611231858`, cero solicitudes externas. |
| Contraste PROCONT/excluido | 1/1 PASS | Capturas adicionales de modal con área (PROCONT) y sin área (ARAPA), mismo estudio fixture; dos imágenes añadidas a la galería. |
| TypeScript y build | PASS | `npm run build`; Vite emitió bundles, advertencia no bloqueante de Browserslist desactualizado |
| `git diff --check` | PASS | Sin errores de whitespace |

La primera ejecución completa de UI tuvo un fallo en el test Planner: seguía buscando el selector `CONTABILIDAD`, incompatible con el contrato M17. Se corrigió exclusivamente la expectativa de la prueba para exigir que Planner no muestre ni envíe `requester_area`; el caso pasó individualmente y la suite completa posterior dio 91/0/6 (97 totales, seis skips explícitos). La primera exportación de galería también detectó una solicitud `motion.js` cancelada por navegación rápida, que el loader maneja mediante fallback; el probe ahora distingue cancelación de error HTTP y la corrida completa de galería dio 37/37. Los errores reales de recursos siguen fallando el test. No se cambió el flujo funcional de Planner ni el loader.

Pruebas PostgreSQL son locales, no equivalen a Supabase hospedado. Las pruebas UI usan React y Chromium reales, pero servicios simulados; no prueban sesión Supabase ni despliegue.

## Estado remoto y activación

El entorno no tiene cliente/credenciales de Supabase ni de Vercel ni herramientas MCP conectadas a esos servicios. Por ello no se pudo verificar ahora el proyecto remoto, las 17 migraciones, ausencia de M17, cantidad real de miembros, ni configuración/versión de Vercel. La capacidad actual del catálogo es 24 colores; el conteo real de perfiles activos debe cotejarse antes del dry-run para evitar que el backfill exceda esa capacidad. No se ejecutaron SQL remotos, no se aplicó M17, no se hizo push, no se integró a `main` ni hubo despliegue. GitHub `origin/main` se mantuvo legible en `3ec6659`; autenticación GitHub disponible no concede acceso a Supabase o Vercel.

**No publicar frontend dependiente de M17 antes de verificar el proyecto Supabase exacto, confirmar M16b como última migración, comprobar capacidad de color, aplicar exclusivamente M17 y verificar ACL/RLS/RPC.** Después, se requiere commit local, bundle final verificable y publicación ordenada, seguida de revisión del deployment Vercel Production. La autorización del usuario existe, pero el acceso de ejecución falta.

Estado final local: **implementación y pruebas locales aprobadas con observaciones; activación remota bloqueada/no ejecutada**. No se declara producción lista.
