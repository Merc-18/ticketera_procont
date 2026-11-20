# Índice de especificaciones — Ticketera Procont

Revisión: **20/11/2026** · Código de referencia: **`c857a727c8e7640bbce8daada940f973acbf013e`**.

Fuente oficial de requisitos: [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md).

## Empezar aquí

Leer [estado actual](../PROJECT_STATUS.md), requisitos, arquitectura y el flujo que se desea cambiar. Antes de implementar: encontrar su ID en trazabilidad, revisar permisos/SQL y la clase de prueba. Antes de operar: runbook y autorización. Un PASS local no elimina pendientes remotos.

| Documento | Uso |
|---|---|
| [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md) | Fuente oficial de 85 requisitos, estados y aceptación. |
| [TECHNICAL_ARCHITECTURE.md](TECHNICAL_ARCHITECTURE.md) | Stack, rutas, adaptadores y diez diagramas de arquitectura/flujo. |
| [WORKFLOWS_SPEC.md](WORKFLOWS_SPEC.md) | Operación funcional detallada de solicitudes y tablero. |
| [API_CONTRACTS.md](API_CONTRACTS.md) | HTTP, RPC, sesiones, proveedores parciales y errores. |
| [client-login.openapi.yaml](client-login.openapi.yaml) | OpenAPI 3.1 solo del endpoint propio. |
| [DATABASE_SPEC.md](DATABASE_SPEC.md) | Modelo, 15 migraciones, tablas y catálogo de funciones públicas. |
| [PERMISSIONS_SPEC.md](PERMISSIONS_SPEC.md) | Matriz de seis audiencias y capas UI/RPC/RLS/Edge. |
| [SECURITY_SPEC.md](SECURITY_SPEC.md) | Capacidades, hashes, CORS, M14/M15 y límites de confianza. |
| [METRICS_SPEC.md](METRICS_SPEC.md) | Cycle/Lead, cohortes, nulls, urgencias y exportación. |
| [DEPLOYMENT_SPEC.md](DEPLOYMENT_SPEC.md) | Instalación, variables, activación controlada, diagnóstico y contingencia. |
| [TESTING_SPEC.md](TESTING_SPEC.md) | Clases A–G, ejecuciones separadas, comandos y pendientes. |
| [DECISION_LOG.md](DECISION_LOG.md) | 29 decisiones con sustituciones, fechas conocidas y límites. |
| [TRACEABILITY_MATRIX.md](TRACEABILITY_MATRIX.md) | Un registro por cada requisito, pruebas y evidencia. |
| [DOCUMENTATION_INVENTORY.md](DOCUMENTATION_INVENTORY.md) | 31 Markdown originales, vigencia y hashes de base. |
| [CODE_INVENTORY.md](CODE_INVENTORY.md) | 345 archivos de base, 227 de código/config y 55 JSON. |
| [EVIDENCE_20261120.md](EVIDENCE_20261120.md) | Evidencia depurada de activación y GET actual, sin secretos. |
| [DOCUMENTATION_VALIDATION.md](DOCUMENTATION_VALIDATION.md) | Comprobaciones de documentación y árbol de aplicación idéntico. |

## Política documental

Fecha y commit en cada especificación; estados del maestro y trazabilidad deben coincidir. No cambiar fechas de informes antiguos ni sumarlos como una ejecución. Actualizar PROJECT_STATUS al cambiar estado operativo con evidencia suficiente; snapshots de evidencia conservan fecha. Todos los ejemplos de secretos son placeholders; no copiar valores reales a documentación. `docs/history` conserva material sustituido y no es un runbook actual.
