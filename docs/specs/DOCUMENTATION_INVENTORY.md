# Inventario individual de los 31 documentos anteriores

Revisión: **20/11/2026** · Código de referencia: **`c857a727c8e7640bbce8daada940f973acbf013e`**.

Fuente oficial de requisitos: [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md).

## Criterio de vigencia

Inventario de los **31 Markdown existentes en main de referencia**, antes de crear estas especificaciones. «Estado» clasifica el uso que debe hacerse del documento; no modifica las fechas ni resultados originales. ACTUAL significa que conserva contenido técnico aplicable, con estado operativo corregido al inicio. HISTÓRICO no se ejecuta como runbook actual. SUPERADO contiene un contrato de interfaz sustituido. REQUIERE ACTUALIZACIÓN conserva detalles pendientes de validación alojada.

Se leyó cada archivo, se registró su SHA-256 anterior y se contrastaron sus afirmaciones activas con las migraciones y consumidores. Las especificaciones nuevas no cuentan dentro de los 31. Los tres documentos reescritos conservan su contenido original con advertencia en `docs/history/`; enlaces relativos y espaciado Markdown se normalizaron, por lo que no son copias bit a bit. Los hashes de abajo corresponden al archivo original de la base.

| Documento | Propósito y contenido revisado | Vigencia / estado | Documento oficial relacionado |
|---|---|---|---|
| [CLAUDE.md](../../CLAUDE.md) | Reglas de colaboración y autoría de commits. Secciones: Commits | ACTUAL | [SECURITY_SPEC.md](SECURITY_SPEC.md) |
| [README.md](../../README.md) | Entrada al producto, instalación y mapa documental. Secciones: Tabla de contenidos; Funcionalidades; Gestión de solicitudes | ACTUAL | [TECHNICAL_ARCHITECTURE.md](TECHNICAL_ARCHITECTURE.md) |
| [docs/account-administration.md](../../docs/account-administration.md) | Provisión de cuentas y bootstrap M5. Secciones: Backend y permisos; Fallos entre Auth y PostgreSQL; Activación pendiente en Supabase | REQUIERE ACTUALIZACIÓN | [PERMISSIONS_SPEC.md](PERMISSIONS_SPEC.md) |
| [docs/areas.md](../../docs/areas.md) | Evolución inicial del catálogo de áreas M6. Secciones: Modelo y seguridad; Interfaz; Validación | SUPERADO | [DATABASE_SPEC.md](DATABASE_SPEC.md) |
| [docs/board-operations.md](../../docs/board-operations.md) | Contrato y reglas de operación M12. Secciones: Reglas implementadas; Contratos para Claude; Checklist, historial y evidencias | ACTUAL | [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md) |
| [docs/board-recovery.md](../../docs/board-recovery.md) | Rescate e integración de trabajo de Claude. Secciones: Rescate verificable; Comparación acotada y resultado; Correcciones concretas, sin reconstrucción | HISTÓRICO | [TESTING_SPEC.md](TESTING_SPEC.md) |
| [docs/board-ui.md](../../docs/board-ui.md) | Conexión frontend a operaciones M12. Secciones: Funciones del servidor conectadas; Caminos antiguos retirados; Pantallas adaptadas | ACTUAL | [TECHNICAL_ARCHITECTURE.md](TECHNICAL_ARCHITECTURE.md) |
| [docs/business-metrics.md](../../docs/business-metrics.md) | Contrato de métricas y cohortes M11. Secciones: Nombre y prioridades; Semántica de rendimiento; Contrato para Claude | ACTUAL | [METRICS_SPEC.md](METRICS_SPEC.md) |
| [docs/client-access-backend.md](../../docs/client-access-backend.md) | Diseño de sesiones y contratos M13. Secciones: Distinción de errores antes de activar; Entrega para Claude; Login de servidor y contratos de desarrollo | ACTUAL | [SECURITY_SPEC.md](SECURITY_SPEC.md) |
| [docs/client-login-development.md](../../docs/client-login-development.md) | Pruebas reales y arranque de proveedores de desarrollo. Secciones: Contratos confirmados; Cambio y validación de esta continuación; Integración localhost completada | HISTÓRICO | [API_CONTRACTS.md](API_CONTRACTS.md) |
| [docs/client-login-e2e.md](../../docs/client-login-e2e.md) | Dos tickets QA reales antes de M15. Secciones: Tickets conservados; Verificación; Cierre de la verificación (Claude Code, 19/11/2026) | HISTÓRICO | [TESTING_SPEC.md](TESTING_SPEC.md) |
| [docs/client-portal.md](../../docs/client-portal.md) | Recorrido y adaptadores del cliente. Secciones: Activación vigente; Rutas; Conexión con el contrato de Codex (`src/lib/client-portal.ts`) | ACTUAL | [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md) |
| [docs/conexion-cli-baseline.md](../../docs/conexion-cli-baseline.md) | Baseline y conectividad de la preparación inicial. Secciones: Estado vigente: baseline íntegro; aplicación autorizada pendiente; Antecedente del 17/11 (superado por la instrucción del 18/11); Copiar la evidencia existente sin volver a consultar Supabase | HISTÓRICO | [DEPLOYMENT_SPEC.md](DEPLOYMENT_SPEC.md) |
| [docs/deployment.md](../../docs/deployment.md) | Guía operativa de instalación/activación. Secciones: 1. Hosting recomendado; 2. Estado de los componentes; 3. Entorno de pruebas frente a clientes reales | ACTUAL | [DEPLOYMENT_SPEC.md](DEPLOYMENT_SPEC.md) |
| [docs/fase-1-saneamiento.md](../../docs/fase-1-saneamiento.md) | Separación de identidad y saneamiento inicial. Secciones: Referencia recuperable del estado inicial; Cambios realizados; Instalación y compilación | HISTÓRICO | [DECISION_LOG.md](DECISION_LOG.md) |
| [docs/fase-2a-supabase.md](../../docs/fase-2a-supabase.md) | Diseño inicial de esquema/RLS y recuperación. Secciones: Alcance y archivos; Esquema; Matriz de seguridad | HISTÓRICO | [DATABASE_SPEC.md](DATABASE_SPEC.md) |
| [docs/fase-2b1-integracion.md](../../docs/fase-2b1-integracion.md) | Primeros consumidores transaccionales y contratos. Secciones: Resultado y alcance; Consumidores modificados; Contratos consumidos | HISTÓRICO | [API_CONTRACTS.md](API_CONTRACTS.md) |
| [docs/fase-2b2-preparacion.md](../../docs/fase-2b2-preparacion.md) | Preparación de las primeras cuatro migraciones. Secciones: Estado; Configuración local completada; Orden obligatorio y dependencias | HISTÓRICO | [DATABASE_SPEC.md](DATABASE_SPEC.md) |
| [docs/fase-2b3-catalog-preflight.md](../../docs/fase-2b3-catalog-preflight.md) | Inventario inicial de catálogo remoto y compatibilidad. Secciones: Archivo y ejecución original (ya realizada; no repetir); Qué obtiene y qué evita; Cómo interpretar la compatibilidad | HISTÓRICO | [DATABASE_SPEC.md](DATABASE_SPEC.md) |
| [docs/fase-2b3a-preflight.md](../../docs/fase-2b3a-preflight.md) | Diagnóstico 401/conectividad inicial. Secciones: Resultado confirmado; Petición que produjo el 401; Evidencia nueva, acotada | HISTÓRICO | [DEPLOYMENT_SPEC.md](DEPLOYMENT_SPEC.md) |
| [docs/fase-2b3b-recovery-plan.md](../../docs/fase-2b3b-recovery-plan.md) | Compensaciones y recuperación M1–M4. Secciones: Resultado y alcance; Inventario completo del cambio; Captura inicial y comparación | HISTÓRICO | [DEPLOYMENT_SPEC.md](DEPLOYMENT_SPEC.md) |
| [docs/fase-2b3c-adaptacion-procont.md](../../docs/fase-2b3c-adaptacion-procont.md) | Decisiones organizacionales y desacoplamiento heredado. Secciones: Resultado; Revisión de las cuatro migraciones; Áreas: flexibilidad actual y límite | HISTÓRICO | [DECISION_LOG.md](DECISION_LOG.md) |
| [docs/fase-2b3d-resolucion-bloqueos.md](../../docs/fase-2b3d-resolucion-bloqueos.md) | Resolución de objetos administrados/CLI e integridad histórica. Secciones: Decisión; Evidencia remota recibida, sin repetir lecturas; 1. Auth sin compensación sobre objetos de otro propietario | HISTÓRICO | [DATABASE_SPEC.md](DATABASE_SPEC.md) |
| [docs/frontend-identidad-procont.md](../../docs/frontend-identidad-procont.md) | Marca y fuente de estilos de Procont. Secciones: Fuente y método; Paleta (fuente única: `src/theme/brand.ts`); Cambios de interfaz | ACTUAL | [TECHNICAL_ARCHITECTURE.md](TECHNICAL_ARCHITECTURE.md) |
| [docs/reports-ui.md](../../docs/reports-ui.md) | Paneles de urgencia y tiempos del servidor. Secciones: Cambios; Integración con Codex (rama `integration/business-metrics`); Verificación | ACTUAL | [METRICS_SPEC.md](METRICS_SPEC.md) |
| [docs/request-intake.md](../../docs/request-intake.md) | Evolución de recepción y validación M8/M9. Secciones: Cliente (`/request`); Adjuntos: compresión en el navegador; Validador (Requests → solicitud) | SUPERADO | [API_CONTRACTS.md](API_CONTRACTS.md) |
| [docs/request-tracking.md](../../docs/request-tracking.md) | Estados generales y seguimiento mínimo M10. Secciones: Estados generales (calculados y registrados en el servidor); Cliente (`/tracking`); Validador | ACTUAL | [API_CONTRACTS.md](API_CONTRACTS.md) |
| [docs/ticket-catalogs.md](../../docs/ticket-catalogs.md) | Catálogos iniciales, estudio y clasificación. Secciones: Catálogos (datos suministrados por Procont Business); Flujo; Administración y seguridad | ACTUAL | [DATABASE_SPEC.md](DATABASE_SPEC.md) |
| [docs/ticket-security.md](../../docs/ticket-security.md) | Reservas, cuotas y privacidad M9. Secciones: Adjuntos: autorización y límites; Integración con Claude, pendiente de revisión conjunta; Rechazo: mensaje público separado | ACTUAL | [SECURITY_SPEC.md](SECURITY_SPEC.md) |
| [docs/validation/client-flow-ui-20261119.md](../../docs/validation/client-flow-ui-20261119.md) | Corrección de navegación y exportación; pruebas de autor. Secciones: Cambios; Pruebas; Límites | HISTÓRICO | [TESTING_SPEC.md](TESTING_SPEC.md) |
| [supabase/README.md](../../supabase/README.md) | Entrada a migraciones y contratos de base. Secciones: Independencia organizacional — FASE 2B.3C; Administración de cuentas activa; Catálogo de áreas activo | ACTUAL | [DATABASE_SPEC.md](DATABASE_SPEC.md) |

