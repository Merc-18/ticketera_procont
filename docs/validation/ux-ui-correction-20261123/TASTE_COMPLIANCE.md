# Cumplimiento Taste — `design-taste-frontend` 2.5.1

Fuente: `Leonxlnx/taste-skill`, SKILL.md sha256 `0c7a5852…` (procedencia en
[`../ux-ui-audit-20261123/data/skills-provenance.json`](../ux-ui-audit-20261123/data/skills-provenance.json)). Referencias
leídas: `system.md`, `motion.md`, `gate.md` y `perf.md`. Mismos criterios T1–T33 de la auditoría.

## 1. Gate

| Ejecución | Build | Resultado | Evidencia |
|---|---|---|---|
| Histórica (20/11) | 202611201220 | `GATE: OPEN 19 (rounds used up)` | Se conserva sin cambios y **no se reinicia ni se convierte en PASS** ([auditoría](../ux-ui-audit-20261123/REPORT.md)) |
| Ronda 1 (build nuevo, `--start --new`) | build corregido | `FAIL 18 (round 1 of 3)` | [round1.log](data/taste-gate/round1.log) |
| Ronda 2 | — | `FAIL 19 (round 2 of 3)`: al pasar a `<section>` se activaron las reglas de pantalla completa; se volvió a `div` con `.wrap` | [round2.log](data/taste-gate/round2.log) |
| Ronda 3 | — | **`GATE: OPEN 14 (rounds used up)`**, 5 waivers | [round3.log](data/taste-gate/round3.log), [waivers.json](data/taste-gate/waivers.json), [gate.json](data/taste-gate/gate.json) |

Según `gate.md`, con las rondas agotadas el gate queda OPEN y el agente debe dejar de corregir y llevar los FAIL abiertos y los waivers al informe. Es lo que se hace aquí.

**Waivers (5):**

1. `flush`: el texto de la tarjeta queda a 30–32 px dentro de su relleno (cards.md: 24–32 px).
2. `section-height` (pie `build-version`): la etiqueta de versión es obligatoria en todas las pantallas (D-023) y no es una sección.
3. `container-edges` (`div#root`): es el punto de montaje de React en una app existente (SKILL §4.0).
4. `container-edges` (h2 de la tarjeta 2): segunda columna de la rejilla.
5. `container-edges` (h2 de la tarjeta 1): título dentro del relleno de su tarjeta.

**FAIL abiertos del portal (14) y por qué no se corrigen:**

| Regla | Elemento | Motivo |
|---|---|---|
| `hero-fill`, `hero-screen` ×2, `one-section`, `section-height` | cabecera y accesos del portal | Taste pide una sección por pantalla y un hero a pantalla completa. El portal aprobado (D-033) es una mesa operativa: cabecera más dos tarjetas en la primera pantalla. Estirar a 100vh empuja los accesos bajo el pliegue y empeora la tarea principal. Es la excepción autorizada del 20/11 (T7) |
| `cta` ×2 | hero | Las acciones son las dos tarjetas que aprobó el usuario («Nueva Solicitud», «Rastrear Solicitud»), no botones dentro del hero |
| `moment-none` | página | Taste pide un «momento» por página. Emil lo desaconseja en una interfaz de uso frecuente. Excepción autorizada (T11). Existe la entrada `m-enter` del kit |
| `one-heading` | dos h2 de tarjeta | Las dos tarjetas son el contenido aprobado; un solo h2 ocultaría un acceso |
| `container-edges` ×3 | hero, `.wrap` de 760 px, pie de versión | **Cierre: los 2 de la cabecera están corregidos** (ver §1b). Queda el pie de versión, metadato global (D-023), cubierto por waiver |
| `spill` | «© 2026 Procont Business» | **Cierre: corregido** (venía de la misma medida de 760 px; ver §1b) |
| `section-air` | línea superior del copyright | **Cierre: corregido** (separación por aire, sin línea; ver §1b) |

## 1b. Cierre: FAIL accionables del gate corregidos sin cambiar la composición

Las rondas del gate están agotadas y **no se reinician**. Para comprobar los ajustes se ejecutó el mismo checker (`consistency.mjs`) sobre `/portal` con las opciones del gate (`--page software`, la misma categoría y la misma acción principal, 1440 y 390 px), fuera de rondas, antes y después del cambio. El conteo es por ancho y sin waivers, así que no se compara con el «14» del gate, que agrupa por regla.

