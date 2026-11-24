# Seguridad (M18)

| Control | Estado | Evidencia (PostgreSQL 17, clean y upgrade) |
|---|---|---|
| Funciones `SECURITY DEFINER` con `search_path=''` | `ensure_internal_card_color`, `internal_card_colors`, `set_my_internal_card_color` | `pg_proc.prosecdef` y `proconfig` comprobados |
| `ensure_internal_card_color` no invocable desde fuera | PUBLIC, anon y authenticated sin EXECUTE | `has_function_privilege` |
| RPC solo para `authenticated` | `internal_card_colors` y `set_my_internal_card_color`; anon sin EXECUTE | `has_function_privilege` |
| Solo internos activos | Un autenticado sin perfil interno obtiene `42501` en ambas RPC y 0 filas en la tabla | Pruebas `external` |
| Clientes Quipu/QuipuFac | Operan como anon con token de sesión: `permission denied` en la tabla y la RPC | Pruebas `anon` |
| Cada usuario solo su preferencia | Sin UPDATE, INSERT ni DELETE directos para ningún rol de aplicación (solo SELECT con RLS); la RPC usa `auth.uid()` y no acepta un UUID | Pruebas de escritura directa |
| Color validado en el servidor | Retirado o inexistente: `22023`; ocupado: `23505` | Pruebas de RPC |
| Unicidad en PostgreSQL | `UNIQUE(color_id)` y `LOCK TABLE … EXCLUSIVE`; carreras probadas con hilos simultáneos | Concurrencia: 1 dueño y 1 rechazo; 2 activaciones dan 2 colores distintos |
| Disponibilidad | Sin capacidad, el perfil se activa sin color (antes la activación fallaba con `23514`) | Prueba de capacidad |
| Roles y autenticación | Sin cambios | `git diff`: solo se añade un archivo de migración |
| Datos históricos | Sin cambios (md5 de checklist_items, projects, project_flows, request_events, activity_logs, requests, users y preferencias) | Escenario upgrade |
