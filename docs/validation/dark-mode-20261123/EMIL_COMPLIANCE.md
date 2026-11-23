# Cumplimiento Emil Design Engineering — `emil-design-eng` (modo oscuro)

Fuente: `emilkowalski/skills`, `skills/emil-design-eng/SKILL.md` sha256 `cdbfe467…`. Los criterios E1–E23 aprobados en la corrección UX/UI se conservan; aquí se documentan las decisiones nuevas del selector de tema.

## Decisiones del selector tomadas con la skill

| Pregunta de Emil (sección del SKILL) | Respuesta para el cambio de tema | Implementación |
|---|---|---|
| «How often will users see this animation?» (Framework 1) | Cambiar de tema es **ocasional**, así que lleva una animación estándar; no es una acción de cientos de veces al día | Un fundido de toda la página de 200 ms |
| «Never animate keyboard-initiated actions» | Si el cambio llega por teclado (Enter o Espacio con `data-input=keyboard`), es inmediato y sin animación | `setTheme()`: sin View Transition en modo teclado. Prueba «teclado»: 0 transiciones |
| «Only animate transform and opacity»; transiciones en el compositor | El fundido de View Transitions anima solo la opacidad de dos capturas de la página, en el compositor | `::view-transition-old/new(root)` |
| «Do colors transition smoothly, or do you see two distinct states overlapping?» / evitar `transition: all` | En lugar de que cientos de elementos animen su color por separado (y desfasados), se suspenden sus transiciones durante el cambio (`data-theme-switching`) y la página entera hace un único fundido | `src/index.css`, `src/lib/theme.ts`. Prueba «puntero»: exactamente 1 transición |
| Curva propia; nunca `ease-in` (Framework 3) | `var(--ease-out)` = `cubic-bezier(.23,1,.32,1)` | `src/index.css` |
| Duraciones de interfaz < 300 ms (Framework 4) | 200 ms (120 ms con movimiento reducido) | idem |
| «Reduced motion means fewer and gentler animations, not zero. Keep opacity and color transitions» | Con movimiento reducido se conserva el fundido, que es solo opacidad, más breve (120 ms). No se añade movimiento | Prueba «movimiento reducido» (lee la regla del CSSOM) |
| Botones con respuesta (`:active` 0,95–0,98) | Las opciones del selector son `button` y heredan la presión aprobada `translateY(1px) scale(.98)`; el hover solo cambia el tono | `src/index.css` |
| Tooltips | `title` nativo («Modo claro», «Modo oscuro»), además de `aria-label`; sin animación propia | `ThemeToggle.tsx` |
| Rendimiento percibido | El tema se aplica antes del primer pintado, así que no hay destello que «arreglar» después. Si el navegador no tiene View Transitions, el cambio es instantáneo | prueba «persistencia sin destello» |
| Revisión antes/después (E20) | Tabla de tokens claro/oscuro y capturas comparativas | THEME_TOKENS.md, `screenshots/` |

## Criterios aprobados conservados (medidos en oscuro)

| Medición | Claro | Oscuro |
|---|---|---|
| Hover antes del primer clic | pointer, 0,15 s, −2 px | idéntico |
| Presión | `matrix(0.98, 0, 0, 0.98, 0, 1)` | idéntico |
| Movimiento reducido | `transform: none`; opacidad y color 0,15 s | idéntico |
| Foco con teclado | anillo de 2 px sin transición | idéntico, color `#93C5FD` (≥ 9,5:1) |
| Modal | 200 ms de entrada, 120 ms de salida | mismas reglas CSS (no dependen del tema) |

Fuente: `data/reaudit-dark-results.json` → `motion`, `reducedMotion`, `tab-*`.

**Totales Emil:** PASS 21 (sin cambios) · NO VERIFICADO 2 (E22 arrastre físico y E23 dispositivos reales, como antes) · más los 10 criterios del selector de tema anteriores, todos PASS.
