# Cumplimiento Emil — `emil-design-eng`

Fuente leída: `.agent-workspaces/claude-integration/.agent-artifacts/audit/skills/upstream/emil-SKILL.md` (idéntica a `emil/skills-main/skills/emil-design-eng/SKILL.md`).

## Marco de decisión aplicado

| Pregunta Emil | Tarjeta (hover) | Zona de adjuntos (arrastre) | Lista de adjuntos |
|---|---|---|---|
| ¿Con qué frecuencia? | Decenas de veces al día → reducir | Ocasional | Ocasional |
| ¿Para qué? | Respuesta al puntero | Indicar el estado: «aquí se puede soltar» | Evitar cambios bruscos |
| Curva | `--ease-out` `cubic-bezier(.23,1,.32,1)` (la del sistema) | ídem | — |
| Duración | 150 ms al entrar, 120 ms al salir | 150 ms (color, borde, sombra) | Sin animación: aparece al instante |
| Propiedades | `transform`, `box-shadow`, `border-color` | `background-color`, `border-color`, `box-shadow` | — |

## Revisión Antes / Después

| Before | After | Why |
| --- | --- | --- |
| `border-top: 3px` de prioridad en cada tarjeta (azul en la mayoría) | Borde de 1 px neutro; la prioridad solo en la insignia | El detalle repetido en cada tarjeta se convierte en ruido; un dato, un lugar |
| Columnas idénticas (`--p-alt`) | Tinte de etapa del 5–9 %, una barra de 3 px por columna, contador teñido | La identidad se lee de un vistazo sin pintar la columna entera |
| Tarjeta arrastrada a `opacity: .75` | Sombra elevada (`is-dragging`) | Lo que se levanta debe parecer levantado, no desvanecido |
| Hover de tarjeta inexistente | `translateY(-1px)` y sombra, solo con `(hover:hover) and (pointer:fine)` | Hover frecuente: mínimo y nunca en táctil (falsos positivos al tocar) |
| Columna al recibir: `bg-brand-50 ring-2 ring-primary` para todas | Tinte y contorno en el tono de la etapa | La respuesta pertenece al destino que la recibe |
| Zona de adjuntos sin estado de arrastre | Borde sólido, tinte, halo de 4 px, icono relleno; transición de 150 ms solo de color | Indicar el estado; sin desplazamientos (Emil: solo transform/opacidad en movimiento; aquí no hay movimiento) |
| Barra de uso con `width` | `transform: scaleX()` de 200 ms | Solo propiedades del compositor |
| Quitar adjunto: el foco se perdía | El foco vuelve a la zona | Detalle invisible que evita que el usuario de teclado se pierda |
| Pegar con el foco dentro de un campo de texto | No se intercepta | No romper lo que el usuario espera |
| `transition: all` | No existe; propiedades explícitas | Lista de comprobación Emil |

## Lista de comprobación

| Punto | Estado |
|---|---|
| Sin `transition: all` | Cumple |
| Sin entradas desde `scale(0)` | Cumple (no hay entradas) |
| Sin `ease-in` | Cumple |
| Nada se anima con teclado (`html[data-input=keyboard]` lo anula todo, regla existente) | Cumple |
| Duraciones ≤ 300 ms | Cumple (120–200 ms) |
| Hover detrás de `(hover:hover) and (pointer:fine)` | Cumple |
| Salida más rápida que la entrada | Cumple (120 / 150 ms) |
| Presión `scale(.98)` en botones | Heredada del sistema (sin cambios) |
| Movimiento reducido: sin desplazamientos, se conservan color y opacidad | Cumple: `.project-card:hover { transform: none }` bajo `prefers-reduced-motion`; la regla global existente limita las transiciones a color y opacidad (verificado en la prueba) |
| Animaciones decorativas | Ninguna |
