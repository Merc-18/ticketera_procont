# Ticketera Procont — instrucciones para agentes

## Reglas funcionales vigentes — 27/11/2026

La instrucción actual del usuario autoriza corregir la interfaz, ejecutar regresiones/TypeScript/build y publicar por el flujo normal GitHub/Vercel. Sustituye la restricción del cierre documental anterior. Trabajar en la copia independiente escribible desde main actualizado (`40f582d` al iniciar la simplificación de tarjetas); no depender de Claude ni forzar la carpeta original protegida.

- **Los tickets no vencen.** No presentar, filtrar, exportar, editar ni emitir alertas por due_date, SLA o fechas límite. Conservar columnas, eventos y registros históricos; no enviar valores nulos para borrar fechas existentes.
- Antigüedad: días civiles de **America/Lima desde projects.created_at**, que es la incorporación del ticket al tablero. «Hoy», «1 día en tablero», «N días en tablero». Nunca requests.created_at, fecha de fase, responsable, updated_at o fecha de inicio editable. Sin colores de alerta por edad. Mantener el contador al reasignar o cambiar fase.
- Jerarquía visual de tarjetas: **Producto → Subproducto → Proyecto**. Portafolio sigue siendo una relación del modelo y está disponible en detalle/administración. Producto/subproducto = catalog_systems/catalog_subsystems de la solicitud; proyecto operativo = portfolio_initiatives dentro de portfolios; public.projects almacena tickets. Validar cada relación real y no inventar FK entre subproducto y portafolio.
- Cada ticket conserva su propio responsable, fase, prioridad y checklist aunque comparta proyecto operativo. Tarjeta compacta: título primero (máximo dos líneas), producto · subproducto en una línea, proyecto en otra, prioridad + antigüedad y pie con checklist + avatar/nombre + asignación. Truncamiento con tooltip completo; controles de 44 px y 0/0 explícito sin dividir por cero. No renderizar portafolio, INT/REQ, solicitante, área ni distintivos históricos en tarjetas; conservarlos en el detalle y mantener selección/asignación. Solo un indicador compacto de bloqueo. Usar estados ausentes, nunca valores prefijados.
- Revisar Kanban, Dashboard, Equipo, detalle, tabla, Gantt, Roadmap, filtros, formularios y exportaciones. Gantt refleja tiempo observado desde creación; Roadmap agrupa por creación de Lima. Preservar colores personales, prioridad, bloqueo e identidad Procont.
- Probar nombres largos, bloqueo, checklist 0/0, 3/3 y 3/18, dos responsables por el mismo proyecto, tickets antiguos, claro/oscuro y anchos 320, 390, 834 y 1440 px, con tarjetas activas/completadas/archivadas. Guardar capturas antes/después y verificar geometría sin solapamientos.
- No confundir esta regla con **expiración de sesiones ni reservas de adjuntos**, que mantienen sus controles. No tocar Supabase ni datos sin autorización específica; esta corrección no requiere migraciones.

## Estado de referencia del cierre previo al cambio

- Base funcional de GitHub: `406a46351411fdf845a73a811cb798b7964617b1`; Vercel SUCCESS confirmado para ese corte. main incorpora después el cierre documental `94b2329` y la recuperación de CLAUDE.md. Consultar la [nota de publicación](docs/validation/technical-close-20261127/PUBLICATION.md) para procedencia y límites.
- Único Supabase autorizado: `xsxdpaiivklqeudgqoqf`; **22 migraciones** confirmadas por `list_migrations`, incluida `20261126231933_realtime_requests_postgres_changes`.
- Leer [PROJECT_STATUS](docs/PROJECT_STATUS.md) y el [cierre técnico](docs/validation/technical-close-20261127/REPORT.md). Los requisitos funcionales se mantienen en [PRODUCT_REQUIREMENTS](docs/specs/PRODUCT_REQUIREMENTS.md).
- Las fechas y resultados antiguos son históricos. Los 17 PASS de ChatGPT son evidencia externa de SQL/RPC en producción con identidades sintéticas y BEGIN/ROLLBACK; no son ejecuciones de Codex ni pruebas E2E.

## Alcance y conservación

- La corrección funcional actual autoriza solo el alcance de interfaz/reglas descrito arriba y su publicación. No aplicar migraciones, cambiar permisos/secretos ni escribir datos de producción durante la verificación. Reutilizar la evidencia externa sin repetir sus pruebas SQL.
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
- Publicar la corrección verificada mediante GitHub/Vercel y confirmar SHA y versión servida. La autorización funcional actual no autoriza cambios de Supabase o datos. El dictamen **APROBADO CON OBSERVACIONES** corresponde al cierre documental previo, no certifica por sí solo estas nuevas reglas.
- Respetar CLAUDE.md: no añadir Co-Authored-By a commits. Mantener lockfile; ejecutar comprobaciones proporcionales. Ejecutar las regresiones afectadas cuando cambia código; conservar sus límites reales/simulados y los SKIP históricos. No repetir pruebas SQL de producción ya aprobadas.
