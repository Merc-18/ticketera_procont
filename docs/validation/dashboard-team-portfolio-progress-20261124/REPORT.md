# Informe de validación — Dashboard, Equipo, Portafolio y progreso

Revisión: 24/11/2026 · Base: `16064c5c096f3b69943a81a0d1c64fef5ae8e5f0` · Entorno: local con servicios y datos ficticios.

## Resultado

Implementación local coordinada. No se publicaron cambios, no se aplicaron migraciones remotas y no se escribieron tickets en producción. La rama conserva los cambios de Claude ya incluidos en la base, incluido `5c6640ec390685cc097a51de42fddd679efa3731`; M20 añade una sola RPC atómica para asociar Portafolio/Proyecto durante la aprobación.

### Dashboard y Equipo

- Dashboard ya no presenta filtros de estudio ni área. El gráfico de tickets por estudio conserva todos los estudios y su filtro de periodo; la carga evita filtros falsamente globales.
- Solicitudes, Trabajo, Tiempos, Prioridades, Carga y Tickets por estudio permanecen separados. «Equipo» abre usuarios, carga y Portafolios y proyectos con los permisos existentes.
- «Exportar» contiene Activos CSV y Completados CSV. Los filtros y columnas de las exportaciones se conservaron.
- Requests y Projects se descargan con `count=exact`, orden estable e intervalos de 1.000. Un error, conteo ausente/cambiante, página corta prematura o ID duplicado falla cerrado; no se muestran cifras parciales. CSV no genera descarga parcial.

### Portafolio e historias

- Aprobación: `approve_request_with_portfolio(uuid,jsonb,jsonb,uuid)` requiere admin/superadmin y guarda aprobación + asociación en una transacción, reusando `approve_request` y `set_project_portfolio`. Admite `{"mode":"independent"}` o `{"mode":"portfolio","portfolio_id":"UUID","initiative_id":"UUID|null"}`. La pertenencia se valida en el servidor y existe idempotencia/auditoría.
- Creación interna conserva sus dos modos M19 y permite elección dependiente. No se crearon opciones de catálogo ni asociaciones ficticias en producción.
- Tarjetas muestran Portafolio → Proyecto/Iniciativa → título; «Sin portafolio» para los independientes. Prioridad, fase y responsable permanecen visualmente separados.
- La fase se muestra como nombre y posición `Fase n de 8`, nunca como porcentaje de trabajo. Solo tareas persistidas cuentan en el checklist; sugerencias sin agregar no producen contador ni porcentaje. Registros antiguos ambiguos se conservan y cuentan como existentes; no se infiere su procedencia por timestamps.

## Migración M20

Archivo `supabase/migrations/20261124000300_approve_request_with_portfolio.sql`; SHA-256 `0d5990cb4a4abbe34142f0666a3359f8fbf8b352f63fce4637954a39d37e83e3`. Es aditiva, transaccional y no altera tablas ni datos históricos. La evidencia previa `data/m20-qa.json` corresponde a PostgreSQL 17.12 desechable: 14 comprobaciones; 25 solicitudes ficticias insertadas por RPC solo en ese clúster, ROLLBACK/idempotencia, validación de rol/relación y auditoría. El valor `legacy` del reporte describe una clasificación anterior del generador y no es prueba de origen: al no poder demostrarse procedencia, el código final ya no clasifica por timestamp. Ese arnés no se pudo repetir en esta sesión porque no hay binarios PostgreSQL locales.

## Pruebas realizadas en esta revisión

| Ejecución | Resultado | Naturaleza |
|---|---:|---|
| `node --test tests/*.test.mjs` | 209/209 PASS | Node, incluye paginación, contratos y checklist |
| `npm run test:ui` | 129 PASS, 0 FAIL, 6 SKIP (135 total) | React/Chromium con Supabase y datos ficticios simulados |
| `npm run build` | PASS | TypeScript + Vite |
| Captura `capture-qa.mjs --stage despues` | 82 capturas con hash y versión comprobada común | Navegador local, fixtures ficticias, Light/Dark, seis anchos |
| PostgreSQL 17 en esta sesión | NO EJECUTADO | No disponibles `psql`, `initdb` ni `postgres`; ver evidencia previa señalada arriba |

Seis pruebas UI se mantienen omitidas por condiciones preexistentes documentadas en sus casos (login remoto real y medición de bundle de preview); no se cuentan como aprobadas.

## Estado de publicación

M20 fue **aplicada** en `xsxdpaiivklqeudgqoqf` tras dry-run que incluyó solo ese archivo. Historial remoto: 21/21 (M1–M19, con M16b separada, más M20). Postcheck remoto de solo lectura: función presente, owner `postgres`, SECURITY DEFINER, `search_path=""`, EXECUTE false para `anon` y `service_role`, true para `authenticated`; no se invocó aprobación y no se escribieron tickets. El código aún no se había integrado/push al momento de redactar; falta publicación y despliegue automático de Vercel.

## Evidencia

- [Resumen ejecutivo](EXECUTIVE_SUMMARY.md)
- [Dashboard y Equipo](DASHBOARD_TEAM.md)
- [Asignación de portafolio](PORTFOLIO_ASSIGNMENT.md)
- [Jerarquía de tarjetas](KANBAN_CARD_HIERARCHY.md)
- [Progreso de checklist](CHECKLIST_PROGRESS.md)
- [Creación interna](INTERNAL_TICKET_CREATION.md)
- [Fixtures QA](QA_FIXTURES.md)
- [Accesibilidad](ACCESSIBILITY_REPORT.md)
- [Responsive](RESPONSIVE_REPORT.md)
- [Galería](screenshots-manifest.json) · [checksums](SHA256SUMS)
