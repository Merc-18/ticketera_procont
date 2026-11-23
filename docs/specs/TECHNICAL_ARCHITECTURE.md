# Arquitectura técnica

Revisión: **20/11/2026** · Código de referencia: **`c857a727c8e7640bbce8daada940f973acbf013e`**.

Fuente oficial de requisitos: [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md).

## Límites del sistema y dependencias

Ticketera es una SPA estática. React 18 y React Router 6 renderizan rutas; TypeScript comprueba contratos y Vite 5 compila assets. Tailwind 3 y `src/theme/brand.ts` centralizan estilo; `@hello-pangea/dnd` soporta Kanban, Recharts gráficos, `xlsx` el importador Planner y date-fns fechas de interfaz. Las versiones exactas instalables están en `package-lock.json`; no actualizar dependencias como efecto secundario de una edición documental.

Supabase aporta PostgreSQL 17, PostgREST/RPC, Auth interno, Realtime y Storage. Deno ejecuta las dos Edge Functions; ambas importan `@supabase/supabase-js@2.98.0` de forma explícita. El frontend declara otra versión compatible mediante su lockfile: no asumir que ambas instalaciones son la misma. Vercel sirve `dist` y GitHub conserva historial. Los servicios de Quipu/QuipuFac son dependencias externas, no parte modificable del repositorio.

```mermaid
flowchart LR
  U[Cliente o personal] --> V[Vercel: SPA React]
  G[GitHub: código aprobado] --> V
  V --> P[PostgREST: RPC y RLS]
  V --> E[Edge client-login]
  V --> A[Supabase Auth interno]
  V --> S[Storage privado]
  E --> Q[Quipu: API de desarrollo del piloto]
  E --> F[QuipuFac: API de desarrollo del piloto]
  E --> P
  P --> D[(PostgreSQL M1 a M15)]
  S --> D
```

## Frontend → adaptador → contrato → servidor

| Zona | Entrada UI | Adaptador | Autoridad backend |
|---|---|---|---|
| Clientes | `ClientHome`, `ClientWorkspace`, `ClientNewTicket`, `MyTickets`, `ClientTicketDetail` | `src/lib/client-portal-api.ts` → `client-portal.ts` → `contracts/client-access-client.mjs` | Edge `client-login`, RPC `client_*`, M13/M14/M15 |
| Personal | `LoginForm`, modal `PublicLanding`, `ProtectedRoute` | `useAuth`/`auth-controller` + `loadActiveProfile` | Supabase Auth + `public.users` + RLS/RPC |
| Solicitudes | `RequestInbox`, `RequestValidationModal`, `PlannerImportModal` | `src/lib/operations.ts`, `rpc-attempt.ts` | RPC de clasificación/decisión y M15 |
| Tablero | `KanbanBoard`, `ProjectModal`, `BoardDialogs` | `useBoardTicket`, `src/lib/board.ts`, `board-operations-client.mjs` | M12: snapshots y comandos transaccionales |
| Checklist/comentarios | `ChecklistSection`, `CommentsSection` | hooks y CRUD explícito del SDK | RLS; triggers de reloj/auditoría; menciones de UI |
| Métricas/exportación | `DashboardView`, `WorkloadView`, paneles de urgencia | `metrics-adapter.ts`, `ticket-export.ts`, contrato metrics | M11, consultas paginadas PostgREST |
| Adjuntos | `AttachmentPicker`, `EvidenceSection` | preparación → reserva → upload | RPC M9/M12/M13 + políticas y trigger final de Storage |

```mermaid
flowchart TD
  R[Ruta React] --> H[Hooks y componentes]
  H --> L[Adaptadores TypeScript]
  L --> C[Contratos JavaScript y d.mts]
  C --> RPC[RPC PostgreSQL]
  L --> SDK[SDK Supabase: Auth, tablas y Storage]
  RPC --> GR[Guarda de rol o capacidad cliente]
  SDK --> RLS[RLS y permisos de columnas]
  GR --> TX[Transacción, locks, eventos e idempotencia]
  RLS --> TX
```

`src/types/database.types.ts` cubre el modelo usado por componentes, pero no sustituye al SQL ni a los `.d.mts` de contratos. Al ampliar un RPC, actualizar contrato, adaptador, tipos y pruebas conjuntamente; no inferir autorización desde un botón oculto.

## Login Quipu

