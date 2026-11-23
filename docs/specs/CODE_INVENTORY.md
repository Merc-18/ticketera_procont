# Inventario completo del código y evidencias

Revisión: **20/11/2026** · Código de referencia: **`c857a727c8e7640bbce8daada940f973acbf013e`**.

Fuente oficial de requisitos: [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md).

## Método y alcance

Se inventariaron **345 archivos versionados** de la base y **227 archivos de código/configuración** de la tabla siguiente, incluidos SQL históricos y pruebas. Se leyeron los archivos para indexar exports, funciones SQL, RPC, imports y nombres de casos; la revisión funcional priorizó sus rutas/consumidores y guardas, no solo nombres. No se ejecutó el SQL ni las pruebas de producto. El lockfile es fuente de versiones concretas. Los archivos nuevos de documentación no forman parte de este conteo base.

| Archivo | Líneas base | Responsabilidad / interfaz revisada |
|---|---|---|
| [admin_setup.sql](../../admin_setup.sql) | 221 | Artefacto SQL/script legado en raíz; NO forma parte de migraciones M1–M15 ni arranque normal. |
| [contracts/board-operations-client.d.mts](../../contracts/board-operations-client.d.mts) | 40 | Contrato consumido por frontend; .d.mts declara tipos y .mjs transporta RPC. Exporta: `Priority`, `DevelopmentPhase`, `LegacyPhase`, `Phase`, `DEVELOPMENT_PHASES`, `PendingItem`, `BoardFlow`, `BoardTicket`, `BoardRpcClient`…; ver archivo para el resto. |
| [contracts/board-operations-client.mjs](../../contracts/board-operations-client.mjs) | 42 | Contrato consumido por frontend; .d.mts declara tipos y .mjs transporta RPC. Exporta: `DEVELOPMENT_PHASES`, `createBoardOperations`. |
| [contracts/client-access-client.d.mts](../../contracts/client-access-client.d.mts) | 56 | Contrato consumido por frontend; .d.mts declara tipos y .mjs transporta RPC. Exporta: `ClientProvider`, `ClientAccessResourceError`, `ClientLoginInput`, `ClientSession`, `ClientSessionReceipt`, `ClientProduct`, `ClientSubmitPayload`, `ClientRequestReceipt`, `ClientAttachmentInput`…; ver archivo para el resto. |
| [contracts/client-access-client.mjs](../../contracts/client-access-client.mjs) | 50 | Contrato consumido por frontend; .d.mts declara tipos y .mjs transporta RPC. Exporta: `createClientAccess`. |
| [contracts/ticket-metrics-client.d.mts](../../contracts/ticket-metrics-client.d.mts) | 29 | Contrato consumido por frontend; .d.mts declara tipos y .mjs transporta RPC. Exporta: `MetricStatus`, `TicketPerformance`, `PerformanceSummary`, `RequesterUrgency`, `MonthlyUrgency`, `MetricsClient`, `createTicketMetrics`. |
| [contracts/ticket-metrics-client.mjs](../../contracts/ticket-metrics-client.mjs) | 16 | Contrato consumido por frontend; .d.mts declara tipos y .mjs transporta RPC. Exporta: `createTicketMetrics`. |
| [contracts/ticket-security-client.d.mts](../../contracts/ticket-security-client.d.mts) | 13 | Contrato consumido por frontend; .d.mts declara tipos y .mjs transporta RPC. Exporta: `AttachmentGrant`. |
| [contracts/ticket-security-client.mjs](../../contracts/ticket-security-client.mjs) | 59 | Contrato consumido por frontend; .d.mts declara tipos y .mjs transporta RPC. Exporta: `MAX_ATTACHMENT_FILES`, `MAX_ATTACHMENT_TOTAL_BYTES`, `reserveTicketAttachments`, `uploadReservedTicketAttachment`, `uploadTicketAttachment`. RPC: `reserve_request_attachment`, `reserve_request_attachments`. |
| [docs/validation/fase-2b3-catalog-preflight.sql](../../docs/validation/fase-2b3-catalog-preflight.sql) | 443 | Artefacto SQL/script legado en raíz; NO forma parte de migraciones M1–M15 ni arranque normal. |
| [docs/validation/fase-2b3d-cli-preflight.sql](../../docs/validation/fase-2b3d-cli-preflight.sql) | 445 | Artefacto SQL/script legado en raíz; NO forma parte de migraciones M1–M15 ni arranque normal. |
| [fix_enable_rls_all_tables.sql](../../fix_enable_rls_all_tables.sql) | 106 | Artefacto SQL/script legado en raíz; NO forma parte de migraciones M1–M15 ni arranque normal. |
| [index.html](../../index.html) | 15 | Configuración de compilación, dependencias o despliegue; no contiene credenciales privadas. |
| [int_number_migration.sql](../../int_number_migration.sql) | 9 | Artefacto SQL/script legado en raíz; NO forma parte de migraciones M1–M15 ni arranque normal. |
| [migrate_number_format.sql](../../migrate_number_format.sql) | 42 | Artefacto SQL/script legado en raíz; NO forma parte de migraciones M1–M15 ni arranque normal. |
| [notifications_migration.sql](../../notifications_migration.sql) | 38 | Artefacto SQL/script legado en raíz; NO forma parte de migraciones M1–M15 ni arranque normal. |
| [package-lock.json](../../package-lock.json) | 3489 | Configuración de compilación, dependencias o despliegue; no contiene credenciales privadas. |
| [package.json](../../package.json) | 33 | Configuración de compilación, dependencias o despliegue; no contiene credenciales privadas. |
| [postcss.config.js](../../postcss.config.js) | 6 | Configuración de compilación, dependencias o despliegue; no contiene credenciales privadas. |
| [rls_fix.sql](../../rls_fix.sql) | 73 | Artefacto SQL/script legado en raíz; NO forma parte de migraciones M1–M15 ni arranque normal. |
| [scripts/activate_board_m12.py](../../scripts/activate_board_m12.py) | 453 | Herramienta operativa con alcance fijado; revisar --help y autorización antes de cualquier ejecución. |
| [scripts/activate_client_m13.py](../../scripts/activate_client_m13.py) | 215 | Herramienta operativa con alcance fijado; revisar --help y autorización antes de cualquier ejecución. |
| [scripts/apply_account_administration.py](../../scripts/apply_account_administration.py) | 139 | Herramienta operativa con alcance fijado; revisar --help y autorización antes de cualquier ejecución. |
| [scripts/apply_areas.py](../../scripts/apply_areas.py) | 145 | Herramienta operativa con alcance fijado; revisar --help y autorización antes de cualquier ejecución. |
| [scripts/apply_supabase_migrations.py](../../scripts/apply_supabase_migrations.py) | 266 | Herramienta operativa con alcance fijado; revisar --help y autorización antes de cualquier ejecución. |
| [scripts/bootstrap_auth_identity.mjs](../../scripts/bootstrap_auth_identity.mjs) | 20 | Herramienta operativa con alcance fijado; revisar --help y autorización antes de cualquier ejecución. |
| [scripts/bootstrap_superadmin.py](../../scripts/bootstrap_superadmin.py) | 105 | Herramienta operativa con alcance fijado; revisar --help y autorización antes de cualquier ejecución. |
| [scripts/build_migration_recovery.py](../../scripts/build_migration_recovery.py) | 287 | Herramienta operativa con alcance fijado; revisar --help y autorización antes de cualquier ejecución. |
| [scripts/check_board_m12_dry_run.py](../../scripts/check_board_m12_dry_run.py) | 92 | Herramienta operativa con alcance fijado; revisar --help y autorización antes de cualquier ejecución. |
| [scripts/close_account_admin.py](../../scripts/close_account_admin.py) | 21 | Herramienta operativa con alcance fijado; revisar --help y autorización antes de cualquier ejecución. |
| [scripts/close_supabase_preparation.py](../../scripts/close_supabase_preparation.py) | 61 | Herramienta operativa con alcance fijado; revisar --help y autorización antes de cualquier ejecución. |
| [scripts/connect_supabase_cli.py](../../scripts/connect_supabase_cli.py) | 340 | Herramienta operativa con alcance fijado; revisar --help y autorización antes de cualquier ejecución. |
| [scripts/import_supabase_inventory.py](../../scripts/import_supabase_inventory.py) | 173 | Herramienta operativa con alcance fijado; revisar --help y autorización antes de cualquier ejecución. |
| [scripts/prepare_supabase_local.py](../../scripts/prepare_supabase_local.py) | 232 | Herramienta operativa con alcance fijado; revisar --help y autorización antes de cualquier ejecución. |
| [scripts/probe_client_login.py](../../scripts/probe_client_login.py) | 146 | Herramienta operativa con alcance fijado; revisar --help y autorización antes de cualquier ejecución. |
| [scripts/run_client_login_local.py](../../scripts/run_client_login_local.py) | 142 | Herramienta operativa con alcance fijado; revisar --help y autorización antes de cualquier ejecución. |
| [seed_data.sql](../../seed_data.sql) | 790 | Artefacto SQL/script legado en raíz; NO forma parte de migraciones M1–M15 ni arranque normal. |
| [seed_test_data.sql](../../seed_test_data.sql) | 423 | Artefacto SQL/script legado en raíz; NO forma parte de migraciones M1–M15 ni arranque normal. |
| [setup.js](../../setup.js) | 316 | Artefacto SQL/script legado en raíz; NO forma parte de migraciones M1–M15 ni arranque normal. Exporta: `supabase`, `User`, `Tag`, `Request`, `Project`, `ProjectFlow`, `ChecklistItem`, `Comment`, `ActivityLog`. |
| [sla_migration.sql](../../sla_migration.sql) | 10 | Artefacto SQL/script legado en raíz; NO forma parte de migraciones M1–M15 ni arranque normal. |
| [src/App.tsx](../../src/App.tsx) | 264 | Arranque, tipos, estilos o marca de la SPA. |
| [src/components/ErrorBoundary.tsx](../../src/components/ErrorBoundary.tsx) | 36 | Componente React de ErrorBoundary.tsx; presentación y eventos del flujo. Adaptadores/RPC deciden permisos. |
| [src/components/admin/AreasPanel.tsx](../../src/components/admin/AreasPanel.tsx) | 127 | Componente React de admin; presentación y eventos del flujo. Adaptadores/RPC deciden permisos. |
| [src/components/admin/CatalogsPanel.tsx](../../src/components/admin/CatalogsPanel.tsx) | 192 | Componente React de admin; presentación y eventos del flujo. Adaptadores/RPC deciden permisos. |
| [src/components/admin/PapeleraView.tsx](../../src/components/admin/PapeleraView.tsx) | 160 | Componente React de admin; presentación y eventos del flujo. Adaptadores/RPC deciden permisos. |
| [src/components/admin/UserManagementPanel.tsx](../../src/components/admin/UserManagementPanel.tsx) | 337 | Componente React de admin; presentación y eventos del flujo. Adaptadores/RPC deciden permisos. |
| [src/components/admin/UserModal.tsx](../../src/components/admin/UserModal.tsx) | 206 | Componente React de admin; presentación y eventos del flujo. Adaptadores/RPC deciden permisos. |
| [src/components/admin/WorkloadView.tsx](../../src/components/admin/WorkloadView.tsx) | 184 | Componente React de admin; presentación y eventos del flujo. Adaptadores/RPC deciden permisos. |
| [src/components/auth/LoginForm.tsx](../../src/components/auth/LoginForm.tsx) | 103 | Componente React de auth; presentación y eventos del flujo. Adaptadores/RPC deciden permisos. |
| [src/components/auth/ProtectedRoute.tsx](../../src/components/auth/ProtectedRoute.tsx) | 40 | Componente React de auth; presentación y eventos del flujo. Adaptadores/RPC deciden permisos. |
| [src/components/boards/BoardColumn.tsx](../../src/components/boards/BoardColumn.tsx) | 86 | Componente React de boards; presentación y eventos del flujo. Adaptadores/RPC deciden permisos. |
| [src/components/boards/BoardSelector.tsx](../../src/components/boards/BoardSelector.tsx) | 31 | Componente React de boards; presentación y eventos del flujo. Adaptadores/RPC deciden permisos. |
| [src/components/boards/GanttView.tsx](../../src/components/boards/GanttView.tsx) | 241 | Componente React de boards; presentación y eventos del flujo. Adaptadores/RPC deciden permisos. |
| [src/components/boards/KanbanBoard.tsx](../../src/components/boards/KanbanBoard.tsx) | 597 | Componente React de boards; presentación y eventos del flujo. Adaptadores/RPC deciden permisos. |
| [src/components/boards/ProjectCard.tsx](../../src/components/boards/ProjectCard.tsx) | 192 | Componente React de boards; presentación y eventos del flujo. Adaptadores/RPC deciden permisos. |
| [src/components/boards/ProjectListView.tsx](../../src/components/boards/ProjectListView.tsx) | 113 | Componente React de boards; presentación y eventos del flujo. Adaptadores/RPC deciden permisos. |
| [src/components/boards/RoadmapView.tsx](../../src/components/boards/RoadmapView.tsx) | 194 | Componente React de boards; presentación y eventos del flujo. Adaptadores/RPC deciden permisos. |
| [src/components/boards/TableView.tsx](../../src/components/boards/TableView.tsx) | 216 | Componente React de boards; presentación y eventos del flujo. Adaptadores/RPC deciden permisos. |
| [src/components/client/ClientHome.tsx](../../src/components/client/ClientHome.tsx) | 250 | Componente React de client; presentación y eventos del flujo. Adaptadores/RPC deciden permisos. |
| [src/components/client/ClientLaunch.tsx](../../src/components/client/ClientLaunch.tsx) | 90 | Componente React de client; presentación y eventos del flujo. Adaptadores/RPC deciden permisos. |
| [src/components/client/ClientNewTicket.tsx](../../src/components/client/ClientNewTicket.tsx) | 53 | Componente React de client; presentación y eventos del flujo. Adaptadores/RPC deciden permisos. |
| [src/components/client/ClientTicketDetail.tsx](../../src/components/client/ClientTicketDetail.tsx) | 97 | Componente React de client; presentación y eventos del flujo. Adaptadores/RPC deciden permisos. |
| [src/components/client/ClientWorkspace.tsx](../../src/components/client/ClientWorkspace.tsx) | 134 | Componente React de client; presentación y eventos del flujo. Adaptadores/RPC deciden permisos. Exporta: `useClientSession`. |
| [src/components/client/MockBanner.tsx](../../src/components/client/MockBanner.tsx) | 11 | Componente React de client; presentación y eventos del flujo. Adaptadores/RPC deciden permisos. |
| [src/components/client/MyTickets.tsx](../../src/components/client/MyTickets.tsx) | 113 | Componente React de client; presentación y eventos del flujo. Adaptadores/RPC deciden permisos. Exporta: `shortDate`. |
| [src/components/dashboard/DashboardView.tsx](../../src/components/dashboard/DashboardView.tsx) | 355 | Componente React de dashboard; presentación y eventos del flujo. Adaptadores/RPC deciden permisos. |
| [src/components/metrics/MetricState.tsx](../../src/components/metrics/MetricState.tsx) | 12 | Componente React de metrics; presentación y eventos del flujo. Adaptadores/RPC deciden permisos. |
| [src/components/metrics/RequesterUrgencySummary.tsx](../../src/components/metrics/RequesterUrgencySummary.tsx) | 35 | Componente React de metrics; presentación y eventos del flujo. Adaptadores/RPC deciden permisos. |
| [src/components/metrics/UrgencyStatsPanel.tsx](../../src/components/metrics/UrgencyStatsPanel.tsx) | 98 | Componente React de metrics; presentación y eventos del flujo. Adaptadores/RPC deciden permisos. |
| [src/components/notifications/NotificationBell.tsx](../../src/components/notifications/NotificationBell.tsx) | 125 | Componente React de notifications; presentación y eventos del flujo. Adaptadores/RPC deciden permisos. |
| [src/components/projects/BoardDialogs.tsx](../../src/components/projects/BoardDialogs.tsx) | 131 | Componente React de projects; presentación y eventos del flujo. Adaptadores/RPC deciden permisos. Exporta: `DoneConfirmDialog`, `BlockDialog`, `ReopenDialog`. |
| [src/components/projects/ChecklistSection.tsx](../../src/components/projects/ChecklistSection.tsx) | 220 | Componente React de projects; presentación y eventos del flujo. Adaptadores/RPC deciden permisos. |
| [src/components/projects/CommentsSection.tsx](../../src/components/projects/CommentsSection.tsx) | 230 | Componente React de projects; presentación y eventos del flujo. Adaptadores/RPC deciden permisos. |
| [src/components/projects/EvidenceSection.tsx](../../src/components/projects/EvidenceSection.tsx) | 76 | Componente React de projects; presentación y eventos del flujo. Adaptadores/RPC deciden permisos. |
| [src/components/projects/NewProjectModal.tsx](../../src/components/projects/NewProjectModal.tsx) | 200 | Componente React de projects; presentación y eventos del flujo. Adaptadores/RPC deciden permisos. |
| [src/components/projects/ProjectModal.tsx](../../src/components/projects/ProjectModal.tsx) | 393 | Componente React de projects; presentación y eventos del flujo. Adaptadores/RPC deciden permisos. |
| [src/components/requests/AttachmentPicker.tsx](../../src/components/requests/AttachmentPicker.tsx) | 93 | Componente React de requests; presentación y eventos del flujo. Adaptadores/RPC deciden permisos. |
| [src/components/requests/PlannerImportModal.tsx](../../src/components/requests/PlannerImportModal.tsx) | 380 | Componente React de requests; presentación y eventos del flujo. Adaptadores/RPC deciden permisos. |
| [src/components/requests/PublicLanding.tsx](../../src/components/requests/PublicLanding.tsx) | 187 | Componente React de requests; presentación y eventos del flujo. Adaptadores/RPC deciden permisos. |
| [src/components/requests/PublicRequestForm.tsx](../../src/components/requests/PublicRequestForm.tsx) | 231 | Componente React de requests; presentación y eventos del flujo. Adaptadores/RPC deciden permisos. Exporta: `ClientFormConfig`. |
| [src/components/requests/RequestInbox.tsx](../../src/components/requests/RequestInbox.tsx) | 311 | Componente React de requests; presentación y eventos del flujo. Adaptadores/RPC deciden permisos. |
| [src/components/requests/RequestTimeline.tsx](../../src/components/requests/RequestTimeline.tsx) | 146 | Componente React de requests; presentación y eventos del flujo. Adaptadores/RPC deciden permisos. |
| [src/components/requests/PortalTracking.tsx](../../src/components/requests/PortalTracking.tsx) | 122 | Seguimiento público integrado en la tarjeta «Rastrear Solicitud» del portal: solo número REQ y estado general (`operations.trackRequest`). Sustituye a `RequestTracking.tsx` (retirado el 23/11/2026). |
| [src/components/requests/RequestValidationModal.tsx](../../src/components/requests/RequestValidationModal.tsx) | 288 | Componente React de requests; presentación y eventos del flujo. Adaptadores/RPC deciden permisos. |
| [src/components/ui/AreaInput.tsx](../../src/components/ui/AreaInput.tsx) | 39 | Componente React de ui; presentación y eventos del flujo. Adaptadores/RPC deciden permisos. |
| [src/components/ui/BrandLogo.tsx](../../src/components/ui/BrandLogo.tsx) | 35 | Componente React de ui; presentación y eventos del flujo. Adaptadores/RPC deciden permisos. |
| [src/components/ui/BuildVersion.tsx](../../src/components/ui/BuildVersion.tsx) | 13 | Componente React de ui; presentación y eventos del flujo. Adaptadores/RPC deciden permisos. |
| [src/components/ui/Toaster.tsx](../../src/components/ui/Toaster.tsx) | 43 | Componente React de ui; presentación y eventos del flujo. Adaptadores/RPC deciden permisos. |
| [src/dev/client-portal-mock.ts](../../src/dev/client-portal-mock.ts) | 160 | Simulador DEV con datos ficticios; no backend productivo. Exporta: `MOCK_PRODUCTS`, `MOCK_RUC`, `MOCK_RUC_UNMAPPED`, `MOCK_RUC_PROVIDER_PENDING`, `MOCK_PASSWORD`, `MOCK_ENTRY`, `MOCK_TICKET_IDS`, `createMockClientTransport`. |
| [src/hooks/useAreas.ts](../../src/hooks/useAreas.ts) | 58 | Hook de consulta/suscripción/estado; revisar SDK, filtro, límite y errores. Exporta: `Area`, `useAreas`. |
| [src/hooks/useAuth.ts](../../src/hooks/useAuth.ts) | 15 | Hook de consulta/suscripción/estado; revisar SDK, filtro, límite y errores. Exporta: `useAuth`. |
| [src/hooks/useBoardTicket.ts](../../src/hooks/useBoardTicket.ts) | 15 | Hook de consulta/suscripción/estado; revisar SDK, filtro, límite y errores. Exporta: `useBoardTicket`. |
| [src/hooks/useCatalogs.ts](../../src/hooks/useCatalogs.ts) | 72 | Hook de consulta/suscripción/estado; revisar SDK, filtro, límite y errores. Exporta: `CatalogSystem`, `CatalogSubsystem`, `Studio`, `StudioCode`, `RequestType`, `CatalogArea`, `useCatalogs`, `saveCatalogRow`. |
| [src/hooks/useChecklist.ts](../../src/hooks/useChecklist.ts) | 58 | Hook de consulta/suscripción/estado; revisar SDK, filtro, límite y errores. Exporta: `useChecklist`. |
| [src/hooks/useDashboardData.ts](../../src/hooks/useDashboardData.ts) | 84 | Hook de consulta/suscripción/estado; revisar SDK, filtro, límite y errores. Exporta: `DashboardStats`, `useDashboardData`. |
| [src/hooks/useNotifications.ts](../../src/hooks/useNotifications.ts) | 74 | Hook de consulta/suscripción/estado; revisar SDK, filtro, límite y errores. Exporta: `useNotifications`. |
| [src/hooks/usePendingCount.ts](../../src/hooks/usePendingCount.ts) | 29 | Hook de consulta/suscripción/estado; revisar SDK, filtro, límite y errores. Exporta: `usePendingCount`. |
| [src/hooks/useProjects.ts](../../src/hooks/useProjects.ts) | 138 | Hook de consulta/suscripción/estado; revisar SDK, filtro, límite y errores. Exporta: `useProjects`. |
| [src/hooks/useRequests.ts](../../src/hooks/useRequests.ts) | 44 | Hook de consulta/suscripción/estado; revisar SDK, filtro, límite y errores. Exporta: `useRequests`. |
| [src/hooks/useUsers.ts](../../src/hooks/useUsers.ts) | 72 | Hook de consulta/suscripción/estado; revisar SDK, filtro, límite y errores. Exporta: `useUsers`. |
| [src/index.css](../../src/index.css) | 17 | Arranque, tipos, estilos o marca de la SPA. |
| [src/lib/access.ts](../../src/lib/access.ts) | 19 | Adaptador o reglas de frontera del frontend; exports y llamadas indicadas abajo. Exporta: `canEdit`, `canManageProfile`, `loadActiveProfile`. |
| [src/lib/account-admin.ts](../../src/lib/account-admin.ts) | 39 | Adaptador o reglas de frontera del frontend; exports y llamadas indicadas abajo. Exporta: `AccountInput`, `AccountAdminError`, `administerAccount`. |
| [src/lib/api.ts](../../src/lib/api.ts) | 10 | Adaptador o reglas de frontera del frontend; exports y llamadas indicadas abajo. Exporta: `operations`, `metrics`, `board`. |
| [src/lib/attachment-delivery.ts](../../src/lib/attachment-delivery.ts) | 75 | Adaptador o reglas de frontera del frontend; exports y llamadas indicadas abajo. Exporta: `DeliveryItem`, `DeliveryResult`, `deliverAttachments`, `BoardDeliveryResult`, `deliverBoardEvidence`. |
| [src/lib/attachment-prep.ts](../../src/lib/attachment-prep.ts) | 124 | Adaptador o reglas de frontera del frontend; exports y llamadas indicadas abajo. Exporta: `MAX_ATTACHMENTS`, `MAX_TOTAL_BYTES`, `MAX_SOURCE_IMAGE_BYTES`, `isCompressibleImage`, `LEVELS`, `PreparedAttachment`, `PreparationResult`, `Compressor`, `formatBytes`…; ver archivo para el resto. |
| [src/lib/attachments.ts](../../src/lib/attachments.ts) | 34 | Adaptador o reglas de frontera del frontend; exports y llamadas indicadas abajo. Exporta: `ATTACHMENT_BUCKET`, `ATTACHMENT_ACCEPT`, `displayAttachmentName`, `listRequestAttachments`, `uploadBoardEvidence`. |
| [src/lib/auth-controller.ts](../../src/lib/auth-controller.ts) | 72 | Adaptador o reglas de frontera del frontend; exports y llamadas indicadas abajo. Exporta: `createAuthController`. |
| [src/lib/board.ts](../../src/lib/board.ts) | 113 | Adaptador o reglas de frontera del frontend; exports y llamadas indicadas abajo. Exporta: `ADMINISTRATIVE_PHASES`, `phasesFor`, `finalPhase`, `reopenTargets`, `isClosingMove`, `needsPendingConfirmation`, `boardErrorMessage`, `createBoard`, `Board`…; ver archivo para el resto. |
| [src/lib/build-version.ts](../../src/lib/build-version.ts) | 15 | Adaptador o reglas de frontera del frontend; exports y llamadas indicadas abajo. Exporta: `formatBuildVersion`. |
| [src/lib/checklist-defaults.ts](../../src/lib/checklist-defaults.ts) | 67 | Adaptador o reglas de frontera del frontend; exports y llamadas indicadas abajo. Exporta: `DEFAULT_CHECKLIST`. |
| [src/lib/client-portal-api.ts](../../src/lib/client-portal-api.ts) | 44 | Adaptador o reglas de frontera del frontend; exports y llamadas indicadas abajo. Exporta: `CLIENT_PORTAL_LOGIN_ENABLED`, `clientPortal`, `CLIENT_PORTAL_MOCK`. |
| [src/lib/client-portal.ts](../../src/lib/client-portal.ts) | 356 | Adaptador o reglas de frontera del frontend; exports y llamadas indicadas abajo. Exporta: `AuthType`, `AUTH_TYPE_LABEL`, `isAuthType`, `ClientProduct`, `ClientIdentity`, `ClientSession`, `ClientTicketSummary`, `ClientTicketDetail`, `QuipuLogin`…; ver archivo para el resto. |
| [src/lib/client-session-store.ts](../../src/lib/client-session-store.ts) | 29 | Adaptador o reglas de frontera del frontend; exports y llamadas indicadas abajo. Exporta: `createClientSessionStore`, `clientSessionStore`. |
| [src/lib/constants.ts](../../src/lib/constants.ts) | 64 | Adaptador o reglas de frontera del frontend; exports y llamadas indicadas abajo. Exporta: `AVATAR_COLORS`, `getAvatarColor`, `getInitials`, `PRIORITY_COLORS`, `PRIORITY_LABEL`, `PRIORITY_BAR`, `PRIORITY_DOT`, `AREA_COLORS`, `PHASE_LABELS`. |
| [src/lib/metrics-adapter.ts](../../src/lib/metrics-adapter.ts) | 107 | Adaptador o reglas de frontera del frontend; exports y llamadas indicadas abajo. Exporta: `METRICS_CONTRACT`, `UrgencyRow`, `TimeAverages`, `MetricResult`, `isUrgencyRow`, `isTimeAverages`, `limaMonth`, `createMetricsAdapter`, `MetricsAdapter`…; ver archivo para el resto. |
| [src/lib/notifications.ts](../../src/lib/notifications.ts) | 19 | Adaptador o reglas de frontera del frontend; exports y llamadas indicadas abajo. Exporta: `sendNotification`. |
| [src/lib/operations.ts](../../src/lib/operations.ts) | 120 | Adaptador o reglas de frontera del frontend; exports y llamadas indicadas abajo. Exporta: `RpcClient`, `SubmissionReceipt`, `RequestClassification`, `PublicTracking`, `InternalClassification`, `InternalProjectInput`, `ApprovalInput`, `createOperations`. RPC: `admin_update_user`, `approve_request`, `assign_request_studio_code`, `classify_request`, `create_internal_project`, `reject_request`, `reject_request_with_notes`, `start_request_review`, `track_request_status`, `update_request_details`. |
| [src/lib/request-status.ts](../../src/lib/request-status.ts) | 21 | Adaptador o reglas de frontera del frontend; exports y llamadas indicadas abajo. Exporta: `GeneralStatus`, `GENERAL_STATUS`, `MAIN_PATH`, `isGeneralStatus`, `limaDateTime`. |
| [src/lib/rpc-attempt.ts](../../src/lib/rpc-attempt.ts) | 25 | Adaptador o reglas de frontera del frontend; exports y llamadas indicadas abajo. Exporta: `createRpcAttempt`, `RpcAttempt`. |
| [src/lib/supabase-config.ts](../../src/lib/supabase-config.ts) | 35 | Adaptador o reglas de frontera del frontend; exports y llamadas indicadas abajo. Exporta: `readSupabaseConfig`, `readClientLoginDevOrigin`. |
| [src/lib/supabase-errors.ts](../../src/lib/supabase-errors.ts) | 47 | Adaptador o reglas de frontera del frontend; exports y llamadas indicadas abajo. Exporta: `errorMessage`, `requireData`, `requireSuccess`, `CommittedWriteError`. |
| [src/lib/supabase.ts](../../src/lib/supabase.ts) | 25 | Adaptador o reglas de frontera del frontend; exports y llamadas indicadas abajo. Exporta: `supabase`. |
| [src/lib/ticket-export.ts](../../src/lib/ticket-export.ts) | 132 | Adaptador o reglas de frontera del frontend; exports y llamadas indicadas abajo. Exporta: `PERFORMANCE_PAGE_SIZE`, `PROJECT_CHUNK_SIZE`, `ExportClient`, `ExportError`, `fetchDonePerformance`, `ProjectInfo`, `fetchProjects`, `COMPLETED_HEADERS`, `completedRows`…; ver archivo para el resto. RPC: `get_ticket_performance`. |
| [src/lib/toast.ts](../../src/lib/toast.ts) | 23 | Adaptador o reglas de frontera del frontend; exports y llamadas indicadas abajo. Exporta: `toast`, `subscribeToast`. |
| ~~src/lib/tracking-handoff.ts~~ (retirado el 23/11/2026, sin consumidores) | — | Adaptador o reglas de frontera del frontend; exports y llamadas indicadas abajo. Exporta: `handoffTracking`, `peekTrackingNumber`, `clearTrackingNumber`. |
| [src/main.tsx](../../src/main.tsx) | 25 | Arranque, tipos, estilos o marca de la SPA. |
| [src/theme/brand.ts](../../src/theme/brand.ts) | 54 | Arranque, tipos, estilos o marca de la SPA. Exporta: `BRAND_NAVY`, `BRAND_GOLD`, `BRAND_REFERENCE`, `BRAND`. |
| [src/types/database.types.ts](../../src/types/database.types.ts) | 115 | Arranque, tipos, estilos o marca de la SPA. Exporta: `User`, `Request`, `Project`, `ProjectFlow`, `ChecklistItem`, `Comment`, `Notification`, `ActivityLog`. |
| [src/vite-env.d.ts](../../src/vite-env.d.ts) | 4 | Arranque, tipos, estilos o marca de la SPA. |
| [supabase/bootstrap/superadmin_dashboard.sql](../../supabase/bootstrap/superadmin_dashboard.sql) | 36 | Artefacto SQL/script legado en raíz; NO forma parte de migraciones M1–M15 ni arranque normal. |
| [supabase/config.toml](../../supabase/config.toml) | 43 | Configuración de compilación, dependencias o despliegue; no contiene credenciales privadas. |
| [supabase/functions/_shared/account-admin.mjs](../../supabase/functions/_shared/account-admin.mjs) | 112 | Edge/handler/configuración privada de servidor; nunca bundle frontend. Exporta: `accountAdminHandler`. |
| [supabase/functions/_shared/client-login-config.mjs](../../supabase/functions/_shared/client-login-config.mjs) | 55 | Edge/handler/configuración privada de servidor; nunca bundle frontend. Exporta: `resolveProviderConfig`. |
| [supabase/functions/_shared/client-login.mjs](../../supabase/functions/_shared/client-login.mjs) | 256 | Edge/handler/configuración privada de servidor; nunca bundle frontend. Exporta: `validateProviderContract`, `adaptProviderResponse`, `digestToken`, `clientLoginHandler`. |
| [supabase/functions/_shared/client-provider-contracts.mjs](../../supabase/functions/_shared/client-provider-contracts.mjs) | 28 | Edge/handler/configuración privada de servidor; nunca bundle frontend. Exporta: `quipuDevelopmentContract`, `quipufacDevelopmentContract`. |
| [supabase/functions/admin-users/index.ts](../../supabase/functions/admin-users/index.ts) | 9 | Edge/handler/configuración privada de servidor; nunca bundle frontend. |
| [supabase/functions/client-login/index.ts](../../supabase/functions/client-login/index.ts) | 20 | Edge/handler/configuración privada de servidor; nunca bundle frontend. |
| [supabase/migrations/20261117000100_schema.sql](../../supabase/migrations/20261117000100_schema.sql) | 189 | Migración versionada; orden y permisos en DATABASE_SPEC. No editar aplicada. |
| [supabase/migrations/20261117000200_security.sql](../../supabase/migrations/20261117000200_security.sql) | 108 | Migración versionada; orden y permisos en DATABASE_SPEC. No editar aplicada. |
| [supabase/migrations/20261117000300_operations.sql](../../supabase/migrations/20261117000300_operations.sql) | 393 | Migración versionada; orden y permisos en DATABASE_SPEC. No editar aplicada. |
| [supabase/migrations/20261117000400_reference_checklists.sql](../../supabase/migrations/20261117000400_reference_checklists.sql) | 40 | Migración versionada; orden y permisos en DATABASE_SPEC. No editar aplicada. |
| [supabase/migrations/20261118000100_account_administration.sql](../../supabase/migrations/20261118000100_account_administration.sql) | 166 | Migración versionada; orden y permisos en DATABASE_SPEC. No editar aplicada. |
| [supabase/migrations/20261118000200_areas.sql](../../supabase/migrations/20261118000200_areas.sql) | 43 | Migración versionada; orden y permisos en DATABASE_SPEC. No editar aplicada. |
| [supabase/migrations/20261118000300_ticket_catalogs.sql](../../supabase/migrations/20261118000300_ticket_catalogs.sql) | 285 | Migración versionada; orden y permisos en DATABASE_SPEC. No editar aplicada. |
| [supabase/migrations/20261118000400_request_intake.sql](../../supabase/migrations/20261118000400_request_intake.sql) | 247 | Migración versionada; orden y permisos en DATABASE_SPEC. No editar aplicada. |
| [supabase/migrations/20261118000500_ticket_security.sql](../../supabase/migrations/20261118000500_ticket_security.sql) | 239 | Migración versionada; orden y permisos en DATABASE_SPEC. No editar aplicada. |
| [supabase/migrations/20261118000600_request_tracking.sql](../../supabase/migrations/20261118000600_request_tracking.sql) | 178 | Migración versionada; orden y permisos en DATABASE_SPEC. No editar aplicada. |
| [supabase/migrations/20261118000700_business_metrics.sql](../../supabase/migrations/20261118000700_business_metrics.sql) | 309 | Migración versionada; orden y permisos en DATABASE_SPEC. No editar aplicada. |
| [supabase/migrations/20261118000800_board_operations.sql](../../supabase/migrations/20261118000800_board_operations.sql) | 640 | Migración versionada; orden y permisos en DATABASE_SPEC. No editar aplicada. |
| [supabase/migrations/20261119000100_client_access.sql](../../supabase/migrations/20261119000100_client_access.sql) | 307 | Migración versionada; orden y permisos en DATABASE_SPEC. No editar aplicada. |
| [supabase/migrations/20261119000200_client_login_throttle.sql](../../supabase/migrations/20261119000200_client_login_throttle.sql) | 43 | Migración versionada; orden y permisos en DATABASE_SPEC. No editar aplicada. |
| [supabase/migrations/20261119000300_security_request_creation.sql](../../supabase/migrations/20261119000300_security_request_creation.sql) | 99 | Migración versionada; orden y permisos en DATABASE_SPEC. No editar aplicada. |
| [supabase/recovery/account_admin_check.sql](../../supabase/recovery/account_admin_check.sql) | 36 | Comprobación o compensación histórica de alcance acotado; no instalador automático. |
| [supabase/recovery/areas_check.sql](../../supabase/recovery/areas_check.sql) | 11 | Comprobación o compensación histórica de alcance acotado; no instalador automático. |
| [supabase/recovery/business_metrics_check.sql](../../supabase/recovery/business_metrics_check.sql) | 14 | Comprobación o compensación histórica de alcance acotado; no instalador automático. |
| [supabase/recovery/compensate_01.sql](../../supabase/recovery/compensate_01.sql) | 10 | Comprobación o compensación histórica de alcance acotado; no instalador automático. |
| [supabase/recovery/compensate_02.sql](../../supabase/recovery/compensate_02.sql) | 29 | Comprobación o compensación histórica de alcance acotado; no instalador automático. |
| [supabase/recovery/compensate_03.sql](../../supabase/recovery/compensate_03.sql) | 48 | Comprobación o compensación histórica de alcance acotado; no instalador automático. |
| [supabase/recovery/compensate_04.sql](../../supabase/recovery/compensate_04.sql) | 9 | Comprobación o compensación histórica de alcance acotado; no instalador automático. |
| [supabase/recovery/connection_check.sql](../../supabase/recovery/connection_check.sql) | 33 | Comprobación o compensación histórica de alcance acotado; no instalador automático. |
| [supabase/recovery/inventory.sql](../../supabase/recovery/inventory.sql) | 42 | Comprobación o compensación histórica de alcance acotado; no instalador automático. |
| [supabase/recovery/request_intake_check.sql](../../supabase/recovery/request_intake_check.sql) | 20 | Comprobación o compensación histórica de alcance acotado; no instalador automático. |
| [supabase/recovery/request_tracking_check.sql](../../supabase/recovery/request_tracking_check.sql) | 17 | Comprobación o compensación histórica de alcance acotado; no instalador automático. |
| [supabase/recovery/ticket_catalogs_check.sql](../../supabase/recovery/ticket_catalogs_check.sql) | 28 | Comprobación o compensación histórica de alcance acotado; no instalador automático. |
| [supabase/recovery/ticket_security_check.sql](../../supabase/recovery/ticket_security_check.sql) | 26 | Comprobación o compensación histórica de alcance acotado; no instalador automático. |
| [supabase/tests/account_admin_local.py](../../supabase/tests/account_admin_local.py) | 107 | Prueba PostgreSQL aislada/fixtures, no servicio Supabase alojado. |
| [supabase/tests/areas_local.py](../../supabase/tests/areas_local.py) | 94 | Prueba PostgreSQL aislada/fixtures, no servicio Supabase alojado. |
| [supabase/tests/behavior.sql](../../supabase/tests/behavior.sql) | 232 | Prueba PostgreSQL aislada/fixtures, no servicio Supabase alojado. |
| [supabase/tests/blockers_local.py](../../supabase/tests/blockers_local.py) | 270 | Prueba PostgreSQL aislada/fixtures, no servicio Supabase alojado. |
| [supabase/tests/board_frontend_local.py](../../supabase/tests/board_frontend_local.py) | 204 | Prueba PostgreSQL aislada/fixtures, no servicio Supabase alojado. |
| [supabase/tests/board_operations_local.py](../../supabase/tests/board_operations_local.py) | 345 | Prueba PostgreSQL aislada/fixtures, no servicio Supabase alojado. |
| [supabase/tests/business_metrics_local.py](../../supabase/tests/business_metrics_local.py) | 289 | Prueba PostgreSQL aislada/fixtures, no servicio Supabase alojado. |
| [supabase/tests/client_access_local.py](../../supabase/tests/client_access_local.py) | 242 | Prueba PostgreSQL aislada/fixtures, no servicio Supabase alojado. |
| [supabase/tests/client_login_throttle_local.py](../../supabase/tests/client_login_throttle_local.py) | 107 | Prueba PostgreSQL aislada/fixtures, no servicio Supabase alojado. |
| [supabase/tests/integrated_security_client_flow_local.py](../../supabase/tests/integrated_security_client_flow_local.py) | 197 | Prueba PostgreSQL aislada/fixtures, no servicio Supabase alojado. |
| [supabase/tests/metrics_cohort_local.py](../../supabase/tests/metrics_cohort_local.py) | 130 | Prueba PostgreSQL aislada/fixtures, no servicio Supabase alojado. |
| [supabase/tests/recovery_local.py](../../supabase/tests/recovery_local.py) | 329 | Prueba PostgreSQL aislada/fixtures, no servicio Supabase alojado. |
| [supabase/tests/request_intake_local.py](../../supabase/tests/request_intake_local.py) | 134 | Prueba PostgreSQL aislada/fixtures, no servicio Supabase alojado. |
| [supabase/tests/request_tracking_local.py](../../supabase/tests/request_tracking_local.py) | 147 | Prueba PostgreSQL aislada/fixtures, no servicio Supabase alojado. |
| [supabase/tests/run_local.py](../../supabase/tests/run_local.py) | 187 | Prueba PostgreSQL aislada/fixtures, no servicio Supabase alojado. |
| [supabase/tests/security_request_creation_local.py](../../supabase/tests/security_request_creation_local.py) | 389 | Prueba PostgreSQL aislada/fixtures, no servicio Supabase alojado. |
| [supabase/tests/support/auth_stub.sql](../../supabase/tests/support/auth_stub.sql) | 16 | Prueba PostgreSQL aislada/fixtures, no servicio Supabase alojado. |
| [supabase/tests/support/pgrst_watchers_2b3d.sql](../../supabase/tests/support/pgrst_watchers_2b3d.sql) | 21 | Prueba PostgreSQL aislada/fixtures, no servicio Supabase alojado. |
| [supabase/tests/ticket_attachment_limits_local.py](../../supabase/tests/ticket_attachment_limits_local.py) | 142 | Prueba PostgreSQL aislada/fixtures, no servicio Supabase alojado. |
| [supabase/tests/ticket_catalogs_local.py](../../supabase/tests/ticket_catalogs_local.py) | 121 | Prueba PostgreSQL aislada/fixtures, no servicio Supabase alojado. |
| [supabase/tests/ticket_security_local.py](../../supabase/tests/ticket_security_local.py) | 156 | Prueba PostgreSQL aislada/fixtures, no servicio Supabase alojado. |
| [tags_cleanup.sql](../../tags_cleanup.sql) | 24 | Artefacto SQL/script legado en raíz; NO forma parte de migraciones M1–M15 ni arranque normal. |
| [tags_migration.sql](../../tags_migration.sql) | 50 | Artefacto SQL/script legado en raíz; NO forma parte de migraciones M1–M15 ni arranque normal. |
| [tailwind.config.ts](../../tailwind.config.ts) | 25 | Configuración de compilación, dependencias o despliegue; no contiene credenciales privadas. |
| [tests/account-admin.test.mjs](../../tests/account-admin.test.mjs) | 105 | Prueba unitaria, contrato o arnés de scripts; no evidencia remota por sí sola. |
| [tests/attachment-integration.test.mjs](../../tests/attachment-integration.test.mjs) | 80 | Prueba unitaria, contrato o arnés de scripts; no evidencia remota por sí sola. |
| [tests/attachment-prep.test.mjs](../../tests/attachment-prep.test.mjs) | 70 | Prueba unitaria, contrato o arnés de scripts; no evidencia remota por sí sola. |
| [tests/board-frontend.test.mjs](../../tests/board-frontend.test.mjs) | 129 | Prueba unitaria, contrato o arnés de scripts; no evidencia remota por sí sola. |
| [tests/board-operations-client.test.mjs](../../tests/board-operations-client.test.mjs) | 51 | Prueba unitaria, contrato o arnés de scripts; no evidencia remota por sí sola. |
| [tests/board-recovery.test.mjs](../../tests/board-recovery.test.mjs) | 103 | Prueba unitaria, contrato o arnés de scripts; no evidencia remota por sí sola. |
| [tests/build-version.test.mjs](../../tests/build-version.test.mjs) | 24 | Prueba unitaria, contrato o arnés de scripts; no evidencia remota por sí sola. |
| [tests/client-access-contract.types.mts](../../tests/client-access-contract.types.mts) | 27 | Prueba unitaria, contrato o arnés de scripts; no evidencia remota por sí sola. |
| [tests/client-login-config.test.mjs](../../tests/client-login-config.test.mjs) | 67 | Prueba unitaria, contrato o arnés de scripts; no evidencia remota por sí sola. |
| [tests/client-login-failures.test.mjs](../../tests/client-login-failures.test.mjs) | 60 | Prueba unitaria, contrato o arnés de scripts; no evidencia remota por sí sola. |
| [tests/client-login-throttle.test.mjs](../../tests/client-login-throttle.test.mjs) | 95 | Prueba unitaria, contrato o arnés de scripts; no evidencia remota por sí sola. |
| [tests/client-login.test.mjs](../../tests/client-login.test.mjs) | 272 | Prueba unitaria, contrato o arnés de scripts; no evidencia remota por sí sola. |
| [tests/client-portal.test.mjs](../../tests/client-portal.test.mjs) | 269 | Prueba unitaria, contrato o arnés de scripts; no evidencia remota por sí sola. |
| [tests/consumers.test.mjs](../../tests/consumers.test.mjs) | 296 | Prueba unitaria, contrato o arnés de scripts; no evidencia remota por sí sola. |
| [tests/integration/database-client-flows.mjs](../../tests/integration/database-client-flows.mjs) | 176 | Puente de adaptadores reales a PostgreSQL local con identidades/Storage fixture. |
| [tests/metrics-adapter.test.mjs](../../tests/metrics-adapter.test.mjs) | 73 | Prueba unitaria, contrato o arnés de scripts; no evidencia remota por sí sola. |
| [tests/quipufac-login.test.mjs](../../tests/quipufac-login.test.mjs) | 132 | Prueba unitaria, contrato o arnés de scripts; no evidencia remota por sí sola. |
| [tests/test_board_activation.py](../../tests/test_board_activation.py) | 45 | Prueba unitaria, contrato o arnés de scripts; no evidencia remota por sí sola. |
| [tests/test_board_dry_run.py](../../tests/test_board_dry_run.py) | 37 | Prueba unitaria, contrato o arnés de scripts; no evidencia remota por sí sola. |
| [tests/test_board_smoke_resume.py](../../tests/test_board_smoke_resume.py) | 54 | Prueba unitaria, contrato o arnés de scripts; no evidencia remota por sí sola. |
| [tests/test_cli_connection.py](../../tests/test_cli_connection.py) | 142 | Prueba unitaria, contrato o arnés de scripts; no evidencia remota por sí sola. |
| [tests/test_client_login_local_launcher.py](../../tests/test_client_login_local_launcher.py) | 68 | Prueba unitaria, contrato o arnés de scripts; no evidencia remota por sí sola. |
| [tests/test_client_m13_activation.py](../../tests/test_client_m13_activation.py) | 55 | Prueba unitaria, contrato o arnés de scripts; no evidencia remota por sí sola. |
| [tests/test_inventory_import.py](../../tests/test_inventory_import.py) | 104 | Prueba unitaria, contrato o arnés de scripts; no evidencia remota por sí sola. |
| [tests/test_migration_application.py](../../tests/test_migration_application.py) | 86 | Prueba unitaria, contrato o arnés de scripts; no evidencia remota por sí sola. |
| [tests/test_probe_client_login.py](../../tests/test_probe_client_login.py) | 89 | Prueba unitaria, contrato o arnés de scripts; no evidencia remota por sí sola. |
| [tests/test_supabase_preparation.py](../../tests/test_supabase_preparation.py) | 158 | Prueba unitaria, contrato o arnés de scripts; no evidencia remota por sí sola. |
| [tests/ticket-attachment-limits.test.mjs](../../tests/ticket-attachment-limits.test.mjs) | 61 | Prueba unitaria, contrato o arnés de scripts; no evidencia remota por sí sola. |
| [tests/ticket-export.test.mjs](../../tests/ticket-export.test.mjs) | 171 | Prueba unitaria, contrato o arnés de scripts; no evidencia remota por sí sola. RPC: `get_ticket_performance`. |
| [tests/ticket-metrics-client.test.mjs](../../tests/ticket-metrics-client.test.mjs) | 32 | Prueba unitaria, contrato o arnés de scripts; no evidencia remota por sí sola. |
| [tests/ticket-security-client.test.mjs](../../tests/ticket-security-client.test.mjs) | 49 | Prueba unitaria, contrato o arnés de scripts; no evidencia remota por sí sola. |
| [tests/ui/fixture-server.mjs](../../tests/ui/fixture-server.mjs) | 153 | React y Chromium con REST/Auth/cliente simulados. Exporta: `SIMULATED_PASSWORD`, `STAFF`, `performanceScenario`, `startFixtureServer`. |
| [tests/ui/portal-navigation.ui.test.mjs](../../tests/ui/portal-navigation.ui.test.mjs) | 435 | React y Chromium con REST/Auth/cliente simulados. |
| [tsconfig.json](../../tsconfig.json) | 21 | Configuración de compilación, dependencias o despliegue; no contiene credenciales privadas. |
| [tsconfig.node.json](../../tsconfig.node.json) | 10 | Configuración de compilación, dependencias o despliegue; no contiene credenciales privadas. |
| [vercel.json](../../vercel.json) | 25 | Configuración de compilación, dependencias o despliegue; no contiene credenciales privadas. |
| [vite.config.ts](../../vite.config.ts) | 17 | Configuración de compilación, dependencias o despliegue; no contiene credenciales privadas. |

