# Ticketera Procont

Mesa de solicitudes de Procont Business: recepción autenticada de clientes Quipu/QuipuFac, validación interna, trabajo Development de ocho fases, historial, evidencias y métricas basadas en eventos.

Los tickets no vencen: su antigüedad se calcula desde la creación en tablero con días civiles de Lima. Las tarjetas compactas muestran Producto → Subproducto → Proyecto; portafolio y otros metadatos siguen disponibles en el detalle y la administración, con relaciones reales y datos independientes por ticket. Avatares sin nombres visibles (tooltip/aria-label completos), edad Hoy/1d/Nd, checklist de 30 px y selección explícita sin checkbox conservan acciones masivas. [Refinamiento visual y evidencia](docs/validation/card-refinement-20261127/REPORT.md).

Revisión: **27/11/2026** · Base funcional: **`406a46351411fdf845a73a811cb798b7964617b1`** · **22 migraciones** confirmadas · Vercel **SUCCESS** para ese commit.

La **única fuente oficial de requisitos funcionales aprobados** es [PRODUCT_REQUIREMENTS.md](docs/specs/PRODUCT_REQUIREMENTS.md). Comenzar por [PROJECT_STATUS](docs/PROJECT_STATUS.md) y el [cierre técnico](docs/validation/technical-close-20261127/REPORT.md). Se incorporaron **17 PASS externos de ChatGPT** de SQL/RPC en producción con BEGIN/ROLLBACK; no son pruebas E2E ni ejecuciones de Codex. Permanecen pendientes proveedores reales, UI con roles activos, binarios mediante reservas y recepción E2E de eventos Realtime.

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
| Modelo y 22 migraciones | [DATABASE_SPEC](docs/specs/DATABASE_SPEC.md) |
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

El historial de Supabase al 27/11/2026 contiene **22 migraciones**, incluida `20261126231933_realtime_requests_postgres_changes`. [Manifiesto contrastado](docs/validation/technical-close-20261127/supabase-migrations.json). La configuración RLS/Realtime reportada por ChatGPT se distingue de pruebas de entrega de eventos.

El cierre conserva los datos ficticios y reales existentes. No reejecuta pruebas aprobadas ni modifica producción. El cierre documental se publica desde la copia independiente mediante push normal a main, con despliegue automático Vercel expresamente autorizado. Dictamen: **APROBADO CON OBSERVACIONES**. `.git` del checkout original sigue montado como solo lectura; esa carpeta y sus archivos se conservan sin forzar sincronización. [Estado y límites de Git](docs/validation/technical-close-20261127/REPORT.md#git-ramas-y-material-local).

Antecedente del README anterior conservado en [docs/history](docs/history/README-before-specs-20261120.md), con sus fechas y contexto. No usar informes de preparación como estado actual.