```mermaid
sequenceDiagram
  actor C as Cliente
  participant UI as ClientHome
  participant E as client-login
  participant Q as Quipu del piloto
  participant DB as M13 y M14
  C->>UI: RUC, usuario exacto, contraseña
  UI->>E: POST action=login, provider=quipu
  E->>E: Origen, JSON, contrato y URL explícitos
  E->>DB: client_login_throttle con claves SHA-256
  DB-->>E: permitido o límite
  E->>Q: POST ruc, username, password
  Q-->>E: username y token observados
  E->>E: Validar y descartar token upstream
  E->>DB: client_open_session con hash de token propio
  E->>DB: client_session_info
  E-->>UI: session_token y sesión raw
  UI->>DB: client_products
  UI-->>C: Espacio cliente y productos permitidos
```

## Login QuipuFac

```mermaid
sequenceDiagram
  actor C as Cuenta empresarial
  participant UI as ClientHome
  participant E as client-login
  participant F as QuipuFac del piloto
  participant DB as M13 y M14
  C->>UI: RUC y contraseña
  UI->>E: POST provider=quipufac sin username
  E->>DB: client_login_throttle
  E->>F: POST username=RUC, password
  F-->>E: username, businessRuc, businessName, token
  E->>E: Comprobar RUC y contrato y descartar token
  E->>DB: client_open_session: subject=company
  E-->>UI: Sesión Ticketera empresarial
  UI->>DB: client_products
  DB-->>UI: Productos activos excepto Quipu en acceso directo
```

La sesión **raw** de Edge tiene `identity` y `company` anidados y no contiene productos. `createClientPortal` combina esa respuesta con `client_products` y produce la sesión de UI con `ruc`, `studio_id`, `studio_mapping`, `auth_type`, `origin`, `identity`, `products`, `expires_at`. No implementar una segunda autenticación para obtener ese modelo.

## Creación autenticada y M15

```mermaid
sequenceDiagram
  participant UI as PublicRequestForm autenticado
  participant M13 as client_submit_request
  participant P as Tablas privadas de cliente
  participant H as submit_client_request privado por ACL
  participant DB as Solicitud y eventos
  UI->>M13: sesión, payload permitido, UUID de intento
  M13->>P: Validar sesión y bloquear contra revocación
  M13->>P: Replay por identidad y clave
  M13->>M13: Producto permitido y estudio resuelto
  M13->>H: Llamada interna SECURITY DEFINER del mismo propietario
  H->>DB: Validación, número REQ, acceso y eventos
  M13->>P: Guardar enlace de identidad y payload original
  M13-->>UI: UUID, REQ y capacidad de adjuntos
```

M15 retira la ejecución **directa** del helper antiguo. No revoca `client_submit_request`, no modifica el cuerpo M13 ni cambia propietarios. Los tokens de cliente no son JWT de Supabase Auth. Las tablas privadas no son endpoints de lectura para el navegador.

## Seguimiento

```mermaid
flowchart LR
  X[REQ sin sesión] --> T[RequestTracking]
  T --> R[track_request_status]
  R --> L[Contador 10 por IP/min y 300 global/min]
  L --> G[Estado general derivado]
  G --> O[Solo número y estado]
  C[Sesión cliente] --> M[Mis tickets / detalle]
  M --> I[Filtro identity_id]
```

`track_request_status` incrementa contadores de protección: una consulta pública no es una transacción SQL de solo lectura. No ejecutarla como una comprobación inocua de inventario cuando la autorización prohíbe escrituras.

## Adjuntos

```mermaid
flowchart TD
  F[Archivos seleccionados] --> C[Compresión solo imágenes cuando excede cupo]
  C --> N[Crear solicitud autenticada]
  N --> R[client_reserve_attachments: sesión y propiedad]
  R --> P[Ruta opaca y reserva M9]
  P --> U[Storage upload: upsert=false]
  U --> B[Bucket privado request-attachments]
  B --> V[Trigger diferido: bytes, MIME, cupo y expiración]
  E[Editor interno] --> I[reserve_board_evidence: actor y proyecto]
  I --> P
```

## Validación interna

```mermaid
flowchart TD
  S[Solicitud pending] --> V[Inicio de revisión por admin/superadmin]
  V --> C[Clasificación: código, subproyecto y áreas si aplica]
  C --> D{Decisión}
  D -->|Rechazar| R[Motivo público y notas privadas]
  D -->|Aprobar| A[Responsable principal y prioridad definitiva]
  A --> P[Development workflow_version=2 en Backlog]
  R --> H[Eventos inmutables]
  P --> H
```

## Development

