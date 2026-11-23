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
