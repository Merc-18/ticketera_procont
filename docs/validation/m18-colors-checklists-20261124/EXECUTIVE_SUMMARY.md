# Resumen ejecutivo — M18 (24/11/2026)

**Estado: M18 lista y probada en local. Producción sin cambios.** Falta una única autorización para aplicarla y publicar.

- **Colores (10):** el servidor ya solo entrega los 10 colores aprobados. Si algún día se ocupan los 10, la persona nueva queda sin color en vez de bloquearse su alta, y nunca se repite un color. Los colores actuales del equipo (azul y pizarra) no cambian. Si alguien tuviera un color retirado, lo conserva y puede pasar a uno de los 10.
- **Checklist:** Analysis y Code Review tienen ahora plantilla en el servidor, con las mismas tareas que ya mostraba la aplicación. Las tarjetas nuevas nacen con las 8 fases completas. Las tarjetas existentes no se modifican y siguen ofreciendo «Agregar tareas sugeridas».
- **Migración M18:** una sola, transaccional, repetible sin efectos y solo aditiva. M1–M17 sin tocar. SHA-256 `439c0e29…f50bdd8`.
- **Pruebas en PostgreSQL 17 real:** instalación limpia 18/18, actualización desde M17 con historia 22/22, suites afectadas del tablero 74 + 26, paridad con el frontend 14/14.
- **Seguridad:** solo el personal interno activo ve las preferencias; cada persona cambia únicamente la suya; los clientes no tienen acceso; la unicidad la garantiza la base de datos.

**Siguiente paso:** autorizar (1) aplicar M18 en Supabase con dry-run previo y (2) push de `main` y despliegue en Vercel.
