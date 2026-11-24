# Responsive

Chromium (Playwright 1.62.1, `chromium-1234`) sin interfaz gráfica, con datos ficticios.

## Kanban

| Ancho | Desbordamiento de la página | Navegación de columnas | Tarjeta dentro de su columna | «Asignar» ≥ 44 px | Capturas (antes / después) |
|---|---|---|---|---|---|
| 1920 × 1080 | 0 px | `overflow-x:auto` | Sí | Sí | `*-kanban-{light,dark}-1920.png`, `*-columnas-restantes.png` |
| 1440 × 900 | 0 px | Sí | Sí | Sí | `*-kanban-{light,dark}-1440.png` |
| 768 × 1024 | 0 px | Sí | Sí | Sí | `*-kanban-{light,dark}-768.png`, `*-768-tarjetas.png` |
| 390 × 844 | 0 px | Sí, con aviso «Desliza…» | Sí | Sí | `*-kanban-{light,dark}-390.png`, `*-390-tarjetas.png` |
| 360 | 0 px | Sí | Sí | Sí | `*-kanban-{light,dark}-360.png`, `*-360-tarjetas.png` |
| 320 | 0 px | Sí | Sí | Sí | `*-kanban-{light,dark}-320.png`, `*-320-tarjetas.png` |

**Defecto encontrado y corregido durante la validación:** a 768 px la página se desplazaba 428 px en horizontal. El texto oculto (`sr-only`, posición absoluta) del contador de bloqueados no tenía un ancestro posicionado dentro del carrusel y escapaba a su recorte. Se corrigió con `position: relative` en `.board-column`. La copia base (`e653138`) daba 0 px, así que el defecto era propio de este cambio y ya está resuelto.

Las columnas mantienen su ancho (`300px`; en móvil, `min(300px, 100vw − 64px)`) y la navegación horizontal existente. La tarjeta no aumenta su altura: el solicitante pasa de la fila de insignias a la fila de metadatos.

## Adjuntos

| Ancho | Desbordamiento | «Seleccionar archivos» | «Quitar» | Fila dentro del área | Capturas |
|---|---|---|---|---|---|
| 1440 | 0 px | ≥ 44 px | 44 × 44 | Sí | `despues-adjuntos-*-1440.png` |
| 768 | 0 px | ≥ 44 px | 44 × 44 | Sí | — |
| 390 | 0 px | Ancho completo, ≥ 44 px | 44 × 44 | Sí | `despues-adjuntos-*-390.png` |
| 360 | 0 px | Ancho completo | 44 × 44 | Sí | — |
| 320 | 0 px | Ancho completo; el icono se oculta por debajo de 360 | 44 × 44 | Sí | `despues-adjuntos-*-320.png` |

En móvil la zona pasa a dos filas (icono y texto; botón a todo el ancho), y cada adjunto pasa a dos líneas (nombre y meta; estado debajo) con «Quitar» a la derecha. Arrastrar no es la única vía: el botón sigue disponible y el portapapeles se usa donde el sistema lo permite. Prueba: «Adjuntos responsive: 1440, 768, 390, 360 y 320».
