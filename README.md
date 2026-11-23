# Ticketera Procont

Mesa de solicitudes de Procont Business: recepción autenticada de clientes Quipu/QuipuFac, validación interna, trabajo Development de ocho fases, historial, evidencias y métricas basadas en eventos.

Revisión: **23/11/2026** · Código de producción: **`2f9ab74aff3d612951596986490b5641a27f3932`** (tag `ticketera-production-20261123`, [release](docs/validation/production-release-20261123/REPORT.md)). Revisión anterior: 20/11/2026 sobre `c857a72`.

La **única fuente oficial de requisitos funcionales aprobados** es [PRODUCT_REQUIREMENTS.md](docs/specs/PRODUCT_REQUIREMENTS.md). Comenzar por [PROJECT_STATUS](docs/PROJECT_STATUS.md): el sistema está en piloto público con APIs de desarrollo autorizadas, M1–M15 aplicadas y comprobaciones autenticadas post-M15 aún pendientes.

## Recorridos

- `/portal` → Nueva Solicitud → `/cliente` → Quipu (RUC, usuario, contraseña) o QuipuFac (RUC, contraseña) → Nuevo ticket.
- Mis tickets requiere sesión y filtra la identidad; el mismo RUC no mezcla Quipu individual y QuipuFac empresarial.
- `/tracking` es público: solo REQ y estado. `/request` redirige al ingreso, sin creación anónima.
- Personal: modal independiente o `/login`, Supabase Auth y perfil activo; Requests → clasificación/decisión → Development.
- Nuevo trabajo: Backlog → Analysis → Design → Development → Code Review → Testing → Deploy → Done. Históricos Administrative/Dual se conservan; sin política SLA oficial.

## Documentación para continuar el proyecto

| Necesidad | Documento |
|---|---|
| Requisitos, reglas y aceptación | [PRODUCT_REQUIREMENTS](docs/specs/PRODUCT_REQUIREMENTS.md) |
| Mapa completo de especificaciones | [Índice](docs/specs/README.md) |
| Arquitectura, rutas y diez diagramas | [TECHNICAL_ARCHITECTURE](docs/specs/TECHNICAL_ARCHITECTURE.md) |
| Login, RPC y OpenAPI | [API_CONTRACTS](docs/specs/API_CONTRACTS.md), [OpenAPI](docs/specs/client-login.openapi.yaml) |
| Modelo y quince migraciones | [DATABASE_SPEC](docs/specs/DATABASE_SPEC.md) |
| Roles / seguridad / sesiones | [PERMISSIONS_SPEC](docs/specs/PERMISSIONS_SPEC.md), [SECURITY_SPEC](docs/specs/SECURITY_SPEC.md) |
| Operación del producto | [WORKFLOWS_SPEC](docs/specs/WORKFLOWS_SPEC.md) |
| Métricas y exportación | [METRICS_SPEC](docs/specs/METRICS_SPEC.md) |
| Instalar, desplegar y diagnosticar | [DEPLOYMENT_SPEC](docs/specs/DEPLOYMENT_SPEC.md) |
| Pruebas y pendientes reales | [TESTING_SPEC](docs/specs/TESTING_SPEC.md) |
| Decisiones y trazabilidad | [DECISION_LOG](docs/specs/DECISION_LOG.md), [TRACEABILITY_MATRIX](docs/specs/TRACEABILITY_MATRIX.md) |
| 31 documentos anteriores / código | [DOCUMENTATION_INVENTORY](docs/specs/DOCUMENTATION_INVENTORY.md), [CODE_INVENTORY](docs/specs/CODE_INVENTORY.md) |

## Desarrollo y pruebas

React 18, TypeScript, Vite 5, Tailwind, Supabase/PostgreSQL 17, Deno Edge y Storage privado. No hay backend Node productivo propio. Usar lockfile y una copia aislada.

```bash
npm ci
cp .env.example .env.local
npm run dev -- --host 127.0.0.1
```

Completar solo URL y clave **pública** del proyecto autorizado en .env.local. Nunca clave privada de servidor en VITE_*. El frontend usa 5173. No ejecutar SQL de raíz, seeds, bootstrap ni activadores históricos como instalación general. [Procedimiento y variables](docs/specs/DEPLOYMENT_SPEC.md).

```bash
node --test tests/*.test.mjs
CHROMIUM_EXECUTABLE=/ruta/a/chromium npm run test:ui
npm run build
```

Node validado 26.8.2 para tests con imports TypeScript; Chromium se provee por ruta, no se descarga implícitamente. El arnés UI usa servicios simulados y no acredita Supabase alojado. Las suites PostgreSQL y tipado de contratos tienen comandos propios en [TESTING_SPEC](docs/specs/TESTING_SPEC.md). No se ejecutaron suites de producto para modificar solo documentación.

## Estado de seguridad

M15 revoca creación antigua, conserva M13 por llamada interna y exige perfil activo para las RPC del importador. No revertir a frontend anónimo ni reabrir grants. Cuatro adjuntos / 2.500.000 bytes combinados y bucket privado. Los tokens de proveedor se descartan; Ticketera usa su propia sesión.

M16 y M16b (23/11/2026) añaden aislamiento Quipu por username exacto, cuenta empresarial QuipuFac por RUC, prioridad solicitada (Bajo/Medio/Alto/Urgente) y subproyectos validados en servidor; M16b mantiene compatible el frontend anterior. Historial remoto 17/17.

La web muestra versión fija de build en Lima: **Versión 202611231105** para el código de producción (los commits solo de documentación generan otra cadena). Una etiqueta no demuestra por sí sola el SHA servido. La operación funcional con sesiones reales de clientes y personal sigue NO VERIFICADA en producción: [release](docs/validation/production-release-20261123/REPORT.md), [evidencia anterior](docs/specs/EVIDENCE_20261120.md).

Antecedente del README anterior conservado en [docs/history](docs/history/README-before-specs-20261120.md), con sus fechas y contexto. No usar informes de preparación como estado actual.
