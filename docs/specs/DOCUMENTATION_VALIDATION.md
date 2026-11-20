# Validación documental y entrega

Revisión: **20/11/2026** · Código base: **`c857a727c8e7640bbce8daada940f973acbf013e`**.

Fuente oficial: [PRODUCT_REQUIREMENTS](PRODUCT_REQUIREMENTS.md). Rama local: `docs/ticketera-complete-documentation`; worktree aislado en `/tmp/ticketera-documentation-20261120/worktree`. El hash de commit de esta entrega se obtiene con `git rev-parse HEAD`: no se incluye un hash circular del propio archivo. No se hizo merge ni push.

## Resultado y cobertura

| Comprobación ejecutada | Resultado y límite |
|---|---|
| Inventario de base | 31 Markdown revisados individualmente, 345 archivos versionados, 227 código/configuración, 55 JSON de validación. |
| Markdown / CommonMark | 52 archivos parseados; bloques y encabezados comprobados; sin errores finales. |
| Markdownlint | 52 archivos; 0 errores bajo perfil explícito de espaciado, encabezados, fences y listas. No aplica límite arbitrario de 80 caracteres a tablas. |
| Enlaces | Todos los enlaces locales existentes y anchors, incluso fuentes con #L; resultados finales en sección siguiente. URLs externas inventariadas, no comprobadas con solicitudes. |
| Trazabilidad | 85 IDs únicos, 85 filas correspondientes y estados idénticos al maestro; campos requeridos presentes. |
| SQL / consistencia | 15 nombres/hashes comparados con base y evidencia conservada; M14 10/50/2000/15min, fases y duraciones contrastadas estáticamente. **Ningún SQL ejecutado**. |
| Mermaid | 11/11 diagramas aceptados por parser Mermaid 11.12.0, con DOM jsdom 26.1.0; diez de arquitectura/flujos más ER. Validación sintáctica, no captura visual de cada renderer. |
| OpenAPI | openapi-spec-validator 0.7.2 acepta OpenAPI 3.1; 13 esquemas. JSON Schema Draft 2020-12 acepta cinco cuerpos ficticios válidos y rechaza seis inválidos. Sin llamadas HTTP de login. |
| Consistencia documental | 91 comprobaciones de constantes/referencias/preservación, PASS. |
| Integridad de aplicación | **314 archivos no Markdown preexistentes idénticos byte a byte** a la base; incluye código, SQL, Edge, pruebas, JSON, lockfile/configuración. Único archivo nuevo no Markdown: OpenAPI documental. |
| Credenciales | Sin contraseñas/tokens/valores de claves privadas añadidos; solo nombres de configuración. No ejecutar credentials.py ni pedir claves QA. |
| Servicios | Solo GET de proyecto/funciones/configuración Auth no secreta y frontend; sin SQL, tickets, cambios Auth/Vercel, despliegues ni variables. |

Los resultados 226/156/29, 159/31 y 171/50 son históricos del documento de pruebas; **no son nuevas ejecuciones durante documentación**. No se ejecutó build de aplicación porque ningún archivo que lo alimenta cambió. No se ocultan sus pendientes post-M15.

## Enlaces y consistencia finales

**52 Markdown, 1906 enlaces internos y 85 requisitos: sin errores.** Las 44 referencias externas no se validaron por HTTP. Las 15 migraciones y los 55 JSON históricos permanecen sin cambios.

## Herramientas y reproducción

Herramientas instaladas únicamente en `/tmp` para esta revisión: markdownlint-cli2 0.18.1, markdownlint 0.38.0, Mermaid 11.12.0, jsdom 26.1.0, openapi-spec-validator 0.7.2, jsonschema y markdown-it-py. No se añadieron dependencias al package.json/lockfile.

Perfil Markdownlint reproducido (crear configuración temporal con extensión `.markdownlint-cli2.jsonc`):

