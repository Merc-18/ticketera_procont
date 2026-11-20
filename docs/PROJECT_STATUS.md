# Estado operativo — Ticketera Procont

Revisión: **20/11/2026** · Código: **`c857a727c8e7640bbce8daada940f973acbf013e`**.

[Requisitos oficiales](specs/PRODUCT_REQUIREMENTS.md) · [Especificaciones](specs/README.md) · [Evidencia y procedencia](specs/EVIDENCE_20261120.md).

| Área | Estado conocido y alcance |
|---|---|
| Código | main local/remoto c857a72 confirmado; esta rama solo documentación, sin publicación. |
| Web | https://ticketera-procont.vercel.app; HTTP 200; **Versión 202611191900**; login compilado habilitado. |
| Entorno | Piloto público expresamente autorizado con **APIs de desarrollo** Quipu/QuipuFac; producción externa no confirmada. |
| Supabase | ticketera-procont, **xsxdpaiivklqeudgqoqf**, ACTIVE_HEALTHY; único proyecto autorizado. |
| Migraciones | **15/15** según evidencia de activación del 20/11; no se ejecutó SQL para esta revisión. |
| Edge | GET actual: **client-login v3**, **admin-users v4**, ambas ACTIVE; reporte anterior client-login v2 superado. |
| M15 | Aplicada una vez; creador antiguo cerrado para PUBLIC/anon/authenticated/service_role; dos RPC internas exigen editor activo antes de idempotencia. M13/M14 conservados. |
| Logins | Ambos funcionaban en dominio oficial según confirmación del usuario previa a M15; no repetidos ni nuevas contraseñas solicitadas. |
| QA existentes | REQ26-002 Quipu y REQ26-003 Quipu_Fac; BUSINESS ACCOMPANYING SAC; identidades distintas, pending, huella sin cambios. |
| Público | Seguimiento posterior a M15 devuelve solo REQ y received; negativas sin sesión rechazan RPC de creación. |
| Plan | Hobby gratuito elegido por usuario; estado de facturación/protección Preview/auto-deploy NO VERIFICADO en panel. |
| Auth interno | GET aún Site URL localhost:3000 y allowlist vacía; invitaciones/callback/SMTP pendientes. |

## Pendientes que impiden afirmar validación completa

- **NO VERIFICADO post-M15:** creación autenticada exitosa por ambos proveedores, Mis tickets con sesiones activas, detalle ajeno, subida/lectura real de adjuntos, bandeja interna visual y logout.
- No había sesiones QA activas ni administrativas reutilizables en evidencia M15; no pedir contraseñas de nuevo ni sustituir admin con clave técnica. No existe almacén cifrado QA reutilizable acreditado.
- Contratos/URLs oficiales de producción del proveedor pendientes antes de abandonar piloto; no cambiar las API de desarrollo autorizadas sin nueva decisión.
- Exportación sin snapshot transaccional único; UI Mis tickets solo primer lote de 100; riesgo preventivo si cambia el RUC de estudio asociado explícitamente.

No declarar producción completamente validada. No hay nuevas solicitudes en esta tarea ni cambios de aplicación, SQL, Edge, Vercel o secretos. [Pruebas por clase y ejecución](specs/TESTING_SPEC.md), [roles](specs/PERMISSIONS_SPEC.md), [operación y contingencia](specs/DEPLOYMENT_SPEC.md).
