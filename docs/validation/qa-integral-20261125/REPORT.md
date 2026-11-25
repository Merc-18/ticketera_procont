# QA integral Ticketera Procont — 25/11/2026

## Resumen

Se preparó un entorno QA persistente aislado en PostgreSQL 17.12 local, con PostgREST 16.6 y una pasarela local. El frontend Vite se probó contra las tablas, RPC y políticas RLS de PostgreSQL real local; la autenticación interna y la autenticación de Quipu/QuipuFac se simularon con cuentas sintéticas. No se llamó a proveedores externos ni se modificó Supabase remoto.

Estado de referencia Git: `main@733d2594d9abd140f8f5108e68728daa6c545fa3`. Trabajo local Codex: rama `local/qa-integral-codex-20261125`, base `733d259`; frontend Claude: `local/qa-integral-claude-20261125`, commit `58725e0`. No hubo push ni despliegue durante esta validación.

## Entorno y acceso

- URL local observada en WSL: `http://localhost:5174` (Vite) y `http://localhost:54321/qa/health` (pasarela).
- IP WSL observada: `172.20.164.251`; Vite y gateway escuchan en todas las interfaces WSL.
- Health verificado: `QA-FICTICIO`, `PostgreSQL 17 local`, `production:false`.
- La configuración ignorada `.env.local` contiene solo un JWT descartable con rol `anon` para PostgreSQL QA; la clave no se documenta ni se versiona.
- Cuentas de prueba: `superadmin@simulado.invalid`, `admin@simulado.invalid`, `developer@simulado.invalid` y clientes sintéticos descritos en `../../../../.agent-artifacts/qa-integral-20261125/shared/QA_FIXTURE_CONTRACT.md`. Contraseña local de pruebas: `clave-simulada`.
- El intento de verificar desde este entorno con `powershell.exe` no pudo iniciar por un error de interoperabilidad WSL (`UtilBindVsockAnyPort`). Por eso la conectividad desde el navegador Windows queda **NO VERIFICADA**; `localhost:5174` y `localhost:54321` sí respondieron desde WSL. No se presenta la URL como validada desde Windows.

Los procesos persistentes de QA deben permanecer abiertos hasta terminar la revisión. El reinicio de procesos de herramientas puede detenerlos; validar `/qa/health` antes de usar la URL.

## Fuente de datos y alcance de autenticación

| Componente | Qué fue real | Qué fue simulado |
|---|---|---|
| Panel interno | Lecturas de usuarios, solicitudes, proyectos, catálogos, portafolios, RPC y RLS contra PostgreSQL 17 por PostgREST | Supabase Auth que emite el JWT local de usuario |
| Portal de clientes | `client_open_session`, `client_session_info`, `client_products`, listado y detalle mediante RPC/RLS PostgreSQL local | Validación de credenciales en el gateway; no se contactaron API Quipu/QuipuFac |
| Aprobación M20 | La acción de UI invocó la RPC real `approve_request_with_portfolio`; estado, proyecto y auditoría se verificaron directamente en PostgreSQL | Ningún servicio externo; no se enviaron notificaciones externas |
| Storage | Reserva/metadatos disponibles en el harness | Bucket es stub; carga binaria real de Supabase Storage no verificada |
| UI de Claude | React, Vite y Chromium reales renderizaron las pantallas | Las 144 pruebas UI reportadas por Claude usan REST/Auth simulados |
| Realtime | Lecturas REST/RPC reales | El gateway no ofrece Supabase Realtime WebSocket; sus respuestas 404 se registran como limitación, no como prueba aprobada |

## PostgreSQL y migraciones

El harness `supabase/tests/m20_qa_fixtures_local.py` aplicó una instalación limpia M1–M20 en PostgreSQL 17 aislado y ejecutó 15 comprobaciones, todas PASS:

1. Nombres de catálogo de estudio/área anonimizados preservando UUID, códigos y relaciones.
2. M1–M19 en orden (20 archivos, incluye M16b).
3. Dry-run transaccional de M20 con rollback y estado idéntico.
4. Reaplicación idempotente de M20.
5. Rechazo de iniciativa de otro portafolio, sin asociación parcial.
6. Rechazo de decisión ausente, iniciativa sin portafolio, independiente con portafolio y rol developer no autorizado.
7. Asociación Gestión → Beneficiarios finales persistida, auditada una vez, sin sembrar checklist y con idempotencia.
8. Ticket independiente sin portafolio, auditado.
9. `approve_request_with_portfolio`: `SECURITY DEFINER`, `search_path` vacío y sin `EXECUTE` para `anon`.
10. Dataset de 31 solicitudes con siete estados, ocho fases y cuatro prioridades.
11. Orígenes: Quipu 9, QuipuFac 7, TI 15.
12. Áreas: solo código exacto PROCONT; cero áreas en ARAPA, DISFARMADENT, PROCONT_CUZ y PROCONT_OLICH.
13. Portafolios, proyectos independientes e historial asociados verificados.
14. Sugerencias de checklist no materializadas; elementos históricos conservados.
15. Snapshot UI exportado con 25 proyectos en instalación fresca.