## Integridad de la base documental

| Documento original | Líneas antes de revisión | SHA-256 en la base |
|---|---|---|
| `CLAUDE.md` | 5 | `c1d25dfce461e4219e7823870df91962ad42442831f357f0ec8ddedaa918f17d` |
| `README.md` | 315 | `50c0c1ac6f76e014c0c8d6dbfd46d3d03911dc37e479dac53a9b0d4cb3761684` |
| `docs/account-administration.md` | 164 | `9491ddc11753a9ee638618c965db13ebb4de02755c5e74762dcfa6bb880ef7b0` |
| `docs/areas.md` | 46 | `67e72a57ded5c7b34de520ca4232d4c48d088b53b0df82d94fcd0f573b3a76fa` |
| `docs/board-operations.md` | 188 | `b7439b8be9d3517264d9b037d548d3a608f9d60919d70193764e6ad51507deb1` |
| `docs/board-recovery.md` | 100 | `161a94a6a990ba6ba7f8d8e5648a08d4a8a60efc1f3a79fa84d90296ee1ce187` |
| `docs/board-ui.md` | 99 | `3e682896ac455f09d75386ccce7a928ed1c2837f4a59c67cd4a4880ca2f78053` |
| `docs/business-metrics.md` | 198 | `d657168c24754c649d299db7759db554f4e11020913cf5d63f94c43b6e94f465` |
| `docs/client-access-backend.md` | 357 | `ab33249f81bd259a6ee317d95ad4ac2a4d879e4413112b25b6886a70fc275d9a` |
| `docs/client-login-development.md` | 128 | `5d75075bd217f9e56b1db963719177b4ca958111cba9b7358e85e1b1e60a262e` |
| `docs/client-login-e2e.md` | 73 | `84233234e3625ed8e0a082e4574f9796296893a34e5b79687117eade137b2c44` |
| `docs/client-portal.md` | 104 | `7ee0c1b365235031af7a7810ca0fab45f829ca5d91fe2e8e789a8aafe00d0741` |
| `docs/conexion-cli-baseline.md` | 320 | `fb20a08a0090ff3ec4fd2ca1dfb2922c8713264a4da3062d160f019f248b691a` |
| `docs/deployment.md` | 192 | `b1826fc92eb8f166896bcd1ecd9adaafa6961ac4e2e0721950c62f7226604300` |
| `docs/fase-1-saneamiento.md` | 124 | `f6ef9824e3e9026e400ccca052966db4e3d59cb79c0401f9ddbe58e5c97b2c8f` |
| `docs/fase-2a-supabase.md` | 386 | `00fa35c10dcc1d0cf24448483c2b3ead0b0ff43ace2394d8b2821fd9f587d26e` |
| `docs/fase-2b1-integracion.md` | 336 | `820a14a1cab16068c43bc0bab97883dce7577f58f0362acee6ac227d7ee1c73e` |
| `docs/fase-2b2-preparacion.md` | 373 | `12ae32c3d5dec795c7cc6d339a938a99d86752625f52c2200d1a717f859d7842` |
| `docs/fase-2b3-catalog-preflight.md` | 157 | `06824d8346fe696765d8224a1f6f5c1f7c724100085f8504bb53c52586a1b323` |
| `docs/fase-2b3a-preflight.md` | 202 | `25447c4aa4b7233d8390da232bea385e5a6e2923ff3688bb38e7c178bd49e7ce` |
| `docs/fase-2b3b-recovery-plan.md` | 383 | `deaec1d932bc6d975fa1c32264095af4e00f8575fc06ca6eaa77456a904f7c49` |
| `docs/fase-2b3c-adaptacion-procont.md` | 202 | `c5debde50f957172dc1e69a0da87890ab752176bb599cce623c6c6c03d7f420e` |
| `docs/fase-2b3d-resolucion-bloqueos.md` | 280 | `8d985951ed98b277247c8fabdf3f0ea227ac1660e64c1ea0cdb523fd160ca554` |
| `docs/frontend-identidad-procont.md` | 70 | `fa326404d40893a098ab22a1bc5d74b65404ae1a51c68d87e4dd19ac7a468965` |
| `docs/reports-ui.md` | 51 | `982716b582fce6f5ff0743bc21a612e83cd679f7569788ebda31044724677ff3` |
| `docs/request-intake.md` | 90 | `a7c571399456bd42365b2ffd4c93409bc3fb992aaa26e99b142dc20ee381d1c3` |
| `docs/request-tracking.md` | 61 | `8613cf4149d82fa9948e2c15ccee342330b075f4316d4cbbeb80a9b544093f2f` |
| `docs/ticket-catalogs.md` | 63 | `37fe5a8eca691e79ad795031a4e4292fbd4338e660f97af5dba32de1f884248d` |
| `docs/ticket-security.md` | 200 | `55cebb429f016f9b251f154fbb484ebde01d3b4dbcf699917853cac38f9b3361` |
| `docs/validation/client-flow-ui-20261119.md` | 103 | `65e0148dbc7edcf612f8d1c930ecfdba19704a27492cd3c4bc74b5740291c7ae` |
| `supabase/README.md` | 103 | `126397a7ac88193b1e69f2844a95cb5353b071380944683d508ef561a0e56033` |