| Ajuste | Regla | Antes → después |
|---|---|---|
| La medida de 760 px pasa del `.wrap` de la cabecera a un `div.hero-text`: todos los bloques comparten el mismo contenedor y el texto ocupa la misma posición | `container-edges` (cabecera: márgenes 80/600; «0 .hero-text»), `spill` | `container-edges` 12 → 9; los 9 restantes son exactamente los 4 elementos con waiver (`div#root`, pie de versión, h2 de cada tarjeta) en los dos anchos |
| El copyright se separa con aire (72 px) en lugar de una línea superior | `section-air` (SR-3) | 3 → 0 |
| **Total checker `/portal`** | — | **48 FAIL → 43 FAIL** (4 WARN sin cambio) |

Logs: [antes](cierre/data/taste-gate/checker-portal-antes.log), [después](cierre/data/taste-gate/checker-portal-despues.log), [script](cierre/data/taste-gate/checker-portal.mjs). Capturas del portal después del ajuste: [`cierre/screenshots/*-01-portal.png`](cierre/screenshots/).

**FAIL no accionables (y por qué):**

| Regla | Lo que exige | Por qué no se aplica |
|---|---|---|
| `hero-fill`, `hero-screen`, `one-section`, `section-height` | Hero de 100svh solo; cada sección de una o dos pantallas exactas | Empujaría las dos tarjetas de acceso, que son la tarea principal, debajo del pliegue. Cambia la composición aprobada (D-033). Excepción autorizada T7 |
| `cta` | Botón dentro del hero y en la sección de cierre | Las acciones aprobadas son las dos tarjetas («Nueva Solicitud», «Rastrear Solicitud»). Un botón extra duplicaría la acción |
| `moment-none` | Un «momento» animado por página | Emil desaconseja animación decorativa en interfaz frecuente. Excepción autorizada T11 |
| `one-heading` | Un solo h2 por sección | Hay dos tarjetas aprobadas con su h2; unirlas ocultaría un acceso |
| `flush`, `container-edges` (waiver) | — | Cubiertos por los 5 waivers en `waivers.json` |

**Estado del gate: sigue en `OPEN 14 (rounds used up)`.** No se reinicia ni se presenta como PASS. Todos los criterios accionables están corregidos con evidencia.

## 2. Checker `consistency.mjs` sobre otras rutas (fuera de rondas)

| Ruta | Antes (corrección intermedia) | Final | Reglas restantes |
|---|---|---|---|
| `/cliente` | 27 FAIL · 10 WARN (incluido `heading-scale` ×2) | 28 FAIL · 9 WARN (aparece `no-visual` ×2 al medir dos pantallas; desaparece `heading-scale`) | `container-edges`, `cta`, `flush`, `hero-fill`, `hero-screen`, `no-visual`, `one-heading`, `one-section`, `section-height`, `copy-headline`: todas son reglas de composición de landing. **`heading-scale` corregido** |
| `/tracking` | 13 FAIL | 13 FAIL · 4 WARN (390 px: 0 FAIL) | `container-edges`, `hero-screen`, `one-section`, `section-height` |

Todas las comprobaciones básicas del checker (contraste, foco, tamaños, idioma, desbordamiento) pasan en ambas rutas. Logs: [checker-final-cliente.log](data/taste-gate/checker-final-cliente.log) y [checker-final-tracking.log](data/taste-gate/checker-final-tracking.log). Los anteriores se conservan.

## 3. Matriz T1–T33 (antes → después)

