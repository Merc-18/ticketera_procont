# Estado operativo — Ticketera Procont

Revisión: **23/11/2026** · Código de producción: **`2f9ab74aff3d612951596986490b5641a27f3932`** (tag `ticketera-production-20261123`). [Release de producción](validation/production-release-20261123/REPORT.md). Estado del 20/11 conservado en el historial git.

[Requisitos oficiales](specs/PRODUCT_REQUIREMENTS.md) · [Especificaciones](specs/README.md) · [Evidencia y procedencia](specs/EVIDENCE_20261120.md).

| Área | Estado conocido y alcance |
|---|---|
| Código | `main` es la única rama remota. PR #1 (UX/UI), #2 (Codex 1 M16 + Codex 2 experiencia del cliente + M16b) y #3 (documentación) integrados con merges normales; el historial de cada agente sigue alcanzable. |
| Web | https://ticketera-procont.vercel.app; Production Branch main (inferida); **Versión 202611231105** para el código de `2f9ab74`; los commits solo de documentación generan otra cadena con el mismo código. Ingreso Quipu/QuipuFac habilitado (comprobado en navegador, sin credenciales). |
| Entorno | Piloto público expresamente autorizado con **APIs de desarrollo** Quipu/QuipuFac; producción externa no confirmada. |
| Supabase | ticketera-procont, **xsxdpaiivklqeudgqoqf**, ACTIVE_HEALTHY; único proyecto autorizado. |
| Migraciones | **17/17**: M16 y M16b aplicadas el 23/11/2026 15:55 UTC; postchecks OK; 107/107 funciones idénticas a la instalación probada. |
| Edge | GET actual: **client-login v3**, **admin-users v4**, ambas ACTIVE; reporte anterior client-login v2 superado. |
| M15 | Aplicada una vez; creador antiguo cerrado para PUBLIC/anon/authenticated/service_role; dos RPC internas exigen editor activo antes de idempotencia. M13/M14 conservados. |
| Logins | Ambos funcionaban en dominio oficial según confirmación del usuario previa a M15; no repetidos ni nuevas contraseñas solicitadas. |
| Datos | 4 solicitudes históricas conservadas (campos M16 en NULL, 1 urgente); 3 tickets de clientes (1 Quipu, 2 QuipuFac) visibles para su dueño, pendientes y sin subproyecto. |
| Seguridad | RPC de cliente sin sesión → 401 PT401 (`client_subprojects` incluida); `submit_client_request` → 42501; tablas no legibles directamente; seguimiento público solo REQ y estado. |
| Plan | Hobby gratuito elegido por usuario; estado de facturación/protección Preview/auto-deploy NO VERIFICADO en panel. |
| Auth interno | GET aún Site URL localhost:3000 y allowlist vacía; invitaciones/callback/SMTP pendientes. |

## Pendientes que impiden afirmar validación completa

- **NO VERIFICADO en producción post-M16/M16b:** login real, creación autenticada por ambos proveedores, Mis tickets con sesión, detalle propio/ajeno, adjuntos reales, bandeja interna y modal con sesión de personal, y logout. Las reglas están probadas en local sobre el mismo código SQL; falta una prueba real autorizada.
- No había sesiones QA activas ni administrativas reutilizables en evidencia M15; no pedir contraseñas de nuevo ni sustituir admin con clave técnica. No existe almacén cifrado QA reutilizable acreditado.
- Contratos/URLs oficiales de producción del proveedor pendientes antes de abandonar piloto; no cambiar las API de desarrollo autorizadas sin nueva decisión.
- Exportación sin snapshot transaccional único; riesgo preventivo si cambia el RUC de estudio asociado explícitamente. (Mis tickets ya pagina en el servidor, de 50 en 50.)
- Tolerancia de M16b para el frontend anterior: retirarla con una migración futura cuando no quede tráfico antiguo (consulta en `docs/validation/m16b-preparation-20261123/m16b-postcheck.sql`).
- 3 solicitudes de clientes históricas pendientes sin subproyecto: el personal debe clasificarlas antes de aprobar (trigger existente).

No declarar producción completamente validada. En la activación del 23/11 no se crearon solicitudes ni se cambiaron Edge, variables de Vercel, CORS ni secretos. [Pruebas por clase y ejecución](specs/TESTING_SPEC.md), [roles](specs/PERMISSIONS_SPEC.md), [operación y contingencia](specs/DEPLOYMENT_SPEC.md).

