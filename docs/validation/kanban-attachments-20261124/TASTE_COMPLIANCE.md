# Cumplimiento Taste — `design-taste-frontend` 2.5.1

Fuente leída: la copia de auditoría del proyecto, `.agent-workspaces/claude-integration/.agent-artifacts/audit/skills/upstream/taste-SKILL.md` (idéntica a `taste-skill-main/skills/taste-skill/SKILL.md`, CHANGELOG 2.5.1 del 07/11/2026), con sus referencias `system.md`, `motion.md`, `cards.md` y `gate.md`.

## Gate

**No se reinicia.** El gate histórico sigue en `GATE: OPEN 14 (rounds used up)` ([ux-ui-correction-20261123](../ux-ui-correction-20261123/TASTE_COMPLIANCE.md)). Esta tarea no lo vuelve a armar ni lo presenta como PASS. Sus reglas de página (hero a pantalla completa, una sección por pantalla, «momento» animado) son de sitios de aterrizaje y no se aplican a un tablero ni a un formulario operativo, la misma excepción autorizada en las rondas anteriores. Se aplican los criterios del sistema, el color, las tarjetas, el movimiento, la accesibilidad y los teléfonos.

## Criterios aplicados

| Criterio Taste | Dónde | Aplicación | Estado |
|---|---|---|---|
| Un solo sistema: un estilo de tarjeta, una escala de radios, un aspecto de enlace (§5 «One system») | Tarjetas, columnas, adjuntos | Mismos tokens (`--p-*`, `--r-sm/md`, `--line`); la tarjeta tiene un borde, una sombra y un radio; los botones son `ui-button` | Cumple |
| Color con función, nunca decoración; acento con moderación | Columnas | Tono de etapa al 5–9 % y una sola barra de 3 px por columna. La barra azul de cada tarjeta se eliminó. Prioridad, etapa y responsable tienen cada uno un canal propio | Cumple |
| Nunca violeta ni lavanda (§6) | Paleta de etapas | Acentos entre 0° y 210° de matiz; la prueba lo verifica | Cumple |
| Paleta oficial intacta (`#1E3A8A`, `#01257B`, `#EEBB31`) | Etapa *build* = azul Procont; *review* = dorado Procont; prioridades sin cambios | Sin colores de marca nuevos | Cumple |
| Tarjetas: un escalón sobre su fondo, borde fino, reflejo de 1 px en oscuro (`cards.md`) | `.project-card` | Elevada sobre la columna teñida; en oscuro, `inset 0 1px 0 rgb(255 255 255 / .05)` | Cumple |
| Una tarjeta enlazada sube 2 px al pasar el puntero (regla 5) | `.project-card:hover` | Sube **1 px**: el tablero es denso y se usa muchas veces al día; Emil pide reducir el hover frecuente. Desviación declarada, como el `.98` de presión de la ronda anterior | Cumple con ajuste |
| El hover solo con puntero fino; salida 120 ms, entrada 150 ms (`motion.md`) | Tarjeta, zona de adjuntos, «Quitar» | `@media (hover:hover) and (pointer:fine)`; 150/120 ms | Cumple |
| Anillo de foco visible al instante (`motion.md`, `focus-ring`) | Zona de adjuntos, botones | `outline 2px var(--p-focus)` sin transición | Cumple |
| Etiquetas visibles y nombres accesibles (`field-label`, `a11y-name`) | Zona (`aria-labelledby` + `aria-describedby`), input (incluye el texto visible), «Quitar «X»» | — | Cumple |
| Objetivos de 44 px (`tap-size`) | «Asignar», «Quitar», «Seleccionar archivos», casilla de 20 px en tarjeta (existente) | Medido en la prueba responsive | Cumple |
| Teléfonos: nada encima de nada ni fuera de pantalla a 320 (`collide`, `off-viewport`) | Kanban y adjuntos | Sin desplazamiento horizontal a 320/360/390/768; las filas de adjuntos se reordenan en dos líneas | Cumple |
| Texto legible ≥ 16 px en párrafos de lectura | Ayudas de la zona | Ayuda a 14 px: es meta de un control, como las etiquetas de la barra de filtros. La instrucción principal va a 15 px/500 | Cumple con ajuste |
| Errores bajo su campo, confirmación solo tras un envío real (`forms`, `form-send`) | Avisos de adjuntos; recibo | Avisos junto a la zona; «Se adjuntaron N…» solo después de las subidas reales | Cumple |
| Sin animaciones decorativas (§6 «Never») | Todo | No hay entradas, rebotes ni bucles; solo color y borde en el arrastre, 1 px en el hover y el medidor por `transform` | Cumple |
| No editar archivos del kit (§6) | — | El kit en `public/assets` no se tocó | Cumple |

## Lo que no se aplicó y por qué

| Regla | Motivo |
|---|---|
| `hero-enter`, `moment-none`, una sección por pantalla | Son reglas de página de aterrizaje; el tablero y el formulario son vistas operativas (excepción autorizada T7/T11) |
| Fotografías, iconos de marca a todo color | No aplican a un tablero interno |