```json
{"config":{"default":false,"MD009":true,"MD010":true,"MD011":true,"MD018":true,"MD019":true,"MD022":true,"MD023":true,"MD031":true,"MD032":true},"globs":["**/*.md"]}
```

```bash
# Desde una copia aislada, con herramientas disponibles fuera del árbol de aplicación:
markdownlint-cli2 --config /ruta/review.markdownlint-cli2.jsonc
python3 - <<'PYCODE'
from pathlib import Path
import yaml
from openapi_spec_validator import validate
validate(yaml.safe_load(Path('docs/specs/client-login.openapi.yaml').read_text()))
print('OpenAPI PASS')
PYCODE
git diff --check
git diff --name-status c857a727c8e7640bbce8daada940f973acbf013e
```

El validador de enlaces usó AST CommonMark (markdown-it-py): resolver targets relativos al archivo, verificar existencia dentro del repositorio, anchors GitHub con sufijos de duplicado y líneas #L para fuentes. Se excluyen URL externas y texto dentro de fences como enlaces reales. La prueba de integridad lee cada blob no Markdown de la base y compara bytes con el worktree; no basta una búsqueda de extensiones en `git diff`. El chequeo de trazabilidad verifica un heading ID por requisito, todos sus campos, estado permitido y una fila de matriz con igual estado.

### Incidencias de validación resueltas

- Markdownlint exigió nombre de configuración soportado; se corrigió el archivo temporal, sin cambiar herramientas del proyecto.
- Dieciséis avisos heredados de espaciado de listas/encabezados en copias históricas/informe UI se corrigieron con espacios en blanco, sin cambiar fechas o resultados.
- Parser Mermaid en Node necesitó DOM realista; se aportó jsdom, sin modificar aplicación. Además se corrigió un separador en el texto de secuencia QuipuFac. Resultado final 11/11.
- No hubo fallos de enlaces ni cambios no documentales. Los errores de configuración del arnés no se presentan como defectos de Ticketera.

## Estados de los requisitos

| Estado | Cantidad |
|---|---|
| CUMPLE | 70 |
| PARCIAL | 11 |
| NO VERIFICADO | 1 |
| NO CUMPLE | 1 |
| PENDIENTE DE DECISIÓN | 2 |

CUMPLE acredita el alcance de evidencia de cada ID, no una declaración de producción lista. PARCIAL/NO VERIFICADO mantienen creación, cuenta, adjuntos y otros pendientes explícitos. NO CUMPLE actual: URLs/redirecciones Auth públicas aún no configuradas conforme al criterio OPS-004. Decisiones futuras: contratos de producción y política SLA, sin resolverlas por documentación.

## Documentos nuevos

- [docs/PROJECT_STATUS.md](../PROJECT_STATUS.md)
- [docs/history/README-before-specs-20261120.md](../history/README-before-specs-20261120.md)
- [docs/history/deployment-before-specs-20261120.md](../history/deployment-before-specs-20261120.md)
- [docs/history/supabase-README-before-specs-20261120.md](../history/supabase-README-before-specs-20261120.md)
- [docs/specs/API_CONTRACTS.md](API_CONTRACTS.md)
- [docs/specs/CODE_INVENTORY.md](CODE_INVENTORY.md)
- [docs/specs/DATABASE_SPEC.md](DATABASE_SPEC.md)
- [docs/specs/DECISION_LOG.md](DECISION_LOG.md)
- [docs/specs/DEPLOYMENT_SPEC.md](DEPLOYMENT_SPEC.md)
- [docs/specs/DOCUMENTATION_INVENTORY.md](DOCUMENTATION_INVENTORY.md)
- [docs/specs/DOCUMENTATION_VALIDATION.md](DOCUMENTATION_VALIDATION.md)
- [docs/specs/EVIDENCE_20261120.md](EVIDENCE_20261120.md)
- [docs/specs/METRICS_SPEC.md](METRICS_SPEC.md)
- [docs/specs/PERMISSIONS_SPEC.md](PERMISSIONS_SPEC.md)
- [docs/specs/PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md)
- [docs/specs/README.md](README.md)
- [docs/specs/SECURITY_SPEC.md](SECURITY_SPEC.md)
- [docs/specs/TECHNICAL_ARCHITECTURE.md](TECHNICAL_ARCHITECTURE.md)
- [docs/specs/TESTING_SPEC.md](TESTING_SPEC.md)
- [docs/specs/TRACEABILITY_MATRIX.md](TRACEABILITY_MATRIX.md)
- [docs/specs/WORKFLOWS_SPEC.md](WORKFLOWS_SPEC.md)
- [docs/specs/client-login.openapi.yaml](client-login.openapi.yaml)