## Inventario de JSON de validación

Cada JSON tiene alcance/fecha propios. No sobrescribir sus estados históricos. No sumar casos de varias ejecuciones. La evidencia de M15 20/11 se incorpora de forma depurada en un Markdown, conservando el original privado.

| Archivo | Campos de alcance / validación |
|---|---|
| [docs/validation/account-administration-local.json](../../docs/validation/account-administration-local.json) | `passed`, `synthetic_auth_stub_only`, `remote_sql_executed`, `new_endpoint_tests_passed`, `fifth_migration_applied_remotely`, `bootstrap_executed_remotely`, `first_four_migrations_unchanged`, `git_commit_limitation` |
| [docs/validation/account-administration-remote.json](../../docs/validation/account-administration-remote.json) | `migration` |
| [docs/validation/areas-local.json](../../docs/validation/areas-local.json) | `migration`, `passed`, `synthetic_auth_stub_only`, `remote_sql_executed` |
| [docs/validation/areas-remote.json](../../docs/validation/areas-remote.json) | `migration` |
| [docs/validation/attachments-integration.json](../../docs/validation/attachments-integration.json) | `previous_eight_migrations_unchanged`, `migration_9_applied_remotely`, `tests`, `remote_sql_executed` |
| [docs/validation/board-frontend-local.json](../../docs/validation/board-frontend-local.json) | `migration`, `migration_sha256`, `passed`, `synthetic_auth_stub_only`, `remote_sql_executed`, `scope` |
| [docs/validation/board-m12-activation.json](../../docs/validation/board-m12-activation.json) | `migration`, `status`, `migration_plan_unchanged_from_dry_run` |
| [docs/validation/board-m12-rpc-smoke-diagnosis.json](../../docs/validation/board-m12-rpc-smoke-diagnosis.json) | `status`, `migration`, `rpc_scope`, `migration_resent`, `tests_repeated`, `new_regression_tests_passed` |
| [docs/validation/board-main-integration.json](../../docs/validation/board-main-integration.json) | `migrations_unchanged`, `remote_checks_reused` |
| [docs/validation/board-operations-local.json](../../docs/validation/board-operations-local.json) | `migration`, `migration_sha256`, `passed`, `synthetic_auth_stub_only`, `remote_sql_executed` |
| [docs/validation/board-recovery-dry-run.json](../../docs/validation/board-recovery-dry-run.json) | `status`, `migration_sha256` |
| [docs/validation/board-recovery-local.json](../../docs/validation/board-recovery-local.json) | `frontend_tests`, `dry_run_script_tests`, `migration_sha256`, `remote_applied` |
| [docs/validation/business-metrics-local.json](../../docs/validation/business-metrics-local.json) | `migration`, `migration_sha256`, `passed`, `synthetic_auth_stub_only`, `remote_sql_executed` |
| [docs/validation/business-metrics-remote.json](../../docs/validation/business-metrics-remote.json) | `migration` |
| [docs/validation/client-access-local.json](../../docs/validation/client-access-local.json) | `migration`, `migration_sha256`, `passed`, `synthetic_auth_and_storage_only`, `remote_sql_executed`, `node_portal_and_login_tests_passed`, `activation_guard_tests_passed`, `previous_twelve_migrations_unchanged` |
| [docs/validation/client-login-dev-api.json](../../docs/validation/client-login-dev-api.json) | `validation`, `migrations_modified` |
| [docs/validation/client-login-e2e-20261119.json](../../docs/validation/client-login-e2e-20261119.json) | `exactly_two_test_requests`, `tests`, `browser`, `migrations_applied` |
| [docs/validation/client-login-local-integration.json](../../docs/validation/client-login-local-integration.json) | `browser`, `live_browser_checks`, `launcher_tests`, `real_browser_authentication_verified`, `migrations_changed_or_applied` |
| [docs/validation/client-m13-activation.json](../../docs/validation/client-m13-activation.json) | `status`, `previous_migrations`, `remote_test_accounts_created`, `remote_test_tickets_created`, `node_portal_login_tests`, `activation_guard_tests` |
| [docs/validation/continuacion-af3259f-baseline.json](../../docs/validation/continuacion-af3259f-baseline.json) | `migrations`, `remote_sql_executed`, `verdict`, `new_offline_importer_tests`, `previous_tests_repeated`, `local_or_remote_sql_executed`, `remote_mutations`, `migration_manifest_matches_2b3d`, `verdict_reason`, `remote_application` |
| [docs/validation/fase-2b2-cli.json](../../docs/validation/fase-2b2-cli.json) | `installation_scope`, `db_major_remote_verified`, `remote_cli_commands_executed`, `cli_config_validation` |
| [docs/validation/fase-2b2-local-ready.json](../../docs/validation/fase-2b2-local-ready.json) | `scope` |
| [docs/validation/fase-2b2-migrations.json](../../docs/validation/fase-2b2-migrations.json) | `migrations` |
| [docs/validation/fase-2b3-catalog-preflight-review.json](../../docs/validation/fase-2b3-catalog-preflight-review.json) | `sql_status`, `reserved_names_match_recovery_scope`, `metadata_scope`, `remote_results_present`, `protected_sources_and_migrations_unchanged` |
| [docs/validation/fase-2b3a-connectivity.json](../../docs/validation/fase-2b3a-connectivity.json) | `prior_http_status`, `migrations`, `remote_sql_executed`, `remote_mutations_performed` |
| [docs/validation/fase-2b3b-recovery.json](../../docs/validation/fase-2b3b-recovery.json) | `original_migrations`, `tests`, `passed`, `remote_sql_executed`, `remote_mutations_performed`, `prior_72_sql_tests_repeated`, `prior_19_integration_tests_repeated`, `limitations` |
| [docs/validation/fase-2b3b-review.json](../../docs/validation/fase-2b3b-review.json) | `verdict`, `remote_operations` |
| [docs/validation/fase-2b3c-organizational-review.json](../../docs/validation/fase-2b3c-organizational-review.json) | `prepared_migrations`, `migration_edits_required` |
| [docs/validation/fase-2b3d-local.json](../../docs/validation/fase-2b3d-local.json) | `tests`, `passed`, `limits`, `remote_sql_executed` |
| [docs/validation/fase-2b3d-migrations.json](../../docs/validation/fase-2b3d-migrations.json) | `migrations`, `remote_execution_authorized` |
| [docs/validation/fase-2b3d-review.json](../../docs/validation/fase-2b3d-review.json) | `limitations`, `verdict`, `validation` |
| [docs/validation/integration-security-client-flow.json](../../docs/validation/integration-security-client-flow.json) | `verdict`, `acceptance_scope`, `remote_operations` |
| [docs/validation/integration-security-client-flow/board-frontend-local.json](../../docs/validation/integration-security-client-flow/board-frontend-local.json) | `migration`, `migration_sha256`, `passed`, `synthetic_auth_stub_only`, `remote_sql_executed`, `scope` |
| [docs/validation/integration-security-client-flow/board-operations-local.json](../../docs/validation/integration-security-client-flow/board-operations-local.json) | `migration`, `migration_sha256`, `passed`, `synthetic_auth_stub_only`, `remote_sql_executed` |
| [docs/validation/integration-security-client-flow/business-metrics-local.json](../../docs/validation/integration-security-client-flow/business-metrics-local.json) | `migration`, `migration_sha256`, `passed`, `synthetic_auth_stub_only`, `remote_sql_executed` |
| [docs/validation/integration-security-client-flow/client-access-local.json](../../docs/validation/integration-security-client-flow/client-access-local.json) | `migration`, `migration_sha256`, `passed`, `synthetic_auth_and_storage_only`, `remote_sql_executed` |
| [docs/validation/integration-security-client-flow/integrated-security-client-flow-clean.json](../../docs/validation/integration-security-client-flow/integrated-security-client-flow-clean.json) | `passed`, `migration_sha256`, `remote_operations` |
| [docs/validation/integration-security-client-flow/integrated-security-client-flow-upgrade.json](../../docs/validation/integration-security-client-flow/integrated-security-client-flow-upgrade.json) | `passed`, `migration_sha256`, `remote_operations` |
| [docs/validation/integration-security-client-flow/security-request-creation-local.json](../../docs/validation/integration-security-client-flow/security-request-creation-local.json) | `migration`, `baseline_migrations`, `migration_sha256`, `prior_migration_sha256`, `passed`, `synthetic_auth_and_storage_only`, `remote_sql_executed` |
| [docs/validation/integration-security-client-flow/ticket-attachment-limits-local.json](../../docs/validation/integration-security-client-flow/ticket-attachment-limits-local.json) | `passed`, `synthetic_storage_auth_only`, `hosted_http_upload_tested`, `remote_sql_executed` |
| [docs/validation/metrics-cohort-local.json](../../docs/validation/metrics-cohort-local.json) | `migration`, `passed`, `synthetic_data_only`, `remote_sql_executed` |
| [docs/validation/provider-failure-responses-20261119.json](../../docs/validation/provider-failure-responses-20261119.json) | Metadatos históricos; ver contenido y fecha. |
| [docs/validation/quipufac-dev-discovery.json](../../docs/validation/quipufac-dev-discovery.json) | `quipu_modified_or_retested`, `migrations_applied`, `general_tests_repeated` |
| [docs/validation/quipufac-login-dev-api.json](../../docs/validation/quipufac-login-dev-api.json) | `migrations_changed_or_applied` |
| [docs/validation/request-intake-local.json](../../docs/validation/request-intake-local.json) | `migration`, `passed`, `synthetic_auth_stub_only`, `remote_sql_executed` |
| [docs/validation/request-intake-remote.json](../../docs/validation/request-intake-remote.json) | `migration` |
| [docs/validation/request-tracking-local.json](../../docs/validation/request-tracking-local.json) | `migration`, `passed`, `synthetic_auth_stub_only`, `remote_sql_executed` |
| [docs/validation/request-tracking-remote.json](../../docs/validation/request-tracking-remote.json) | `migration` |
| [docs/validation/security-request-creation-local.json](../../docs/validation/security-request-creation-local.json) | `migration`, `baseline_migrations`, `migration_sha256`, `prior_migration_sha256`, `passed`, `synthetic_auth_and_storage_only`, `remote_sql_executed` |
| [docs/validation/security-request-creation-m13-baseline-local.json](../../docs/validation/security-request-creation-m13-baseline-local.json) | `migration`, `baseline_migrations`, `migration_sha256`, `prior_migration_sha256`, `passed`, `synthetic_auth_and_storage_only`, `remote_sql_executed` |
| [docs/validation/ticket-attachment-limits-local.json](../../docs/validation/ticket-attachment-limits-local.json) | `passed`, `synthetic_storage_auth_only`, `hosted_http_upload_tested`, `remote_sql_executed`, `new_client_contract_checks_passed`, `eight_previous_migrations_unchanged` |
| [docs/validation/ticket-catalogs-local.json](../../docs/validation/ticket-catalogs-local.json) | `migration`, `passed`, `synthetic_auth_stub_only`, `remote_sql_executed` |
| [docs/validation/ticket-catalogs-remote.json](../../docs/validation/ticket-catalogs-remote.json) | `migration` |
| [docs/validation/ticket-security-local.json](../../docs/validation/ticket-security-local.json) | `migration`, `passed`, `remote_sql_executed`, `hosted_storage_http_size_limit_tested`, `new_adapter_tests_passed`, `eight_previous_migrations_unchanged`, `new_migration_applied_remotely` |
| [docs/validation/ticket-security-remote.json](../../docs/validation/ticket-security-remote.json) | `migration` |

## Puntos de extensión

- Añadir un flujo cliente: comenzar por requisito y contrato, conservar separación proveedor/contexto/identidad; no cambiar `client-login` para crear roles internos.
- Añadir acción de tablero: SQL transaccional, payload estricto, autorización antes de replay y eventos de servidor; UI no UPDATE directo de columnas revocadas.
- Añadir métrica: mantener evento confiable, unidad/cohorte/nulls y permisos; no usar updated_at como fecha real.
- Añadir migración: nuevo archivo posterior, fixtures clean/upgrade y preservación; jamás corregir SQL ya aplicado.
- Añadir prueba UI: React real y fixture estricto; declarar mocks y evitar Supabase de red. `src/dev/client-portal-mock.ts` no es una implementación funcional productiva.
- Cambiar scripts de preparación: respetar manifiestos M1–M4 como evidencia histórica; no convertir scripts con efectos remotos en una dependencia del build.
