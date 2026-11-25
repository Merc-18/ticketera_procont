# Contrato único de fixtures QA-FICTICIO

Revisión: 25/11/2026. Base: `733d2594d9abd140f8f5108e68728daa6c545fa3`.

Este contrato es la fuente compartida para backend y UI. Los datos solo se generan en un PostgreSQL desechable/local y en fixtures de navegador. Nunca se escriben en Supabase de producción. La semilla PostgreSQL canónica es `supabase/tests/m20_qa_fixtures_local.py`; su JSON derivado es `tests/ui/qa-dataset.json`. La interfaz de pruebas existente usa `tests/ui/fixture-server.mjs`, que es explícitamente simulada. Esa simulación no se contabiliza como E2E contra PostgreSQL.

## Convenciones de identidad y datos

- Prefijo visible obligatorio en títulos/solicitantes/descriciones ficticias: `QA-FICTICIO`.
- Los UUID creados por RPC en una semilla PostgreSQL son identificadores de esa instancia, se obtienen del dataset exportado y no deben codificarse como IDs permanentes entre reinstalaciones. Para localizar filas se usa además su título QA exacto.
- Los UUID de actores internos son fijos. Los UUID de portafolios/proyectos los genera el seed de este PostgreSQL; para esta instancia se pueden usar los de la tabla siguiente o `tests/ui/qa-dataset.json`. Después de recrear la base, obtener todos los IDs relacionales del nuevo snapshot, no reutilizar estos.
- Los nombres visibles de estudios y áreas en el clúster persistente se sustituyen por etiquetas `QA-FICTICIO`; se preservan UUID, códigos y relaciones.
- Todas las cuentas usan dominio reservado `.invalid`; no enviar correo. No se utiliza RUC ni dato personal real.

## Actores internos

| Alias estable | UUID | Cuenta local | Rol/estado | Uso |
|---|---|---|---|---|
| `staff.superadmin` | `00000000-0000-4000-8000-0000000000c1` | `superadmin@simulado.invalid` | superadmin activo | acceso total QA |
| `staff.admin` | `00000000-0000-4000-8000-0000000000c2` | `admin@simulado.invalid` | admin activo | bandeja, aprobación, gestión |
| `staff.developer` | `00000000-0000-4000-8000-0000000000c3` | `developer@simulado.invalid` | developer activo | ejecución y Boards |
| `staff.viewer` | `00000000-0000-4000-8000-0000000000c4` | `viewer@simulado.invalid` | viewer activo | lectura autorizada |
| `staff.inactive` | `00000000-0000-4000-8000-0000000000c5` | `inactive@simulado.invalid` | admin inactivo | rechazo de acceso |
| `staff.analyst1` | `00000000-0000-4000-8000-0000000000d1` | `analista1@simulado.invalid` | developer activo | carga de trabajo/color |
| `staff.analyst2` | `00000000-0000-4000-8000-0000000000d2` | `analista2@simulado.invalid` | developer activo | carga de trabajo/color |
| `staff.external` | `00000000-0000-4000-8000-0000000000c6` | sin perfil | externo | control negativo |

Para autenticación solo en el servidor UI local de fixtures se usa la clave pública de prueba `clave-simulada`. No es una credencial de Ticketera, de producción ni de un usuario real.

## Clientes sintéticos

Las sesiones se abren dentro de PostgreSQL local mediante `client_open_session`; los tokens aleatorios solo existen durante la semilla y nunca se exportan al JSON:

| Alias | Proveedor | RUC sintético | Username | Alcance esperado |
|---|---|---|---|---|
| `client.quipu` | Quipu | `20999999901` | `qaficticio` | RUC + username exacto |
| `client.quipufac` | QuipuFac | `20999999902` | identidad empresarial | tickets compartidos dentro de ese RUC |

Ambos RUC son valores ficticios de QA y están aislados del catálogo/producción. Los nombres de solicitante incluyen `QA-FICTICIO` y no identifican personas reales.

## Catálogos y relaciones estables

| Alias | UUID | Nombre |
|---|---|---|
| `portfolio.gestion` | `ef5e795e-8d70-4384-b9ff-2da3624dc65e` | Gestión (solo esta instancia QA) |
| `portfolio.qa_operations` | `992204bd-dc88-450b-984a-8b51aef71247` | QA-FICTICIO Operaciones (solo esta instancia QA) |
| `initiative.beneficiarios` | `5f2fc580-63c7-4e41-931e-48dcbe598460` | Beneficiarios finales, pertenece a Gestión (solo esta instancia QA) |
| `initiative.qa_cierre` | `1ee4dd50-5b99-42ed-91d5-30aad0905c9f` | QA-FICTICIO Cierre mensual, pertenece a QA-FICTICIO Operaciones (solo esta instancia QA) |

