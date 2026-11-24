# Datos QA-FICTICIO

Revisión 24/11/2026.

El conjunto reproducible es local/desechable: `tests/ui/qa-dataset.json` + `tests/ui/qa-fixtures.mjs`, generado por `supabase/tests/m20_qa_fixtures_local.py` sobre PostgreSQL temporal por socket. Identificador: `QA-FICTICIO`; no usar nombres, RUC ni cuentas reales, y ningún ticket del conjunto se inserta en Supabase remoto.

Evidencia histórica `data/m20-qa.json`: PostgreSQL 17.12, 14 checks; 25 solicitudes, 19 proyectos UI, 7 usuarios ficticios, ambos proveedores y TI, estados y fases existentes, prioridades, portafolios, áreas PROCONT/exclusiones y checklists vacíos/aceptados/manuales/históricos. Prueba M20 ROLLBACK, idempotencia, RBAC, rechazo de asociación incorrecta, asociación atómica/auditada e independiente. Auth/Storage eran stubs locales; el JSON identifica explícitamente `remote_operations=false`.

Advertencia de evidencia: JSON fue generado antes del ajuste final que eliminó inferir procedencia de checklists por timestamp. Su etiqueta de «18 heredadas» no se considera demostración de origen; filas ambiguas se conservan/contabilizan. PostgreSQL harness no se volvió a ejecutar porque el entorno actual no trae los binarios requeridos. Pruebas UI actuales usan fixtures locales simuladas.
