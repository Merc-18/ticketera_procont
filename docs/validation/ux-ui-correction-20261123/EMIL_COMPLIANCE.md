# Cumplimiento Emil Design Engineering — `emil-design-eng`

Fuente: `emilkowalski/skills`, SKILL sha256 `cdbfe467…` (incluye `choreograph`). Criterios E1–E23, los mismos de la auditoría.
Las mediciones son de la re-auditoría final ([`data/reaudit-results.json`](data/reaudit-results.json) → `motion`, `reducedMotion`, `tab-*`).

## Inventario de movimiento después de la corrección

| Elemento | Antes | Después | Frecuencia / propósito |
|---|---|---|---|
| Curva | `--ease-out` propia, pero unos 100 elementos con la curva estándar de Tailwind | `transitionTimingFunction.DEFAULT = cubic-bezier(.23,1,.32,1)`; `transitionDuration.DEFAULT = 150ms`; todas las transiciones usan la curva del SKILL | — |
| Hover de botón | Solo opacidad; el fondo cambiaba de golpe | Fondo, borde, color y sombra con transición; −1 px con `(hover:hover) and (pointer:fine)`; 150 ms de entrada y 120 ms de salida | frecuente · feedback |
| Hover de tarjeta | −2 px | −2 px y borde más oscuro; anima desde el primer movimiento del puntero | ocasional · feedback |
| Presión | `scale(.985)` | `translateY(1px) scale(.98)`, 100 ms (con `hover:none`, solo la escala) | frecuente · feedback |
| Modal: entrada | opacidad + .98, 200 ms, `@starting-style` | Sin cambios; desactivada en modo teclado | ocasional · evitar el salto |
| Modal: salida | Ninguna (desmontaje inmediato) | Clon inerte (`aria-hidden`, `inert`, sin ids ni roles) que se desvanece en **120 ms**. Sin salida con teclado (Escape) | salida más rápida que la entrada |
| Acciones de teclado | `data-input=keyboard` desde el inicio, así que el hover del ratón no animaba antes del primer clic | Sin modo inicial: `keydown` activa teclado; `pointerdown` y `pointermove` activan puntero | E1 |
| Punto de fase | `animate-pulse` infinito | Estático | E19 |
| Movimiento reducido | Todo a `none` | Sin transformaciones; opacidad y color se mantienen (150 ms); el spinner pasa a un fundido de opacidad | E13 |
| Entrada de página | — | Kit Taste `m-enter` (una entrada por contenedor, `data-enter`), sin stagger en la interfaz frecuente | E15/E16 |

## Matriz E1–E23

| # | Criterio | Antes | Después | Evidencia |
|---|---|---|---|---|
| E1 | No animar acciones de teclado | PASS | PASS | `InteractionMode.tsx`; `tab-*` con `transition 0s` |
| E2 | Cada animación con propósito | PASS | PASS | inventario |
| E3 | Curvas propias | PARTIAL | **PASS** | `tailwind.config.ts` (DEFAULT) |
| E4 | Nunca `ease-in` | PASS | PASS | búsqueda |
| E5 | < 300 ms; modales de 200 a 500 ms | PASS | PASS | 100/120/150/200 ms |
| E6 | `:active` entre .95 y .98 | PARTIAL | **PASS** (.98) | `pressedTransform matrix(0.98, 0, 0, 0.98, 0, 1)` |
| E7 | Nunca desde `scale(0)` | PASS | PASS | — |
| E8 | Origen / centrado | PASS | PASS | — |
| E9 | Transiciones antes que keyframes | PASS | PASS | Keyframes solo en spinner, skeleton y `rm-fade` |
| E10 | `@starting-style` | PASS | PASS | `index.css` |
| E11 | Solo transform y opacity (más color) | PASS | PASS | `transition-property` |
| E12 | Hover dentro de `(hover:hover) and (pointer:fine)` | PASS | PASS | — |
| E13 | Movimiento reducido: menos, no cero | PARTIAL | **PASS** | `reducedMotion: transform none; opacity, color, background-color, border-color, outline-color; 0.15s` |
| E14 | Salida más rápida que la entrada | PARTIAL | **PASS** | modal 200 → 120 ms; hover 150/120 ms |
| E15 | Sin stagger en interfaz frecuente | PASS | PASS | — |
| E16 | Una entrada por contenedor | PASS | PASS | — |
| E17 | Cambio de estado sin saltos | PARTIAL | **PASS** | fondo de hover con transición |
| E18 | Rendimiento percibido | PASS | PASS | skeletons; precarga por intención de las rutas diferidas |
| E19 | Bucles de atención contenidos | FAIL | **PASS** | sin `animate-pulse` |
| E20 | Revisión Before/After/Why | PASS | PASS | este documento y REMEDIATION_MATRIX |
| E21 | Cohesión | PASS | PASS | capturas |
| E22 | Arrastre físico | NO VERIFICADO | NO VERIFICADO | `@hello-pangea/dnd` sin cambios; la prueba UX de arrastre cancelado pasa |
| E23 | Dispositivos reales | NO VERIFICADO | NO VERIFICADO | Solo Chromium emulado |

**Totales Emil.** Antes: PASS 15 · PARTIAL 5 · FAIL 1 · NO VERIFICADO 2. **Después: PASS 21 · NO VERIFICADO 2.**

## Incompatibilidad documentada

- **Escala de presión.** Emil pide 0,95–0,98 y Taste pide .985 más 1 px. Se aplica `scale(.98)` más 1 px, dentro del rango que pidió el usuario. En Taste queda como «PASS con incompatibilidad» (T10).
- **Momento por página.** Taste exige un momento asignado; Emil desaconseja animación decorativa en interfaz frecuente. Gana Emil, y en el gate Taste queda como FAIL de excepción autorizada (T11).
