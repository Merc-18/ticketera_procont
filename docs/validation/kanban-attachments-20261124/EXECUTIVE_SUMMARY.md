# Resumen ejecutivo — Kanban visual y adjuntos (24/11/2026)

**Estado: implementado y validado en local. No publicado** (sin push, merge ni despliegue; pendiente de su revisión).

## Kanban

- **Cada columna se distingue de un vistazo.** Las 8 fases reales tienen un tono propio y sutil: pizarra (Backlog), celeste (Analysis), verde azulado (Design), azul Procont (Development), dorado Procont (Code Review), cobre (Testing), cian (Deploy) y verde (Done). El fondo va teñido al 5–9 %, la cabecera lleva un acento de 3 px y un contador visible en el tono de la columna, y aparece un contador rojo si hay bloqueados. Sin violeta y sin columnas saturadas.
- **Se eliminó la barra azul.** No era funcional: repetía la prioridad «Medio» en el borde superior de casi todas las tarjetas. Ahora las tarjetas son neutras (superficie elevada, borde discreto, sombra baja, hover sutil) y siguen distinguiéndose por la insignia, la franja del responsable y el estado.
- **Tres significados, tres canales.** Etapa en la columna; prioridad en la insignia (Urgente rojo, Alto dorado, Medio azul, Bajo con contorno, sin cambios); responsable en la franja lateral y el anillo del avatar, con el color guardado en Supabase (lógica intacta); bloqueo con tinte, borde y aviso rojos.
- **La tarjeta se lee mejor sin crecer.** REQ y solicitante arriba; título; insignias; pie con barra de progreso, responsable y acción «Asignar». No se quitó información.
- **La Tabla usa el mismo sistema.** Nueva columna «Responsable» con el mismo anillo, punto de etapa en «Fase» e insignia «Bloqueado».

## Adjuntos

- **Tres formas de adjuntar:** «Seleccionar archivos», **arrastrar y soltar** y **Ctrl + V** (Cmd + V en Mac) con el foco en la zona. Instrucción visible: «Puedes arrastrar tus archivos aquí o pegarlos con Ctrl + V».
- **Las mismas reglas para los tres orígenes**, sin límites nuevos: 4 archivos, 2,5 MB por archivo y en total, los formatos y MIME del bucket, y duplicados detectados por contenido.
- **Mensajes claros** para un archivo añadido, duplicado, no permitido, demasiado grande o fuera del límite, y para un portapapeles sin archivos legibles. Nunca se toma texto del portapapeles como documento y nunca se simula un archivo a partir de una ruta.
- **Nada se sube antes de enviar.** El envío usa el flujo existente: una reserva por lote y una subida por archivo. El recibo confirma «Se adjuntaron N archivos».

## Validación

- Pruebas: unitarias 184/184 (11 nuevas); nueva suite de interfaz 17/17; suites existentes afectadas 9/9, 8/8, 31/31 y 31/31.
- Claro y oscuro; 1920, 1440, 768, 390, 360 y 320 px sin desbordes.
- Contrastes WCAG 2.2 AA medidos en el navegador. Hay una excepción decorativa declarada: el acento dorado de Code Review en claro.
- Backend intacto: Supabase, SQL, RPC, RLS, Storage, contratos, autenticación y Vercel sin cambios. No hay dependencias nuevas.
- 120 capturas Antes/Después con manifiesto y SHA-256.

## Antes de publicar

1. Revisar las capturas `screenshots/antes-*` frente a `screenshots/despues-*`.
2. Probar a mano el pegado de un archivo copiado desde el Explorador de Windows en Chrome o Edge. Las pruebas automatizadas simulan el portapapeles.
3. Autorizar push y despliegue.
