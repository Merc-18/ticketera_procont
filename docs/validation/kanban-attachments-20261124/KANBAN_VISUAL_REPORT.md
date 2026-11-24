# Kanban: identidad de etapa y tarjetas neutras

Base: `main` `e653138fd339a9503238825db32f27d34c698bb8`. Solo frontend. Las fases, el flujo, los datos y la lógica del color personal no cambian.

## 1. Diagnóstico (Antes)

| Problema | Causa en el código | Evidencia |
|---|---|---|
| Columnas sin identidad | Las 8 columnas usaban el mismo fondo `--p-alt`, la misma cabecera y el mismo contador gris (`BoardColumn.tsx`) | `screenshots/antes-kanban-light-1920.png`, `antes-columna-*.png` |
| Barra azul en casi todas las tarjetas | `.project-card.prio-medium { border-top: 3px solid var(--prio-medium) }` (azul `#1E3A8A`). Como «Medio» es la prioridad más común, el tablero se veía cubierto de barras azules. Urgente y Alto añadían barras roja y dorada, y Bajo no tenía. | `index.css` (bloque «Boards: tres canales», eliminado), `antes-kanban-*.png` |
| Prioridad en dos sitios | La misma prioridad aparecía en la insignia y en el borde superior. El borde duplicaba el dato y competía con la franja del responsable. | — |
| Metadatos dispersos | El solicitante iba como insignia gris entre la prioridad y la fecha. El número REQ y el checklist iban al pie, separados del responsable. | `antes-columna-analysis-light.png` |

## 2. Cambios

### 2.1 Columnas: identidad de etapa (`src/lib/board-stages.ts`, `BoardColumn.tsx`, `index.css`)

Cada fase real del contrato recibe un **tono de etapa**. No se inventan columnas: son las 8 de `DEVELOPMENT_PHASES` y las 7 del histórico Administrative.

| Fase (Development) | Fase (Administrative) | Tono | Acento claro | Acento oscuro | Sentido |
|---|---|---|---|---|---|
| Backlog | Backlog | `queue` | `#64748B` pizarra | `#94A3B8` | Cola, aún sin trabajo |
| Analysis | Discovery | `analysis` | `#0284C7` celeste | `#38BDF8` | Entender |
| Design | Design | `design` | `#0D9488` verde azulado | `#2DD4BF` | Definir |
| Development | Build | `build` | `#1E3A8A` azul Procont | `#60A5FA` | Construir (color de marca) |
| Code Review | Ready to Start | `review` | `#D4A017` dorado Procont | `#EEBB31` | Revisar, punto de control |
| Testing | UAT/Validation | `testing` | `#C2410C` cobre | `#FB923C` | Verificar |
| Deploy | — | `release` | `#0E7490` cian profundo | `#22D3EE` | Entregar |
| Done | Deployed | `done` | `#15803D` verde | `#4ADE80` | Terminado (verde = completado) |

Sin violeta: la prueba comprueba que ningún acento cae entre 250° y 320° de matiz.

Cómo se aplica (sin saturar):

- **Fondo de la columna**: `color-mix` al 6 % (5 % en oscuro) sobre el alterno. Se nota el tono, pero la tarjeta sigue siendo lo más claro.
- **Cabecera**: tinte al 9 % (8 % en oscuro), borde inferior en el tono y **acento superior de 3 px** de la columna. Es la única barra de color, una por columna.
- **Icono** de la fase en `--stage-ink`.
- **Contador**: píldora monoespaciada con tinte del 14 % y texto `--stage-ink` (≥ 5,89:1). Si la columna tiene tarjetas bloqueadas, aparece al lado un contador rojo («1 bloqueado» para lectores de pantalla).
- **Al arrastrar sobre la columna**: tinte del 10 % y contorno interior en el tono de la etapa. Antes era azul para todas.
- **Columna vacía**: «Sin tickets» en un recuadro discontinuo del tono.

### 2.2 Tarjeta (`ProjectCard.tsx`)