| # | Criterio | Antes | Después | Evidencia |
|---|---|---|---|---|
| T1 | Clase de negocio declarada | PASS | PASS | `index.html` |
| T2 | Gate armado y ejecutado | PARTIAL | **PARTIAL**: gate sobre el portal, checker sobre `/cliente` y `/tracking`. El panel requiere sesión, así que se evalúa con la re-auditoría y no con el gate | §1–2. No accionable: el gate no permite repetir rondas |
| T3 | Terminar en PASS u OPEN con los FAIL en el informe | PARTIAL | **PASS** (OPEN 14 informado con waivers en `waivers.json`; no es `GATE: PASS`) | §1 |
| T4 | Comprobar el build publicado y repetir tras cada cambio | FAIL | **PARTIAL**: gate sobre el build corregido; checker (portal, cliente, tracking) y re-auditoría repetidos tras cada cambio posterior. El gate en sí no puede repetirse porque sus rondas están agotadas | §1–2, §1b |
| T5 | Paleta y tipografía del cliente | PARTIAL | **PASS**: paleta oficial (D-037); tipografía `host` | `brand.ts` |
| T6 | Kit y capa de movimiento | FAIL | **PASS**: `public/assets/motion/` sin editar; aliases del kit en `:root` | sha256 en el REPORT |
| T7 | Una sección por pantalla; hero solo en la primera | FAIL (exc.) | **FAIL (excepción autorizada)** | §1 |
| T8 | Bordes iguales | PARTIAL | **PASS** (cierre): un solo contenedor por bloque; la medida de lectura va en `.hero-text`. Los `container-edges` que quedan son los 4 con waiver | §1b |
| T9 | La tarjeta enlazada sube 2 px | PASS | PASS | `motion.hoverBeforeClick` −2 px |
| T10 | Hover −1 px; presión +1 px y escala | PARTIAL | **PASS con incompatibilidad**: −1 px y `translateY(1px) scale(.98)`. Taste dice .985 y Emil .95–.98; se aplica .98 | `pressedTransform` |
| T11 | Entrada del hero y momento | FAIL (exc.) | **FAIL (excepción autorizada)**: hay entrada `m-enter` pero no momento | §1 |
| T12 | Hover con puntero fino, 150/120 ms | PARTIAL | **PASS**: anima desde el primer movimiento | re-auditoría |
| T13 | Solo transform, opacity y color | PASS | PASS | `index.css` |
| T14 | Anillo de foco de 2 px inmediato | PASS | PASS | `tab-*` (100 % visibles, `transition 0s`) |
| T15 | Movimiento reducido conserva color y opacidad | PARTIAL | **PASS** | `reducedMotion` |
| T16 | Sin reveal por scroll, parallax ni carrusel | PASS | PASS | código |
| T17 | Sin punto pulsante aislado | FAIL | **PASS** | `ChecklistSection.tsx` |
| T18 | Nunca violeta | FAIL | **PASS** | búsqueda y colores renderizados |
| T19 | Interfaz 90–95 % neutra | PARTIAL | **PASS**: columnas de fase neutras y colores de gráfico de la paleta | capturas |
| T20 | Un sistema de botones e iconos; un relleno por vista | PARTIAL | **PASS**: `ui-button-*` e `Icon`; 0 emoji | `renderedEmoji 0` |
| T21 | Escala de radio | PASS | PASS | `--r-*` |
| T22 | Nada por debajo de 13 px | PARTIAL | **PASS** | `under13px 0` |
| T23 | Lectura a 16 px | PARTIAL | **PASS** | `readingTextUnder16 0` |
| T24 | Tipo frase, sin versales | PARTIAL | **PASS con observación**: sin `uppercase`. «Nueva Solicitud» y «Rastrear Solicitud» van con mayúsculas porque así los nombró el usuario (D-033) | búsqueda |
| T25 | Tinta 7:1, atenuado 4,5:1 | PARTIAL | **PASS**: tinta 14,0:1, atenuado 7,2:1, meta 4,76:1 | `lowContrastCount 0` |
| T26 | Etiquetas visibles, orden de encabezados, h1 | PARTIAL | **PASS** | `unlabeledFields 0`, `headingSkips 0`, h1 115/115 |
| T27 | Formularios: errores por campo, botón activo, estado | PARTIAL | **PASS** | H-11 |
| T28 | Objetivos de 44 px | PARTIAL | **PASS** (los únicos < 24 px son el skip link oculto 1×1 y el input de archivo oculto) | ACCESSIBILITY_REPORT |
| T29 | Nada fuera de pantalla a 320/390 | PASS | PASS | `overflow320` = 0 en 6 rutas |
| T30 | Presupuesto JS 450/900 KiB | PARTIAL | **PARTIAL** (cierre): portal, `/tracking`, `/cliente/nuevo` directo, dashboard y **bandeja** en PASS; cliente acumulado 466,6, Kanban 567,9 e importador 782,6 en WARN, ninguno en FAIL. No accionable sin cambiar dependencias (PERFORMANCE_REPORT) | [`cierre/data/browser-bundle.json`](cierre/data/browser-bundle.json) |
| T31 | Cabecera con `og:*` | PARTIAL | **PASS** | `index.html`, `public/share.jpg` |
| T32 | Copy y lint de copy | NO VERIFICADO | **PARTIAL**: el checker marca `copy-headline` en `/cliente` («¿Qué producto utilizas para ingresar?» no nombra el producto) y `copy-buttons` WARN («Buscar»). Son textos funcionales aprobados y se mantienen | logs |
| T33 | Fotografía y escenas | N/A | N/A | — |

**Totales Taste.** Antes: PASS 7 · PARTIAL 18 · FAIL 6 · NO VERIFICADO 1 · N/A 1. Corrección (`9fc4afa`): PASS 25 · PARTIAL 5 · FAIL 2 · N/A 1. **Cierre: PASS 26 · PARTIAL 4 (T2, T4, T30, T32: ninguno accionable sin romper una restricción; ver la tabla) · FAIL 2 (T7 y T11, excepciones autorizadas) · N/A 1.**