Códigos internos cubiertos: `PROCONT` con área sintética; `ARAPA`, `DISFARMADENT`, `PROCONT_CUZ` y `PROCONT_OLICH` sin área. Catálogo real de sistemas, tipos y subproyectos se lee de las migraciones aplicadas al clúster local; no se inventan opciones. Estudios adicionales vienen de fixtures/catalog seed, no de datos personales.

## Estados, prioridades y fases

- Estados generales de solicitudes comprobados por el fixture: `received`, `in_review`, `approved_backlog`, `in_progress`, `blocked`, `done`, `rejected`.
- Estado de proyecto/ticket utiliza el catálogo vigente (`active`, `completed`, `archived` y los demás valores válidos de migraciones); no confundir con fase.
- Prioridad: `low`, `medium`, `high`, `urgent`.
- Fases Development: `backlog`, `analysis`, `design`, `dev`, `code_review`, `testing`, `deploy`, `done`.
- Urgencia histórica, estado de bloqueo, estado general y prioridad son atributos diferentes.

## Dataset funcional previsto

La semilla M20 crea 23 solicitudes QA por RPC reales, las comprobaciones transaccionales añaden 2, y el conjunto contiene **31 solicitudes** (9 Quipu, 7 QuipuFac y 15 TI). La aprobación visual E2E de `REQ26-003` guarda un proyecto con M20; el snapshot final contiene **26 proyectos**, de los que **24** aparecen en Boards con filtro Activos. La base incluye 7 perfiles de control. Para restablecer el estado semilla, recrear un clúster desechable; no intentar revertir la aprobación sobre una solicitud ya confirmada.

Los títulos de solicitud de clientes definidos por el script comienzan con `QA-FICTICIO`. Las filas internas creadas por `create_internal_ticket` guardan el título en el proyecto relacionado; la solicitud asociada puede tener `title = null`. El snapshot incluye solicitudes recibidas/en revisión/rechazadas de ambos proveedores; cuatro códigos con y sin área; tickets en ocho fases; prioridad en los cuatro valores; aprobados con Gestión → Beneficiarios finales, con el segundo portafolio, y tickets independientes; y tickets internos/originados por cliente. Una solicitud ficticia se seleccionó en el portal interno para validar M20 y su estado resultó aprobado:

- `Quipu consulta de beneficiarios`: cero tareas persistidas; sugerencias visibles no cuentan.
- `Quipu validación de RUC con guion`: sugerencias aceptadas (3 tareas persistidas).
- `QuipuFac notas de crédito`: 3 persistidas, 1 completa.
- `TI pruebas de permisos`: 3 persistidas, completas.
- `TI tablero de beneficiarios`: 3 sugeridas aceptadas + tarea manual (4 persistidas, 2 completas).
- `Histórico con checklist previo`: filas antiguas preservadas; su procedencia ambigua no se infiere ni reclasifica.
- Solicitudes pendientes y rechazadas: no tienen proyecto/tarjeta; no inventar relación.

La semilla crea 5 asignaciones internas de trabajo (developer, admin, superadmin, analista1, analista2), más viewer/inactivo/external para permisos. El fixture UI reducido de `fixture-server.mjs` es únicamente demostrativo de render y contiene cuatro perfiles internos; no sustituye este dataset de backend. El gateway local simula Auth y el login de proveedores; `client_open_session`, listados, detalle, tablas y RLS se ejecutan sobre PostgreSQL local real.

## Adjuntos

La semilla PG reserva metadatos ficticios para `qa-ficticio-captura.png` (2 KiB) en solicitud QA. `storage` es stub local; no acredita upload binario real. Los casos de selección, Drag & Drop, Clipboard, duplicado, MIME rechazado y límite excedido se ejecutan en navegador con archivos locales sintéticos y se etiquetan como pruebas UI, no Supabase Storage real.

## Contrato de uso para Claude

1. Consumir `tests/ui/qa-dataset.json` como snapshot generado por la semilla PG; UUID de portafolios, proyectos, solicitudes y áreas se obtienen de ese archivo para esa instancia. Los nombres/IDs estables de actores aplican a pruebas independientes. En el browser conectado al gateway local, el catálogo viene de PostgreSQL y sus nombres de estudio/área también están anonimizados.
2. No crear un dataset divergente ni cambiar títulos, roles, fases, prioridades o asociaciones aquí definidos sin actualizar este archivo y comunicarlo.
3. Para capturas de UI simuladas se usan `@simulado.invalid` / `clave-simulada` contra `fixture-server.mjs`. Para la UI conectada al gateway QA persistente también se usan RUC sintéticos de este contrato y la misma clave de prueba; el proveedor se simula, pero `client_open_session`, listados, detalle, tablas y RLS pasan por PostgreSQL real. No usar proveedores ni cuentas reales.
4. No mostrar secretos ni datos reales en capturas. Rotular/identificar las vistas con `QA-FICTICIO`.
5. Al informar evidencia, separar PostgreSQL real local, harness Auth/Storage simulado y UI con REST simulado.