- **Sin barra superior.** Todas las tarjetas tienen un borde de 1 px neutro, la superficie elevada (`--p-elevated`) y una sombra baja. En oscuro se suma un reflejo superior de 1 px, el patrón aprobado.
- **Jerarquía en 4 bandas**, sin aumentar la altura:
  1. Meta: número REQ (mono) · solicitante con icono.
  2. Título: 15 px / 500, hasta 2 líneas.
  3. Insignias: **prioridad (la única con relleno de color)**, área, vencimiento y «Dual (histórico)».
  4. Pie sobre una línea fina: progreso del checklist (barra de 44 px + `3/5`; verde al completar) a la izquierda; avatar con anillo personal, nombre y acción «Asignar» (44 px) a la derecha.
- **Sin responsable**: avatar vacío discontinuo y el texto «Sin responsable». La tarjeta no lleva franja.
- **Bloqueada**: tinte rojo, borde rojo y bloque «Bloqueado: motivo» con icono. Es independiente de la prioridad y del responsable.
- **Seleccionada**: borde y contorno del color de acción. La casilla se conserva.
- **Hover** (solo con puntero fino): sube 1 px, la sombra crece y el borde se oscurece. Entra en 150 ms y sale en 120 ms. No se anima con teclado ni con movimiento reducido.
- **Arrastrando**: sombra elevada. Antes la tarjeta bajaba a opacidad 75 %.

**Información conservada**: título, prioridad, solicitante, número REQ (o «Interno»), progreso, responsables (dos en proyectos duales), vencimiento, área, «Dual», casilla de selección, asignación rápida y menú. La prueba «conserva …» lo verifica selector por selector.

### 2.3 Los tres significados del color, separados

| Canal | Dónde | Dónde **no** |
|---|---|---|
| Etapa | Fondo de la columna, cabecera, acento superior, icono, contador; punto de etapa en la Tabla | Tarjeta |
| Prioridad | Insignia: Urgente rojo `#B91C1C`, Alto dorado `#EEBB31`, Medio azul `#1E3A8A`, Bajo neutro con contorno. Colores sin cambios (`PRIORITY_COLORS`) | Borde, fondo de tarjeta |
| Responsable | Franja lateral (`--owner`) y anillo del avatar, con el color de `internal_card_colors` (Supabase). La lógica `card-colors.ts` no cambia. | Prioridad, estado |
| Estado crítico | Tinte rojo, borde rojo, bloque «Bloqueado» y contador rojo de la columna; insignia «Bloqueado» en la Tabla | Franja, anillo |

### 2.4 Tabla (`TableView.tsx`)

- La columna nueva **Responsable** muestra el avatar con el mismo anillo personal que el Kanban, o «Sin responsable».
- **Fase**: punto de color de la etapa con el mismo `--stage` que la columna del Kanban.
- **Bloqueado**: insignia roja (`status-badge`), la misma familia que en la tarjeta.
- La prioridad usa la misma insignia (`PRIORITY_COLORS`) y la franja del responsable en la celda del título se conserva.
- La prueba compara los colores calculados de la Tabla con los del Kanban: misma insignia, mismo anillo y mismo tono de etapa.

## 3. Capturas

| Tema | Antes | Después |
|---|---|---|
| Tablero 1920 claro | `antes-kanban-light-1920.png` | `despues-kanban-light-1920.png` |
| Tablero 1920 oscuro | `antes-kanban-dark-1920.png` | `despues-kanban-dark-1920.png` |
| Columnas restantes (Code Review → Done) | `antes-kanban-{light,dark}-1920-columnas-restantes.png` | `despues-kanban-{light,dark}-1920-columnas-restantes.png` |
| Backlog / Analysis / Design / Development / Code Review / Testing / Deploy / Done | `antes-columna-<fase>-{light,dark}.png` | `despues-columna-<fase>-{light,dark}.png` |
| Hover de tarjeta | — | `despues-tarjeta-hover-{light,dark}.png` |
| Tabla | `antes-tabla-{light,dark}-1920.png` | `despues-tabla-{light,dark}-1920.png` |

Las prioridades distintas (Urgente en Analysis y Development, Alto en Backlog, Design y Testing, Medio y Bajo en el resto) y los distintos responsables (dorado, celeste intenso, azul, grafito y sin responsable) se ven en las capturas de columna. Todos los datos son ficticios (`tests/ui/kanban-attachments-fixtures.mjs`).
