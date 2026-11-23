# Informe responsive — claro y oscuro

Capturas a pantalla completa de las 4 áreas en 1920×1080, 1440×900, 768×1024, 390×844 y 360×800, más 320 px. Son 121 por tema y 242 en total, con área, pantalla, tema, resolución, versión, fecha y sha256 en [`screenshots-manifest.json`](screenshots-manifest.json). Tablet y móvil se emulan con táctil.

| Ancho | Claro | Oscuro |
|---|---|---|
| 1920 / 1440 / 768 / 390 / 360 (23 pantallas cada uno) | 0 desbordamiento | 0 desbordamiento |
| 320: `/portal`, `/cliente`, `/tracking`, `/cliente/nuevo`, dashboard, Kanban | 0 | 0 |

## Ubicación del selector por contexto

| Contexto | Ubicación | Móvil |
|---|---|---|
| Portal público | Barra superior, a la izquierda de «Ingreso del personal» | < 480 px: la barra baja a una segunda fila con el selector y el botón (que ocupa el resto) |
| Ingreso Quipu/QuipuFac (`/cliente`) | Barra superior, a la izquierda de «← Inicio» | Igual |
| Espacio del cliente | Cabecera, a la izquierda de «Salir» | Igual |
| Seguimiento público, `/login` del personal, entrada al espacio | Fila encima de la tarjeta, alineada a la derecha (el mismo lado que en las barras), sin superponerse al contenido | Igual |
| Panel interno | Banda corporativa, entre el reloj y la campana (variante para la banda azul) | La banda se acomoda en filas (`flex-wrap`) |

## Revisión visual

Se revisaron las capturas oscuras de las cuatro áreas:

- portal;
- selección e ingreso, modal del personal;
- nuevo ticket, detalle y Mis tickets;
- dashboard, bandeja, modal de validación, Kanban, Tabla, Gantt, modal de proyecto y Equipo.

En los dos temas:

- no queda ningún componente con fondo claro dentro del tema oscuro;
- los campos se distinguen de la superficie;
- las tarjetas del Kanban y las columnas de la tabla se leen;
- las barras y etiquetas del Gantt son visibles;
- las prioridades aparecen en español.

En el modo claro, el inventario de colores renderizados coincide con el aprobado en 115 de 115 pantallas. Solo se añaden el tinte y el icono activos del selector, con tokens ya aprobados (`#DBEAFE` y `#1E3A8A`), y no se pierde ningún color.

**Limitación.** Las pruebas se hicieron en Chromium emulado, no en dispositivos físicos.