```mermaid
flowchart LR
  B[Backlog] --> A[Analysis]
  A --> D[Design]
  D --> V[Development]
  V --> C[Code Review]
  C --> T[Testing]
  T --> P[Deploy]
  P --> F[Done]
  F -->|Reabrir con motivo| A
```

Las flechas muestran el recorrido nominal, no una obligación de avanzar exactamente una fase. M12 admite saltos y retrocesos; bloqueo impide cambios y Done tiene confirmación de checklist. Administrative/Dual existentes permanecen históricos. [Flujos detallados](WORKFLOWS_SPEC.md).

## Despliegue

```mermaid
flowchart TD
  G[Commit aprobado en GitHub] --> R[Revisión y pruebas aisladas]
  R --> M[Migración nueva: dry-run exacto y autorización]
  M --> E[Edge desde código aprobado y configuración de entorno]
  E --> P[Preview compatible]
  P --> V[Build Vercel con variables del entorno]
  V --> D[Dominio oficial: piloto]
  D --> C[Comprobaciones públicas y QA autorizadas]
  C --> S[Mantener M15 y corregir hacia adelante]
```

Este es el procedimiento conceptual. El orden histórico de activación fue M14, función/frontend y después M15; **M1–M15 ya están aplicadas**, no volver a ejecutarlas. Las variables `VITE_*` se fijan al compilar; las privadas se leen en Edge. [Runbook](DEPLOYMENT_SPEC.md).

## Mantenimiento y restricciones de arquitectura

Conservar el UUID de intento frente a una respuesta incierta. No generar logs de auditoría desde el navegador. No reemplazar null estadístico por cero. No usar datos del proveedor como permisos internos. Mantener acciones de tablero en M12 y operaciones clientes en M13. Cualquier cambio de contratos externos requiere evidencia depurada y configuración explícita. Los scripts de preparación antiguos fijan fases históricas: su existencia no los convierte en instaladores universales M1–M15.

El inventario completo y los consumidores están en [CODE_INVENTORY.md](CODE_INVENTORY.md); todas las funciones SQL y tablas por migración en [DATABASE_SPEC.md](DATABASE_SPEC.md).

## Rutas y componentes

| Ruta | Parámetros / destino | Componente | Sesión y comportamiento |
|---|---|---|---|
| `/portal` | Dos tarjetas (Nueva Solicitud, Rastrear Solicitud) e ingreso interno; tres hasta el 23/11/2026 | `PublicLanding` | Público; botones navegan a cliente/tracking o abren modal separado. |
| `/cliente` | Query `ir=nuevo` o `ir=tickets` en lista blanca | `ClientHome` | Público; exactamente dos métodos; flag compilado controla disponibilidad. |
| `/cliente/nuevo` | Sin UUID de estudio en URL | `ClientWorkspace` + `ClientNewTicket` + `PublicRequestForm` | Capacidad válida; sin asociación muestra aviso y bloquea envío. |
| `/cliente/tickets` | Lista de identidad | `ClientWorkspace` + `MyTickets` | Capacidad válida; tabla escritorio/tarjetas móvil, primer lote de 100. |
| `/cliente/tickets/:id` | UUID del ticket | `ClientWorkspace` + `ClientTicketDetail` | Sesión y propiedad; ajeno/inexistente mismo PT404; no destruye sesión. |
| `/cliente/acceso/:provider` | provider quipu/quipufac y fragmento `#code=...` | `ClientLaunch` | Canje de un uso, elimina fragmento y confirma identidad; no supone secreto en navegador. |
| `/tracking` | REQ en formulario | `RequestTracking` | Público, solo número/estado; no comparte autenticación con Mis tickets. |
| `/request` | Redirección replace a `/cliente` | `Navigate` en App | Ningún formulario anónimo. |
| `/login` | Correo/contraseña internos | `LoginForm` | Supabase Auth y perfil activo; no login de cliente. |
| `/` | Dashboard/Boards/Requests/Equipo | `ProtectedRoute` + Dashboard en App | Personal con perfil activo; pestañas/subpestañas por rol. |
| Cualquier otra | Fallback a `/portal` | `Navigate` | No ruta que permita saltar autorizaciones de servidor. |

Un destino de detalle sin sesión vuelve por lista (`ir=tickets`), no se promete recuperar el UUID exacto después del login. El parámetro `ir` no es un redirect externo arbitrario. `BuildVersion` se renderiza fuera de App/ErrorBoundary en main para todas las rutas y pantallas de error, en flujo normal y sin posición fija.
