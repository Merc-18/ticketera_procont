# Creación interna de tickets

Revisión 24/11/2026 · RPC existente M19.

Se mantienen «Originado por cliente» e «Interno u operativo»; prioridad, responsable, fase inicial, fechas, adjuntos y campos de cliente existentes no se quitan. Ambos modos reciben elección Portafolio/Proyecto dependiente o ticket independiente. La asociación es validada por el servidor en la función actual `create_internal_ticket`; el formulario no escribe directamente en tablas.

La prueba UI usa payload y servicios simulados, no crea ticket remoto. La prueba PostgreSQL local anterior de M19 cubrió creación, modo, permisos e idempotencia; no se repitió. Área continúa solo para el código exacto PROCONT y urgencia solicitada sigue separada de la prioridad.