La ejecución está guardada en `../../.agent-artifacts/qa-integral-20261125/clean-install-evidence/`. El PostgreSQL persistente utilizado para el navegador conserva 31 solicitudes, 26 proyectos y 24 tarjetas activas luego de la comprobación M20 desde UI.

## E2E de navegador conectado al PostgreSQL local

Chromium headless abrió Vite y realizó consultas al gateway/PostgREST local. Las solicitudes API observadas en el smoke tuvieron HTTP 200; no hubo errores JavaScript ni respuestas REST/RPC fallidas. Evidencias reproducibles:

| Flujo | Resultado |
|---|---|
| Login interno | PASS — Auth local simulado; perfil activo cargado desde PostgreSQL |
| Dashboard | PASS — métricas, Equipo y Tickets por estudio visibles con 31 solicitudes |
| Boards | PASS — 24 tarjetas activas cargadas desde PostgreSQL |
| Tabla | PASS — filas reales locales |
| Bandeja Requests | PASS — solicitudes locales visibles |
| Equipo | PASS — pestañas Usuarios, Carga de trabajo, Portafolios y proyectos, Papelera y Catálogos |
| Quipu sintético | PASS — sesión PostgreSQL, 9 tickets listados y detalle propio abierto |
| QuipuFac sintético | PASS — sesión PostgreSQL, 7 tickets empresariales listados y detalle propio abierto |
| Aprobación M20 desde formulario | PASS — `REQ26-003` fue confirmado una vez con PROCONT + área QA, Gestión → Beneficiarios finales y prioridad medium |
| Verificación posterior M20 | PASS — REQ aprobado, proyecto `REQ26-003`, asociación y prioridad persistidas, un evento de auditoría |
| Adjuntos binarios | NO VERIFICADO — storage del harness es stub |
| Realtime | NO VERIFICADO — gateway local no implementa WebSocket |
| Navegador Windows | NO VERIFICADO — WSL interop falló al ejecutar PowerShell |

La aprobación generó un único ticket ficticio en el PostgreSQL desechable, no en Supabase de producción. El intento inicial de automatización encontró IDs de ejemplo obsoletos; no ejecutó escrituras. El flujo completado tomó UUID actuales del snapshot QA y se verificó contra la base.

## Dataset y privacidad

Snapshot actual `tests/ui/qa-dataset.json`: 31 solicitudes, 26 proyectos, 7 perfiles, 8 subproyectos exportados. Los nombres de los nueve estudios y veinte áreas se sustituyeron por etiquetas `QA-FICTICIO`, sin cambiar claves ni relaciones. Los usuarios usan `.invalid`; los RUC son valores sintéticos. Los títulos, nombres de cliente y archivos usados en QA están identificados como ficticios.

El snapshot de una instalación limpia se reexporta de la base persistente cuando cambia. UUID de tablas generados no son portables a otra instalación; usar el `qa-dataset.json` exportado de esa instancia.

## Suites UI reportadas por Claude

Claude confirmó en su worktree/commit `58725e0`:

- Node: 209/209 PASS.
- UI React/Vite/Chromium: 144 PASS, 0 FAIL, 6 omitidas ya preexistentes.
- Build TypeScript/Vite: PASS.
- 180 capturas «después» consistentes, `202611250941`, sin overflow horizontal según su revisión; el resto de las 280 capturas corresponde a estado previo y se conserva en su worktree.
- Esas suites usan servicios simulados y no sustituyen el E2E PostgreSQL anterior.

Las suites integradas se ejecutarán tras incorporar localmente el commit de Claude; aquí no se declaran como resultado de una ejecución integrada.

## Capturas PostgreSQL locales

Las capturas reproducibles de este informe están en `screenshots/`; versión local Vite observada: `202611250959`. `screenshots-manifest.json` contiene tamaños, SHA-256, vistas y origen de datos; `SHA256SUMS` permite verificar integridad.

## Pendientes antes de considerar aceptado el entorno

1. Abrir `http://localhost:5174` desde Windows y confirmar que su navegador puede alcanzar el gateway `localhost:54321`.
2. Validar carga binaria/descarga de adjuntos usando un servicio Storage local real o un entorno aislado Supabase, sin tocar producción.
3. Ejecutar y registrar las suites completas sobre el árbol integrado Codex + Claude.
4. No publicar hasta que la revisión integrada resuelva esos pendientes de aceptación y se confirme el estado remoto de main/Supabase/Vercel.

No se insertaron datos en Supabase remoto; no hubo push, merge a main ni despliegue.