## Extensión dashboard/boards M17 — estado de esta rama

La rama `dashboard-boards-20261123` conserva el commit de Claude `5c6640ec390685cc097a51de42fddd679efa3731` y añade M17, preferencias compartidas, alcance exacto de áreas y validaciones locales. `origin/main` se verificó por lectura en `3ec665907bfc13dc64f17f7236c0dcb02bebf8f2`. M17 SQL y pruebas pasaron en PostgreSQL 17 desechable, escenarios limpio y upgrade. **No se pudo consultar ni modificar Supabase remoto; no afirmar 18/18 aplicado. No hubo push, cambios Vercel ni despliegue.** Vercel Production y versión nueva: NO VERIFICADOS.

- Áreas: backend y frontend limitan áreas nuevas al código exacto PROCONT; otros códigos limpian/ignoran nuevos valores, históricos preservados.
- Color de responsable: persistencia compartida en Supabase diseñada en M17; no disponible en remoto mientras M17 no se aplique. Build local usa el contrato nuevo.
- Pruebas locales: PostgreSQL M17 clean/upgrade PASS, Node 173/173 PASS; UI focalizada color 2/2 PASS; UI completa 91 PASS, 0 FAIL, 6 omitidas; TypeScript/build PASS.
- Bloqueo de publicación: falta acceso efectivo a Supabase para comprobar 17/17, ejecutar dry-run/aplicar únicamente M17 y verificar 18/18; además verificar Vercel Production tras push. No aplicar frontend dependiente de M17 antes de su migración.

## M18 local — paleta de 10 colores y plantillas de checklist (24/11/2026)

- `main` publicado: `485e449` (Kanban por etapas y adjuntos, versión 202611241130). Historial remoto informado por el usuario: **18 migraciones (M1–M17)**.
- Rama local `local/boards-dashboard-checklists-20261124`: `30d00e3` (paleta de 10 en el frontend, Boards sin Área, Tickets por estudio, checklist por fase) más el commit de M18. **Sin push.**
- M18 (`20261124000100_limit_card_colors_and_seed_missing_checklists.sql`): preparada y probada en PostgreSQL 17 local (clean y upgrade). **No aplicada en remoto; requiere autorización.** Aplicar M18 antes de publicar el frontend `30d00e3`+ no es obligatorio (el frontend es compatible con y sin M18), pero sin M18 la autoasignación puede entregar colores retirados.
- Pendiente de producción: autorizar `db push --dry-run` / aplicación única de M18, verificar 19/19, publicar el frontend y comprobar Vercel.
- Fuera de alcance por ahora: jerarquía de proyectos largos (D-054) y el límite de 1.000 solicitudes de los KPI del Dashboard.

## Estado 24/11/2026 (tarde) — M18 en producción y lote M19

- M18 **aplicada** en producción (19/19) y `main` `2382b36` publicado (versión 202611241452). Las menciones anteriores de «M18 no aplicada» quedan superadas.
- Lote M19 (checklist sugerido de 3 tareas por fase, tarjetas con tinte personal, avatar y semáforo, Portafolio fase 1 y alta interna con paridad): ver `docs/validation/m19-portfolio-checklists-cards-20261124/REPORT.md` para el estado de publicación.
# Enmienda local 24/11/2026 — Dashboard/Equipo/Portafolio

Worktree aislado desde `16064c5c096f3b69943a81a0d1c64fef5ae8e5f0`. Cambios locales: Dashboard con todos los registros paginados/verificados; Equipo con Usuarios, carga y Portafolios; M20 para confirmación con asociación atómica; tarjetas y checklist con progreso semántico. Node 209/209, UI 129/135 (seis skip, cero fallos), TypeScript/build PASS; capturas ficticias locales disponibles en `validation/dashboard-team-portfolio-progress-20261124/`.

**Estado de publicación al escribir esta enmienda:** M20 aplicada en Supabase (21/21) y ACL comprobadas; código aún no integrado/push y Vercel aún pendiente. No se crearon tickets de producción. El informe completo es [REPORT.md](validation/dashboard-team-portfolio-progress-20261124/REPORT.md). No confundir evidencias de fixtures con verificaciones de Supabase/Vercel.
