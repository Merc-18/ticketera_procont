# Responsive

Chromium sin interfaz gráfica, datos ficticios, temas claro y oscuro.

## Barra de Boards

| Ancho | Distribución | Desbordamiento | Controles ≥ 44 px dentro de la barra | Etiquetas sin recorte | Capturas (antes / después) |
|---|---|---|---|---|---|
| 1920 | Fila 1: estado · vistas + Nuevo proyecto. Fila 2: Prioridad, Estudio, Responsable · Mi color | 0 px | Sí | Sí | `*-barra-boards-{light,dark}-1920.png` |
| 1440 | Ídem | 0 px | Sí | Sí | `*-barra-boards-{light,dark}-1440.png` |
| 768 | Estado y vistas a todo el ancho; Nuevo proyecto a todo el ancho; filtros en rejilla de 2 | 0 px | Sí | Sí | `*-768.png` |
| 390 | Ídem; Responsable a todo el ancho; Mi color a todo el ancho | 0 px | Sí | Sí | `*-390.png` |
| 360 | Ídem | 0 px | Sí | Sí | `*-360.png` |
| 320 | Filtros en una columna; icono sobre la etiqueta en estado y vistas | 0 px | Sí | Sí | `*-320.png` |

**Defecto encontrado y corregido:** a 320–479 px los tres botones de estado no cabían en su columna y «Completados» se montaba sobre «Archivados» (detectado al revisar las capturas; la imagen se regeneró tras la corrección). Se apilan icono y etiqueta (igual que los botones de vista) y la prueba ahora comprueba que ninguna etiqueta se sale de su botón.

Altura medida de la barra (captura del elemento): a 1440 px pasa de **158 a 155 px** y a 390 px de **524 a 424 px** (−100 px). Se quitó el campo de Área, «Mi color» se unió a la fila de filtros y «Nuevo proyecto» quedó alineado con las vistas. Las dos filas tienen propósitos distintos: acciones y vistas arriba, filtros abajo, separados por una línea.

## Dashboard «Tickets por estudio»

| Ancho | Distribución | Captura |
|---|---|---|
| 1440 | Nombre (34 %), barra y número en una fila; total arriba a la derecha | `*-dashboard-bloque-{light,dark}-1440.png` |
| 390 | Nombre y número en una fila; barra debajo a todo el ancho | `*-dashboard-bloque-{light,dark}-390.png` |

## Checklist y «Mi color»

El panel «Mi color» (10 opciones en 2 columnas) y las sugerencias del checklist usan el ancho del modal o panel existente. Capturas a 1440 en claro y oscuro: `*-mi-color-*`, `*-checklist-analysis-*`, `estado-checklist-*`.
