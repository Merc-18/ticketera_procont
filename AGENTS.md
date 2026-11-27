# Ticketera Procont — instrucciones para agentes

## Estado de referencia al 27/11/2026

- GitHub `main`: `406a46351411fdf845a73a811cb798b7964617b1`; Vercel SUCCESS confirmado mediante el estado del commit.
- Único Supabase autorizado: `xsxdpaiivklqeudgqoqf`; **22 migraciones** confirmadas por `list_migrations`, incluida `20261126231933_realtime_requests_postgres_changes`.
- Leer [PROJECT_STATUS](docs/PROJECT_STATUS.md) y el [cierre técnico](docs/validation/technical-close-20261127/REPORT.md). Los requisitos funcionales se mantienen en [PRODUCT_REQUIREMENTS](docs/specs/PRODUCT_REQUIREMENTS.md).
- Las fechas y resultados antiguos son históricos. Los 17 PASS de ChatGPT son evidencia externa de SQL/RPC en producción con identidades sintéticas y BEGIN/ROLLBACK; no son ejecuciones de Codex ni pruebas E2E.

## Alcance y conservación

- El cierre autorizado es documental: no repetir pruebas aprobadas, añadir funcionalidades, aplicar migraciones, desplegar, cambiar permisos/secretos ni escribir en producción.
- Conservar datos ficticios, solicitudes/tickets QA y registros reales. No ejecutar seeds, bootstrap, purgas ni SQL histórico como instalación general.
- No exponer claves de servicio, contraseñas, JWT, cookies ni URLs firmadas. Nunca configurar service_role en VITE_*.
- Registrar bloqueos y SKIP como pendientes. No sustituir proveedores, Auth, Storage o Realtime alojados por mocks para declarar PASS.

## Evidencias y pendientes

- Procedencia obligatoria: indicar ejecutor, fecha, entorno, motor real/simulado, método, persistencia y límites. No sumar suites de distintas fechas ni inventar casos.
- Pendientes: login externo real Quipu/QuipuFac; UI con los cuatro roles activos; binarios mediante reservas de Ticketera; entrega E2E de eventos PostgreSQL Realtime; invitaciones/callback/SMTP y decisiones de operación indicadas en PROJECT_STATUS.
- RLS en 19 tablas públicas y publicación Realtime de cuatro tablas constan en la evidencia externa. La mera configuración/publicación no demuestra recepción de eventos ni acceso autorizado a objetos.

## Git y trabajo local

- Comprobar branch, upstream, diff y trabajo preexistente antes de editar. No descartar cambios ajenos ni integrar ramas históricas por su nombre.
- En esta sesión `.git` del checkout original es de solo lectura. La copia independiente de cierre contiene `main` actualizado y los commits documentales; esto no actualiza los metadatos de la carpeta original.
- Los cambios preexistentes del worktree dashboard-team-portfolio-progress están preservados en el commit local de archivo `0f353decf35b03d310df7900e2906620be8b17f4` y bundle de recuperación. Ese archivo no es una rama funcional que deba mezclarse con main.
- Un push a main puede activar Vercel. Este cierre no autoriza ese despliegue; entregar commits locales y evidencia de la diferencia con GitHub.
- Respetar CLAUDE.md: no añadir Co-Authored-By a commits. Mantener lockfile; ejecutar comprobaciones proporcionales. Para documentación, revisar diff, enlaces, JSON y hashes; no reejecutar suites aprobadas.