## Archivos modificados

Se actualizaron los 31 documentos de base, sin borrar antecedentes. El archivo compartido sin seguimiento `1`, los worktrees y las ramas existentes no se tocaron.

- [CLAUDE.md](../../CLAUDE.md)
- [README.md](../../README.md)
- [docs/account-administration.md](../account-administration.md)
- [docs/areas.md](../areas.md)
- [docs/board-operations.md](../board-operations.md)
- [docs/board-recovery.md](../board-recovery.md)
- [docs/board-ui.md](../board-ui.md)
- [docs/business-metrics.md](../business-metrics.md)
- [docs/client-access-backend.md](../client-access-backend.md)
- [docs/client-login-development.md](../client-login-development.md)
- [docs/client-login-e2e.md](../client-login-e2e.md)
- [docs/client-portal.md](../client-portal.md)
- [docs/conexion-cli-baseline.md](../conexion-cli-baseline.md)
- [docs/deployment.md](../deployment.md)
- [docs/fase-1-saneamiento.md](../fase-1-saneamiento.md)
- [docs/fase-2a-supabase.md](../fase-2a-supabase.md)
- [docs/fase-2b1-integracion.md](../fase-2b1-integracion.md)
- [docs/fase-2b2-preparacion.md](../fase-2b2-preparacion.md)
- [docs/fase-2b3-catalog-preflight.md](../fase-2b3-catalog-preflight.md)
- [docs/fase-2b3a-preflight.md](../fase-2b3a-preflight.md)
- [docs/fase-2b3b-recovery-plan.md](../fase-2b3b-recovery-plan.md)
- [docs/fase-2b3c-adaptacion-procont.md](../fase-2b3c-adaptacion-procont.md)
- [docs/fase-2b3d-resolucion-bloqueos.md](../fase-2b3d-resolucion-bloqueos.md)
- [docs/frontend-identidad-procont.md](../frontend-identidad-procont.md)
- [docs/reports-ui.md](../reports-ui.md)
- [docs/request-intake.md](../request-intake.md)
- [docs/request-tracking.md](../request-tracking.md)
- [docs/ticket-catalogs.md](../ticket-catalogs.md)
- [docs/ticket-security.md](../ticket-security.md)
- [docs/validation/client-flow-ui-20261119.md](../validation/client-flow-ui-20261119.md)
- [supabase/README.md](../../supabase/README.md)

## Pendientes y frontera de esta entrega

Validación real post-M15 de creación, Mis tickets con sesiones, detalle ajeno, adjuntos, bandeja visual y logout; plataformas externas por código; contratos de producción; Auth callbacks/SMTP; facturación/configuración de Preview y auto-deploy. Sin foto transaccional de exportación, primer lote UI de 100 tickets y riesgo de RUC modificado en estudio asociado. Todos quedan enlazados desde PRODUCT_REQUIREMENTS, PROJECT_STATUS y TESTING_SPEC.

No se modificó la aplicación ni se autoriza resolver esos pendientes con este commit. La entrega termina en documentación/commit local, pendiente de revisión antes de cualquier merge o publicación.
