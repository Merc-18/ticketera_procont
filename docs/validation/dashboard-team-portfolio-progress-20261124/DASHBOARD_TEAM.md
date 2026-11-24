# Dashboard y Equipo

Revisión 24/11/2026 · Local, referencia base `16064c5`.

Dashboard elimina filtros de Estudio y Área, conserva Tickets por estudio para todos los estudios con filtro de periodo, y muestra secciones separadas: Solicitudes, Trabajo, Tiempos, Prioridades, carga y solicitudes por estudio. El filtro de periodo afecta las métricas de periodo y tiempos; estados actuales de trabajo/bandeja están etiquetados como estado actual. CSV sigue disponible en el menú secundario «Exportar».

La lectura de requests/projects usa páginas estables de 1.000 filas y `count=exact`. Se niega a mostrar totales si faltan filas, cambia el total, aparece duplicado o falla una página. Workload y exportaciones también evitan truncamiento silencioso.

«Equipo» centraliza Usuarios, Carga de trabajo y Portafolios y proyectos. Se excluyen cuentas cliente; se respetan las capacidades/roles existentes. Usuarios y carga se alimentan de la fuente actual del panel. No hay métricas inventadas.

Pruebas: `tests/verified-pagination.test.mjs` (6) y `tests/ui/dashboard-boards.ui.test.mjs`; suite Node 209/209, UI completa 129 PASS/6 SKIP. UI con servicios simulados, no Supabase remoto.
