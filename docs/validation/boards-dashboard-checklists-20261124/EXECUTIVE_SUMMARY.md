# Resumen ejecutivo — Boards, Dashboard, checklist y proyectos largos (24/11/2026)

**Estado: implementado y validado en local, sin publicar.** Hay tres puntos que requieren su autorización porque tocan el backend.

1. **Colores personales: 10.** El selector ofrece exactamente 10: los 6 originales (incluyen los dos colores que hoy usa el equipo, azul y pizarra) y 4 tonos del mismo catálogo elegidos por máxima diferencia en claro y oscuro. Nadie cambia de color. Un color ya tomado no se puede elegir y nunca se repite. Si se ocupan los 10, se avisa en lugar de duplicar. *Pendiente:* la asignación automática del servidor todavía puede entregar uno de los 14 retirados a un perfil nuevo. La migración mínima está preparada pero no aplicada.
2. **Boards sin filtro de Área.** La barra queda en dos filas: estado, vistas y «Nuevo proyecto» arriba; Prioridad, Estudio, Responsable y «Mi color» abajo. Es más baja (−100 px en móvil) y no se desborda de 1920 a 320 px. Las áreas siguen donde corresponden (clasificación PROCONT).
3. **Dashboard: Tickets por estudio.** Sustituye al bloque de áreas. Cuenta solicitudes por estudio en el periodo elegido, con el total y «Sin estudio asignado» aparte. La lectura es paginada y verificada: si el total no se puede confirmar, muestra un error en lugar de una cifra parcial.
4. **Checklist por fase.** La causa de los campos vacíos era que Analysis y Code Review no tienen plantilla en el servidor. Ahora hay plantillas para las 8 fases. Al mover una tarjeta, se agregan las tareas de la fase nueva solo si está vacía: no duplica, no borra ni desmarca, y no actúa en Done. Las tarjetas existentes ofrecen «Agregar tareas sugeridas». Las tareas ahora también se pueden editar.
5. **«Beneficiarios finales».** El modelo actual no tiene jerarquía, equipo, dependencias ni hitos; hoy solo cabe como una tarjeta interna. Se propone una ampliación aditiva: Gestión (portafolio) → Iniciativa → Frentes → Tareas (las tarjetas actuales) → Checklist, con equipo, colaboradores, dependencias e hitos.

**Pruebas:** unitarias 197/197; nueva suite de interfaz 12/12, estable en 4 ejecuciones; suites existentes afectadas 9/9, 17/17, 8/8 y 31/31. El backend no cambia.

**Decisiones que se le piden:** (a) aplicar la migración de la paleta de 10; (b) opcionalmente, añadir las plantillas de Analysis y Code Review en el servidor; (c) autorizar la fase 1 de la jerarquía de proyectos; (d) publicar cuando haya revisado las capturas.
