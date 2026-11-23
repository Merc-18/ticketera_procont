# Auditoría integral UX/UI — Ticketera Procont

Fecha: 23/11/2026. Auditor: Claude Code. Tipo: auditoría (sin cambios en la aplicación, sin commits).

Clases de evidencia usadas en todo el informe:

- **[PROD]** dominio oficial real, rutas públicas: solo navegación y conmutadores de interfaz, sin credenciales ni envíos, 0 peticiones no-GET registradas.
- **[SIM]** build local del mismo `main`, servido contra el servidor de fixtures del repositorio: datos ficticios y red externa bloqueada. Sirve para las vistas privadas; **no es producción**.
- **[CÓDIGO]** lectura del código de `main`.
- **[HIST]** evidencias anteriores del repositorio; se usan solo cuando el código no cambió.

## 1. Resumen ejecutivo

| Área | Resultado |
|---|---|
| Portal público | Cumple la dirección aprobada |
| Ingreso Quipu/QuipuFac | Cumple la dirección aprobada |
| Espacio del cliente | Cumple la dirección aprobada |
| Panel interno | **No la cumple** en varios criterios explícitos |

El portal, el ingreso y el espacio del cliente muestran la dirección SaaS corporativa con contraste medio.
En la interfaz pública no hay desbordamiento horizontal (comprobado a 320 px) y todo el texto cumple AA.
El JavaScript inicial está dentro del presupuesto de Taste. Las reglas de identidad, prioridad y subproyectos se ven correctamente.

El panel interno, en cambio, falla en varios criterios explícitos de las skills y de WCAG:
- violeta y púrpura, que Taste prohíbe;
- emojis mezclados con iconos Lucide;
- dos botones rellenos en una misma vista;
- textos y botones por debajo de AA, entre ellos la acción principal del modal de validación (3,15:1);
- ningún `h1`.

Hay además dos problemas de base:
- **Taste no se cerró con `GATE: PASS`.** El único gate registrado terminó `GATE: OPEN 19 (rounds used up)`, solo sobre `/portal` y sobre una versión anterior (portal de tres tarjetas). Nunca se ejecutó sobre el cliente ni sobre el panel.
- **La paleta usada no es la oficial medida.** Se usa `#173D66`/`#D5AE54` donde el sitio y el logo oficiales usan `#1E3A8A`/`#01257B`/`#EEBB31`/`#FFCC2A` (ΔE2000 entre 6,3 y 10,8). DECISION_LOG no registra esa aprobación.

Emil se aplica bien en lo esencial:
- easing propio, duraciones cortas, sin movimiento en acciones de teclado, sin stagger y sin escalar desde 0;
- hover limitado a punteros finos, modal centrado de 200 ms.

Tiene desviaciones menores:
- la presión de los botones (escala .985, fuera del rango 0,95–0,98);
- el movimiento reducido, que lo anula todo en vez de conservar opacidad y color;
- el hover, que no transiciona antes del primer clic.

**Dictamen: NO APROBADO.** El detalle está en la sección 18. Los defectos se concentran en el panel interno y son corregibles.

## 2. Versión de producción auditada

| Dato | Valor |
|---|---|
| `main` remoto (única rama) | `a1d9e9c07000007b83e063f19a3ff2e24a5b8f1b` |
| Versión servida | **Versión 202611231118** ([manifest-prod.json](manifest-prod.json)) |
| Correspondencia código ↔ despliegue | Build local de `a1d9e9c` con los mismos valores públicos `VITE_*` que lleva el bundle servido. Los **15/15 assets** son idénticos a los servidos, salvo la cadena de versión y los hashes de nombre ([data/code-correspondence.json](data/code-correspondence.json)). |
| Versiones de los builds [SIM] | 202611231143 y 202611231149, construidos del mismo `a1d9e9c` |

Las galerías anteriores (202611231008, 202611231023) no se usan como prueba de esta versión.

## 3. Skills localizadas y versiones

| Skill | Archivo leído íntegro | SHA-256 | Procedencia |
|---|---|---|---|
| `design-taste-frontend` 2.5.1 | `skills/taste-skill/SKILL.md` (381 líneas) + `references/system.md`, `motion.md`, `gate.md`, `perf.md`, `CHANGELOG.md` | `0c7a5852…6206` | ZIP del equipo (20/11) **idéntico byte a byte** a `github.com/Leonxlnx/taste-skill` (último cambio `b900a80`, 07/11). **`github.com/emilkowalski/taste-skill` no existe (HTTP 404)**: la referencia indicada en el encargo es incorrecta. |
| `emil-design-eng` | `skills/emil-design-eng/SKILL.md` (684 líneas) + `skills/choreograph/SKILL.md` (al que remite) | `cdbfe467…7da6` | ZIP idéntico byte a byte a `github.com/emilkowalski/skills` (último cambio `0f2e23b`, 13/11). |

Detalle: [data/skills-provenance.json](data/skills-provenance.json).
Las dos skills quedan **VERIFICADAS**: se leyó su contenido original y no se sustituyó ninguna metodología.

Taste está escrita para sitios web de empresa (landing pages), aunque declara explícitamente App/SaaS en su tabla de tipos.
Por eso sus criterios se aplican literalmente y se marca cuándo una regla de página comercial entra en conflicto con una aplicación operativa.
En esos casos se marca **FAIL (excepción autorizada)**: no se convierte en PASS ni en N/A.

## 4. Matriz Taste Skill (`design-taste-frontend` 2.5.1)

Tipo: **P** = proceso, **V** = resultado visual, **T** = implementación técnica.

| # | Criterio original (ubicación) | Tipo | Aplicación en Ticketera | Evidencia | Resultado |
|---|---|---|---|---|---|
| T1 | Declarar la clase de negocio: `data-type`, `page-type`, `site-kind` (SKILL §1) | P/T | `software` en `<html>` y metas | `index.html` | PASS |
| T2 | Armar el gate antes de la página y ejecutarlo (SKILL §4.1, gate.md) | P | Gate armado y ejecutado, solo sobre `/portal` | [taste-gate.log](../ux-ui-four-areas/taste-gate.log) | PARTIAL |
| T3 | Terminar en `GATE: PASS`, o en `OPEN` con los FAIL en el informe (gate.md) | P | `GATE: OPEN 19 (rounds used up)`; 12 «excepciones» y 7 «falsos positivos» documentados fuera del gate, sin `waivers.json` | [taste-findings.md](../ux-ui-final-adjustments-20261120/taste-findings.md) | PARTIAL (no es PASS) |
| T4 | Comprobar el build tal como se publica; volver a ejecutar tras cada cambio (gate.md) | P | Gate no ejecutado tras pasar a dos tarjetas (el log muestra «Mis tickets» y la versión 202611201220); nunca sobre cliente ni panel | log citado | FAIL |
| T5 | Repartir paleta y tipografía; los colores del cliente, vía `start.mjs brand` (SKILL §4.4) | P/V | Tipografía `host` asignada (Host Grotesk + JetBrains Mono). Paleta sustituida por `#173D66`/`#D5AE54`, que no son los colores del logo | `src/index.css`, sección 4 de identidad | PARTIAL |
| T6 | Copiar el kit (`system.css`, capa de movimiento) y usar sus clases; «la capa de movimiento no es opcional» (SKILL §4.0, motion.md) | P/T | Sin kit en `public/`; tokens reimplementados en `index.css` | `public/` | FAIL |
| T7 | Regla 3: una sección por pantalla, el hero solo en la primera (SKILL) | V | Portal operativo de cabecera + accesos | [PROD] `desktop-01-portal.png` | FAIL (excepción autorizada 20/11) |
| T8 | Regla 4: bordes izquierdo y derecho iguales (SKILL, system.md) | V | `.page-wrap` 1280 px centrado; visualmente alineado. El gate marcó `container-edges` estructurales | [PROD] capturas; log | PARTIAL |
| T9 | Regla 5: la tarjeta enlazada sube 2 px y su borde se oscurece (motion.md) | V/T | `.portal-option:hover` −2 px, borde `#8ca3bc` | `index.css` | PASS |
| T10 | Botón: sube 1 px en hover; en presión baja 1 px y escala .985 (motion.md) | T | Solo escala .985 en presión; sin paso de hover ni hundimiento de 1 px | `index.css` | PARTIAL |
| T11 | Entrada del hero y un momento asignado en cada página; el gate los cuenta como FAIL (SKILL regla 5, motion.md) | V | Ninguno | código, log (`moment-none`) | FAIL (excepción autorizada) |
| T12 | Hover solo con puntero fino; 150 ms de entrada y 120 ms de salida (motion.md) | T | Limitado a `(hover:hover) and (pointer:fine)`; 150/120 ms. **Antes del primer clic, 0 s**: `InteractionMode` arranca en «keyboard» | [PROD] `results.json` → `hover` | PARTIAL |
| T13 | Animar solo transform, scale y opacity (más color en hover); nunca width, height ni margin (motion.md) | T | Cumplido | `index.css`; búsqueda en `src` | PASS |
| T14 | Anillo de foco de 2 px en el color de acción, sin transición e inmediato (system.md, motion.md) | T/V | Anillo visible en el 100 % de las paradas de Tab; `transition 0s`; 9,5–10,6:1 | [PROD] `tab-*` | PASS |
| T15 | Movimiento reducido: todo en reposo, nada oculto, **los colores siguen cambiando, la presión como tono** (motion.md) | T | Se anula todo, incluidos color y opacidad; la presión no da ninguna señal | `index.css` `@media (prefers-reduced-motion)`; [PROD] `reducedMotion` | PARTIAL |
| T16 | Nunca: aparición al hacer scroll, parallax, carrusel ni parpadeo (SKILL §6) | T | Nada de eso | código | PASS |
| T17 | Sin punto pulsante aislado fuera de un visual en bucle (motion.md) | T | Punto `animate-pulse` en la fase actual del checklist | `ChecklistSection.tsx:117` | FAIL (menor) |
| T18 | **Nunca violeta ni lavanda** en el diseño propio (SKILL §6, system.md) | V | Columna Development (`bg-purple-600`), avatares `#A855F7`, contadores `#B16FEF`, badges `purple`/`indigo`, token `info #8B5CF6` | [SIM] `laptop-33-kanban.png`; `KanbanBoard.tsx:51`, `constants.ts:4`, `ProjectCard.tsx:109`, `DashboardView.tsx:188` | FAIL |
| T19 | Interfaz 90–95 % neutra, un acento a lo sumo (system.md) | V | Portal y cliente: PASS. Panel: varios colores saturados además del violeta | [PROD]/[SIM] inventario de colores | PARTIAL |
| T20 | Un sistema: un par de botones, una tarjeta, un estilo de enlace; un solo botón relleno por vista (system.md) | V | Cliente: PASS. Dashboard: dos rellenos (azul «Activos CSV» y verde «Completados CSV»). Iconos Lucide + emojis | [SIM] `laptop-30-dashboard.png` | PARTIAL |
| T21 | Escala de radio `soft` 8/12/20 (system.md) | T | `--r-sm/md/lg` 8/12/20 | `index.css` | PASS |
| T22 | Nada por debajo de 13 px (system.md) | V | Público: PASS. Iniciales de avatar en Kanban a 9 px | [SIM] métricas | PARTIAL |
| T23 | Texto de lectura de 16 px o más; nunca párrafos de 14 px (system.md) | V | Ayudas e instrucciones de 13–14 px en ingreso, formulario, bandeja y panel | [PROD]/[SIM] `readingTextUnder16` | PARTIAL |
| T24 | Tipo frase; etiquetas de 13 px/500; nunca versales espaciadas (system.md) | V | «SOLICITUD DEL CLIENTE», «CLASIFICACIÓN INTERNA», «SOLICITUDES URGENTES…» en versales | [SIM] modal y dashboard; `RequestValidationModal.tsx:127,159`, `DashboardView.tsx:104,337` | PARTIAL |
| T25 | Contraste: tinta 7:1, texto atenuado 4,5:1 (system.md) | V | Tinta 9,9:1 y atenuado 5,13:1 en público y cliente. En el panel hay textos de 2,0–4,4:1 | [SIM] `lowContrast` | PARTIAL |
| T26 | Acceso: nombres, etiquetas visibles (`aria-label` solo no basta), orden de encabezados, skip link y `lang` (system.md) | T | Nombres, skip link y `lang`: PASS. Búsqueda REQ y filtros del panel solo con `aria-label`. Panel sin `h1` | [PROD]/[SIM] | PARTIAL |
| T27 | Formularios: campos de 48 px, etiqueta encima, errores bajo cada campo, botón activo hasta pulsarlo, línea de estado (system.md) | T/V | 48 px y etiquetas: PASS. «Enviar» deshabilitado sin producto; validación nativa + un mensaje general; sin `aria-invalid` por campo | [SIM] `25-*`; `PublicRequestForm.tsx` | PARTIAL |
| T28 | Objetivos de 44 px fuera del texto corrido (SKILL §5) | V | Cliente y público mayoritariamente PASS. «← Inicio» de 49×20 en `/tracking`; cierre de modal de 20×36; panel de escritorio a 36 px | [PROD]/[SIM] | PARTIAL |
| T29 | Nada fuera de la pantalla a 320 y 390 (SKILL §5) | V | Desbordamiento 0 a 320 [PROD], 360 y 390 [PROD]/[SIM] | métricas `overflow` | PASS |
| T30 | Presupuesto: JS 450/900 KiB, CLS, LCP, fuentes, peticiones (perf.md) | T | Portal y cliente: 442,4 KiB, CLS 0, LCP 0,57 s, 2 archivos de fuente (50 KiB), 6 peticiones. Panel: 463–836 KiB, WARN | [PROD] `load-*`; [HIST] `browser-bundle.json` | PARTIAL |
| T31 | Cabecera: título, descripción, theme-color, icono y etiquetas para compartir (system.md) | T | Título, descripción, theme-color e icono presentes; sin `og:*` | `index.html` | PARTIAL |
| T32 | Copy: titulares con sustantivo, botones con verbo y objeto; lint de copy (SKILL §5) | V/P | Botones mayormente con verbo («Enviar solicitud»); `copy-lint` no ejecutado en esta auditoría | — | NO VERIFICADO |
| T33 | Fotografías, escenas, efectos y reglas de dirección (reglas 1, 2, 6–9) | V | Sin imágenes salvo el logo oficial (sí se muestra) | — | NOT APPLICABLE |

Totales Taste: **PASS 7 · PARTIAL 18 · FAIL 6** (2 con excepción autorizada) · **NO VERIFICADO 1 · N/A 1**.

## 5. Matriz Emil Design Engineering (`emil-design-eng`)

| # | Criterio original (sección del SKILL) | Tipo | Aplicación | Evidencia | Resultado |
|---|---|---|---|---|---|
| E1 | ¿Debe animarse? Nunca animar acciones iniciadas con teclado (Decision Framework 1) | T | `html[data-input=keyboard]` anula transiciones y animaciones | `InteractionMode.tsx`; [PROD] Tab walk `transition 0s` | PASS |
| E2 | Cada animación con propósito: feedback, estado, evitar saltos | P/T | Presión = feedback; modal = evitar el salto; tarjeta = feedback de hover | `index.css` | PASS |
| E3 | Curvas personalizadas; las de CSS integradas son débiles (Framework 3) | T | `--ease-out: cubic-bezier(.23,1,.32,1)`, idéntica a la del SKILL. ~100 elementos con `transition` de Tailwind usan su curva estándar `(.4,0,.2,1)` | `index.css`; búsqueda | PARTIAL |
| E4 | Nunca `ease-in` en la interfaz | T | No hay | búsqueda | PASS |
| E5 | Interfaz por debajo de 300 ms; modales entre 200 y 500 ms (Framework 4) | T | 100/120/150 ms; modal 200 ms | `index.css`; [SIM] `modalMotion` | PASS |
| E6 | `:active` con `scale` entre 0,95 y 0,98 (Buttons must feel responsive) | T | `scale(.985)`, más sutil que el rango (Taste prescribe .985: conflicto entre skills) | `index.css:183` | PARTIAL |
| E7 | Nunca animar desde `scale(0)` | T | Modal desde `.98` + opacidad | `index.css:186` | PASS |
| E8 | Popovers que escalan desde su origen; modales centrados | T | Modal centrado; menú de asignación con `transform-origin: bottom right` | `index.css` | PASS |
| E9 | Transiciones mejor que keyframes en interfaz interrumpible | T | Transiciones; keyframes solo en spinner y skeleton | búsqueda | PASS |
| E10 | `@starting-style` para entradas | T | Modal | `index.css:186` | PASS |
| E11 | Animar solo transform y opacity | T | Regla global; Tailwind añade color en hover | `index.css` | PASS |
| E12 | Hover dentro de `(hover:hover) and (pointer:fine)` | T | `@media` + `hoverOnlyWhenSupported` | `index.css`, `tailwind.config.ts` | PASS |
| E13 | Movimiento reducido = menos y más suave, **no cero**; conservar opacidad y color | T | Todo a `none` | `index.css`; [PROD]/[SIM] | PARTIAL |
| E14 | Salida más rápida que la entrada; tiempos asimétricos | T | Hover 150/120 ms correcto; el modal no tiene salida (se desmonta) | `index.css` | PARTIAL |
| E15 | Stagger de 30–80 ms, nunca en interfaz frecuente (choreograph regla 2) | T | No hay stagger | código | PASS |
| E16 | Una entrada por contenedor (choreograph regla 1) | T | Solo el panel del modal | código | PASS |
| E17 | Hover y color con `ease`; cambio de estado sin saltos | T | El fondo de hover del botón primario no transiciona (`transition-property: opacity, transform`) | `index.css:178–182` | PARTIAL |
| E18 | Rendimiento percibido: spinners rápidos, skeletons | V | Skeletons en Kanban, Tabla, Gantt y Roadmap; spinners de 1 s | código | PASS |
| E19 | Bucles de atención: esperar unos 2,5 s y repetirse rara vez (unos 6 s) (choreograph) | T | Punto pulsante infinito (Tailwind 2 s) | `ChecklistSection.tsx:117` | FAIL (menor) |
| E20 | Revisión en tabla Before/After/Why obligatoria | P | Usada en [el informe de Codex 2](../../../REPORT-frontend-codex2.md) y en este informe (sección 14) | — | PASS |
| E21 | Cohesión: «un dashboard profesional debe ser nítido y rápido» | V | Coherente | [SIM] | PASS |
| E22 | Arrastre: pointer capture, momento, amortiguación, multitáctil | T | Kanban con `@hello-pangea/dnd`; el comportamiento físico no se evaluó | [HIST] prueba UX de arrastre | NO VERIFICADO |
| E23 | Probar en dispositivos reales | P | Solo Chromium emulado | — | NO VERIFICADO |

Totales Emil: **PASS 15 · PARTIAL 5 · FAIL 1 · NO VERIFICADO 2**.

## 6. Identidad visual: paleta oficial frente a la aplicada

Paleta oficial medida (no inventada). La obtuve de tres fuentes: CSS publicado, render ponderado por área ([data/rendered-colours.json](data/rendered-colours.json)) y píxeles del logo.

| Rol oficial | Color | Fuente |
|---|---|---|
| Azul de marca (superficies) | `#1E3A8A` | CSS + render: la mayor área a 1440 |
| Azul del logo | `#01257B` (67 % de los píxeles) | `/logo.png` |
| Dorado | `#EEBB31` (superficies), `#F2CE52`, `#FFCC2A` (logo), `#FFC930` (JS) | CSS, logo, JS |
| Texto | `#020617`, `#4B5563`, `#374151`, `#1F2937` | render |
| Fondos | `#FFFFFF`, `#F1F5F9`, `#F8FAFC` | CSS |

Ticketera usa el **logo oficial** (SHA idéntico al publicado). Su paleta, en cambio, es otra:

| Ticketera | Más cercano oficial | ΔE2000 | Croma (Ticketera / oficial) |
|---|---|---|---|
| `#173D66` (acción, títulos) | `#1E3A8A` / `#01257B` | 6,3 / 9,5 | 28 / 52–58 |
| `#D5AE54` (dorado) | `#EEBB31` / `#FFCC2A` | 6,8 / 10,8 | 51 / 71–79 |
| `#334155` (tinta) | `#4B5563` / `#020617` | 7,4 / 17,2 | — |

Una ΔE mayor que 5 es una diferencia claramente perceptible. La aplicación usa versiones más apagadas de la marca.

Sobre la procedencia de esa paleta:
- El informe del 20/11 dice que se usó «por instrucción expresa del usuario».
- **DECISION_LOG no registra esa decisión.**
- `docs/frontend-identidad-procont.md` sigue documentando `#1E3A8A`/`#01257B`/`#EEBB31` como marca, lo que contradice el código.

Contraste medio y blanco: se cumple. El fondo `#E8EEF5`, las superficies `#F8FAFC` (1,12:1 entre sí) y la tinta `#334155` (9,9:1) evitan el blanco puro; el único `#FFFFFF` es el interior de los campos del formulario.

**Resultado de identidad: PARTIAL.** Logo, contraste medio y superficies son correctos. La paleta se aparta de la oficial sin registro de aprobación. El panel añade violeta y colores saturados ajenos a la marca.

## 7. Auditoría de las cuatro áreas

### Área 1 — Portal público [PROD]

- Solo dos accesos (Nueva Solicitud, Rastrear Solicitud); Mis tickets no aparece: **PASS**.
  Se ve en [desktop](screenshots/prod/desktop-01-portal.png), [360](screenshots/prod/m360-01-portal.png) y las demás resoluciones.
- Jerarquía clara: una línea superior, un h1, un subtítulo y dos tarjetas equivalentes. La primera lleva filete dorado y un icono con fondo dorado.
  Iconos Lucide coherentes y contraste mínimo de 5,13:1: **PASS**.
- A 1920 el contenido (1280 px) deja un tercio inferior vacío. Es aceptable en un portal de dos acciones; la regla 3 de Taste lo marca como formal.
- Tab: skip link → «Ingreso del personal» → tarjetas, con anillo visible: **PASS**.
- Hover antes del primer clic: la elevación salta sin transición (**BAJA**, H-13).

### Área 2 — Ingreso Quipu / QuipuFac [PROD]

- Selector de dos superficies equivalentes con icono, nombre, tipo de ingreso y credenciales, más un indicador de selección.
  Los formularios no comparten campos: Quipu pide RUC, usuario y contraseña; QuipuFac pide RUC y contraseña. Etiquetas visibles encima y marcador de posición «11 dígitos»: **PASS**.
  Se ve en [quipu 360](screenshots/prod/m360-03-quipu.png) y [quipufac laptop](screenshots/prod/laptop-04-quipufac.png).
- Mostrar/ocultar contraseña: cambia el tipo y la etiqueta accesible («Mostrar» ↔ «Ocultar contraseña»), con `aria-pressed`. El objetivo mide 44×40 (WARN Taste).
- Foco y teclado: recorrido completo y anillo visible: **PASS**.
- Validación, error y carga: no se ejercitaron en producción (exigiría enviar). Las pruebas [SIM] anteriores (31/31, 36/36) cubren el estado de carga.
- El campo «Número de ticket» de la consulta solo tiene `aria-label` (H-17). El texto de ayuda de la consulta tiene 14 px.

### Área 3 — Espacio del cliente [SIM salvo el seguimiento público, que es PROD]

| Regla aprobada | Resultado | Evidencia |
|---|---|---|
| Quipu: nombre desde la identidad, solo lectura, sin volver a pedirlo | PASS: campo con candado y «Nombre obtenido de tu sesión Quipu» | [laptop-21](screenshots/sim/laptop-21-quipu-subproyectos.png) |
| QuipuFac: nombre obligatorio y editable | PASS | [laptop-24](screenshots/sim/laptop-24-quipufac-nuevo-ticket.png) |
| Prioridad Bajo/Medio/Alto/Urgente, «Medio» por defecto | PASS | laptop-21 |
| Separada de la urgencia | PASS: aclaración «El equipo… asignará la prioridad definitiva» y casilla aparte | laptop-21 |
| Subproyectos dependientes del producto, carga y vacío | PASS: ayuda «Elige un producto…» y «Selecciona un subproyecto…»; las pruebas [HIST] 36/36 cubren limpieza, error y respuesta tardía | laptop-21 |
| Mis tickets QuipuFac con el solicitante por ticket | PASS: «Solicitante: Persona Declarada…» | [m360-26](screenshots/sim/m360-26-quipufac-mis-tickets-empresa.png) |
| Detalle, seguimiento público y paginación | PASS funcional. «Siguiente» activo con 2 de 50 resultados (H-22) | [laptop-23](screenshots/sim/laptop-23-detalle-propio.png), [PROD laptop-05](screenshots/prod/laptop-05-seguimiento-publico.png) |

- **Formulario:** «Enviar» está deshabilitado hasta elegir producto. Al enviar vacío actúan las burbujas nativas y luego un único mensaje general, sin `aria-invalid` ni error bajo cada campo (H-11).
  «Cancelar» aparece **encima** de «Enviar» y ambos ocupan todo el ancho también en escritorio (H-23). El asterisco de obligatorio tiene 3,6:1 (H-19).
- **Adjuntos:** zona discontinua, botón «Seleccionar archivos», límites explicados (13 px). La subida real no se verificó.

### Área 4 — Panel interno Enterprise [SIM]

- Dirección Enterprise reconocible: cabecera azul con filete dorado, navegación por secciones, tarjetas de métricas y tablas.
  No es decorativo: hay densidad útil y lectura rápida. **PASS** en estructura.
- **Prioridades:** bandeja y modal rotulan «Prioridad solicitada por el cliente» (solo lectura) y «Prioridad definitiva asignada por el personal» (selector) en bloques distintos: **PASS**.
  Se ve en [laptop-32](screenshots/sim/laptop-32-modal-validacion.png).
  Las tarjetas de Kanban muestran la prioridad administrativa en inglés (`MEDIUM`/`HIGH`/`LOW`), mientras el cliente usa Bajo/Medio/Alto. Es incoherente y facilita confundirlas (H-09).
- **Fallos visuales:**
  - violeta (H-02);
  - emojis como iconos junto a Lucide (H-06), por ejemplo «🟢 Activos», «✅ Completados», «🏢 🧩 📍», «🔴», «💻»;
  - dos botones rellenos (H-07);
  - etiquetas truncadas en «Por Tipo» («Developmer», «Administrat», H-08);
  - versales (T24);
  - selector de prioridad desalineado en el modal (H-24);
  - código de estudio en monoespaciada.
- **Contraste [SIM]:**
  - «Aceptar y crear trabajo», blanco sobre `#16A34A`: **3,15:1** (H-03);
  - «Completados CSV»: 3,6:1;
  - insignia «4» de Requests: 3,6:1;
  - contadores de fase: 3,1–3,3:1;
  - avatares «DS» de 9 px sobre `#A855F7`: 3,78:1;
  - «Sin proyectos»: 2,15:1;
  - atenuado `#5B6F86`: 4,43:1.
- **Semántica:** ninguna pantalla del panel tiene `h1` (H-10). Filtros solo con `aria-label` (H-17). Cierre del modal de 20×36 (H-14).
- **Modales:** el de ticket retiene el foco y se cierra con Escape ([HIST] 36/36; [PROD] modal del personal: 10/10 Tab dentro y Escape).

## 8. Animaciones y microinteracciones

Inventario completo, con la decisión de Emil sobre frecuencia y propósito:

| Elemento | Movimiento real | Frecuencia / propósito | Emil | Taste |
|---|---|---|---|---|
| Botones y enlaces | opacity/transform 120 ms, ease-out propio | frecuente / feedback | PASS | PARTIAL (sin paso de 1 px en hover) |
| Presión | scale .985, 100 ms, solo con puntero | frecuente / feedback | PARTIAL (rango 0,95–0,98) | PASS (.985) |
| Tarjeta del portal | −2 px, 150/120 ms, solo puntero fino | ocasional / feedback | PASS | PASS |
| Fondo de hover del botón | cambio instantáneo | frecuente / estado | PARTIAL | PARTIAL |
| Modal | opacity + scale .98, 200 ms, `@starting-style`, centrado; salida instantánea | ocasional / evitar salto | PASS (salida PARTIAL) | PARTIAL (cierre de 120 ms no implementado) |
| Teclado | todas las transiciones a 0 s | 100+ veces al día | PASS | PASS (anillo sin animación) |
| Antes del primer clic | modo «keyboard»: hover sin transición | — | PARTIAL | PARTIAL |
| Spinner | 1 s lineal (Tailwind) | carga | PASS | N/A (app) |
| Skeletons | `animate-pulse` en vistas del tablero | carga | PASS | — |
| Punto de fase actual | `animate-pulse` infinito | decorativo | FAIL | FAIL |
| Arrastre en Kanban | animación por defecto de `@hello-pangea/dnd` | frecuente | NO VERIFICADO | — |
| Entrada del hero y momento asignado | no existen | — | coherente con Emil (frecuencia) | FAIL (excepción) |
| Scroll, stagger y parallax | no existen | — | PASS | PASS |
| Movimiento reducido | se anula todo | — | PARTIAL | PARTIAL |

Conclusión: las animaciones existentes tienen propósito y no son decorativas, salvo el punto pulsante.
No se recomienda añadir ninguna. Taste exige entrada del hero y un momento asignado, pero Emil (frecuencia de uso) prevalece en una herramienta operativa.
Esa tensión entre skills es la razón documentada de la excepción, no un cumplimiento de Taste.

## 9. Responsive

| Resolución | Público [PROD] | Privado [SIM] |
|---|---|---|
| 1920×1080 | PASS; aire inferior amplio | PASS; Kanban con desplazamiento interno |
| 1440×900 | PASS | PASS; el modal de validación necesita desplazamiento interno |
| 768×1024 | PASS | PASS; tarjetas en Mis tickets |
| 390×844 | PASS | PASS; navegación en dos columnas, indicación de desplazamiento en Kanban |
| 360×800 | PASS | PASS; marca truncada en la cabecera interna (H-21) |
| 320 (solo desbordamiento) | 0 px en `/portal`, `/cliente` y `/tracking` | no medido |

En todas las capturas el desbordamiento horizontal del documento es 0. Las tablas, el Gantt y el Kanban se desplazan dentro de su región.

## 10. Accesibilidad (WCAG 2.2 AA como referencia complementaria, no derivada de las skills)

| Criterio | Resultado | Evidencia |
|---|---|---|
| 1.4.3 Contraste de texto | Público y cliente: PASS salvo el asterisco (3,6:1). **Panel: FAIL** (botón principal 3,15:1 y otros) | [SIM] `lowContrast` |
| 1.4.11 Contraste no textual | **FAIL:** borde de campo `#CBD7E5` 1,39:1 sobre superficie y 1,46:1 sobre `#FFF`; foco 9,5–10,6:1 PASS | cálculo |
| 2.4.7 Foco visible / 2.4.11 Foco no tapado | PASS | [PROD] Tab walk |
| 2.4.1 Saltar bloques | PASS (skip link) | [PROD] |
| 1.3.1 / 2.4.6 Encabezados | Público y cliente: PASS. Panel sin `h1` | [SIM] |
| 3.3.2 Etiquetas | PARTIAL: búsqueda REQ y filtros solo con `aria-label` | [PROD]/[SIM] |
| 3.3.1 Identificación de errores | PARTIAL: mensaje general, sin asociación por campo | [SIM] `25-*` |
| 2.5.8 Tamaño del objetivo (24 px) | PARTIAL: «← Inicio» 49×20 y cierre 20×36 (posible excepción por espaciado, no medida) | [PROD]/[SIM] |
| 2.3.3 / `prefers-reduced-motion` | PASS (todo en reposo) | [PROD] |
| 4.1.2 Nombre, función y valor | PASS: 0 controles sin nombre; contraseña con `aria-pressed` | métricas |
| Lectores de pantalla | **NO VERIFICADO** (sin tecnología de apoyo real) | — |

Esto es una revisión instrumentada, no una certificación de accesibilidad.

## 11. Rendimiento percibido

- **Portal [PROD], carga en frío sin caché:** 6 peticiones, 201,5 KiB transferidos, 442,4 KiB de JS, 56,9 KiB de CSS; 2 fuentes woff2 (50 KiB); FCP y LCP ≈ 0,57 s; **CLS 0**. Presupuesto Taste: PASS.
- **Vistas internas** ([HIST] mismo código `src`): dashboard 463, bandeja 500, Kanban 667 e importador 836 KiB, todas **WARN** (> 450 KiB, < 900). La carga diferida está implementada (chunks separados).
- **Carga:** skeletons en las vistas del tablero; spinners en dashboard, bandeja y sesión.
- **Imágenes:** solo el logo (2,7 KiB).

## 12. Hallazgos priorizados

| ID | Área | Severidad | Criterio incumplido | Evidencia | Archivo / componente | Recomendación | Skill |
|---|---|---|---|---|---|---|---|
| H-01 | Proceso | ALTA | Gate Taste no en PASS; no se volvió a ejecutar tras cambios ni sobre 3 de 4 áreas | log `OPEN 19`, versión 202611201220 | `.taste-skill` (fuera del repositorio) | Ejecutar el gate sobre el build actual y por área, o registrar `--done` con las palabras del usuario | Taste |
| H-02 | Panel | ALTA | Nunca violeta | [SIM] kanban, dashboard | `KanbanBoard.tsx:51`, `constants.ts:4`, `ProjectCard.tsx:109`, `ProjectListView.tsx:83`, `ProjectModal.tsx:149,159`, `DashboardView.tsx:188,195,309`, `request-status.ts:8`, `tailwind.config.ts` (`info`) | Sustituir por tonos de la escala de marca o neutros | Taste |
| H-03 | Panel | ALTA | WCAG 1.4.3 en la acción principal | «Aceptar y crear trabajo» 3,15:1 | `RequestValidationModal.tsx` | Verde más oscuro (por ejemplo, la escala ya usada `#15803D`) | — (WCAG) |
| H-04 | Identidad | ALTA | Paleta distinta de la oficial (ΔE 6–11) sin decisión registrada; documentación contradictoria | sección 6 | `brand.ts`, `index.css`, `docs/frontend-identidad-procont.md` | Que el usuario confirme o revoque `#173D66`/`#D5AE54` y registrarlo en DECISION_LOG | Taste (colores del cliente) |
| H-05 | Todas | MEDIA | WCAG 1.4.11: borde de campo 1,39:1 | cálculo | `index.css` (`--line` en campos) | Borde de campo ≥ 3:1 solo para controles | — |
| H-06 | Panel | MEDIA | Un sistema de iconos | emojis en filtros, badges, bandeja y modal (264 apariciones en 35 archivos) | `KanbanBoard.tsx`, `RequestInbox.tsx`, `RequestValidationModal.tsx`, `request-status.ts`, `DashboardView.tsx` | Completar la conversión a `Icon` | Taste |
| H-07 | Panel | MEDIA | Un solo botón relleno por vista | dashboard azul + verde | `DashboardView.tsx` | «Completados CSV» como secundario | Taste |
| H-08 | Panel | MEDIA | Texto cortado | «Developmer», «Administrat» | `DashboardView.tsx` (Por Tipo) | Ancho de etiqueta o salto de línea | Taste (nada cortado) |
| H-09 | Panel | MEDIA | Coherencia de idioma y prioridad | `MEDIUM/HIGH/LOW` en Kanban | `ProjectCard.tsx` | Mostrar «Prioridad definitiva: Media/Alta/Baja» | — (decisión aprobada) |
| H-10 | Panel | MEDIA | Encabezados: sin `h1` | [SIM] `h1Count 0` | `App.tsx` / vistas internas | Título de vista como `h1` | Taste (`heading-order`) |
| H-11 | Cliente | MEDIA | Errores bajo cada campo; botón activo | [SIM] `25-*` | `PublicRequestForm.tsx` | `aria-invalid` y mensaje por campo; no deshabilitar «Enviar» | Taste (Forms) |
| H-12 | Panel | MEDIA | Contraste de insignias, avatares y vacíos | [SIM] `lowContrast` | `KanbanBoard.tsx`, `ProjectCard.tsx`, `RoadmapView.tsx` | Ajustar tonos; nada por debajo de 13 px | Taste / WCAG |
| H-13 | Todas | BAJA | Hover de 150/120 ms antes del primer clic | [PROD] `hover` | `InteractionMode.tsx` | Arrancar sin modo o pasar a «pointer» con `pointermove` | Taste / Emil |
| H-14 | Público / panel | MEDIA | Tamaño de objetivo | «← Inicio» 49×20; cierre 20×36 | `RequestTracking.tsx:48`, botón de cierre de los modales | ≥ 24 px (Taste: 44) | Taste / WCAG |
| H-15 | Todas | BAJA | Movimiento reducido conservando color y opacidad | `index.css` | `index.css` | Limitar a transform; mantener color y opacidad | Emil / Taste |
| H-16 | Todas | BAJA | Presión 0,95–0,98 y paso de hover | `index.css:183` | `index.css` | Decidir la cifra (las skills difieren: .97 Emil, .985 Taste) | Emil / Taste |
| H-17 | Público / panel | BAJA | Etiqueta visible | búsqueda REQ y filtros | `ClientHome`, barras de filtros | `<label>` visible o claramente asociado | Taste (`field-label`) |
| H-18 | Todas | BAJA | Texto de lectura de 16 px | ayudas de 13–14 px | varios | Subir ayudas e instrucciones a 16 px | Taste |
| H-19 | Cliente | BAJA | Contraste del asterisco | 3,6:1 | `PublicRequestForm.tsx:174` | `text-red-700` | WCAG |
| H-20 | Panel | MEDIA | JS por vista > 450 KiB | 463–836 KiB | chunks internos | Revisar dependencias pesadas (Planner, dnd) | Taste (perf) |
| H-21 | Panel | BAJA | Marca truncada a 360/390 | [SIM] m360 | cabecera Enterprise | Logotipo con nombre corto | — |
| H-22 | Cliente | BAJA | «Siguiente» activo en la última página | [SIM] m360-26 | `MyTickets.tsx` | Deshabilitar si se reciben menos de `limit` resultados | — |
| H-23 | Cliente | BAJA | Orden y ancho de las acciones | Cancelar encima de Enviar | `PublicRequestForm.tsx` | Primaria primero; ancho natural en escritorio | Taste (botones) |
| H-24 | Panel | BAJA | Alineación de fila | selector desplazado en el modal | `RequestValidationModal.tsx` | Etiquetas de altura uniforme | Taste (row-lines) |
| H-25 | Todas | BAJA | Punto pulsante infinito | checklist | `ChecklistSection.tsx:117` | Punto estático | Taste / Emil |

No se encontró ningún hallazgo **CRÍTICO** (que bloquee el uso o exponga datos).

## 13. Evidencias visuales

- Producción: [manifest-prod.json](manifest-prod.json), 30 capturas en `screenshots/prod/`. Incluye ruta, versión 202611231118, resolución, área, pantalla, fecha y SHA-256.
- Simuladas: [manifest-sim.json](manifest-sim.json), 75 capturas en `screenshots/sim/`, marcadas `simulated: true`.
- Métricas brutas en `data/metrics-prod.json` y `data/metrics-sim.json`. Arnés reproducible en `harness/`: solo lectura, y el simulado no toca producción.

## 14. Recomendaciones (formato obligatorio de Emil)

| Before | After | Why |
| --- | --- | --- |
| `transform: scale(.985)` en `:active` | Elegir entre `.97` (Emil) y `.985` + `translateY(1px)` (Taste) y documentarlo | Las dos skills fijan cifras distintas; hoy no se cumple ninguna por completo |
| `.ui-button-primary:hover { background }` sin transición | `transition: background-color 150ms ease` | Un cambio de color en hover usa `ease` y no debe saltar |
| Arranque en `data-input=keyboard` | Sin modo hasta el primer evento, o `pointer` en `pointermove` | El hover del ratón queda sin transición hasta el primer clic |
| `prefers-reduced-motion: * { transition: none }` | Quitar solo transform y conservar opacidad y color | «Reduced motion means fewer and gentler animations, not zero» |
| Modal sin salida | Salida de unos 150 ms en opacidad (más rápida que los 200 ms de entrada) | Salida más rápida que la entrada; evita la desaparición brusca |
| `animate-pulse` infinito en la fase actual | Punto estático | Un bucle de atención debe repetirse rara vez; aquí no aporta información |
| Tailwind `transition` (curva estándar) en unos 100 elementos | `--ease-out` propio | «Built-in CSS easings are too weak» |

Fuera del movimiento, el orden propuesto es: H-02/H-03/H-12 (violeta y contraste del panel), H-04 (confirmar la paleta), H-05, H-06/H-07/H-08/H-09/H-10, y después el resto.

## 15. Elementos que cumplen

- Correspondencia exacta entre código y producción (15/15).
- Portal de dos accesos; ingreso diferenciado por proveedor; nombre Quipu de solo lectura; nombre QuipuFac editable.
- Prioridad solicitada con «Medio» por defecto y separada de la urgencia y de la prioridad definitiva.
- Subproyectos dependientes; Mis tickets empresarial con el solicitante; paginación funcional.
- Contraste medio sin blanco puro en el área pública; logo oficial; anillo de foco; skip link; modales con foco retenido y Escape.
- Sin desbordamiento de 320 a 1920; presupuesto de carga del portal; CLS 0.
- Emil: easing propio, duraciones, sin movimiento por teclado, sin stagger y sin escalar desde 0; modal centrado con `@starting-style`.

## 16. Elementos que no cumplen

H-01 a H-12, H-14 y H-20 (sección 12), y en especial:
- violeta prohibido;
- contraste AA del panel;
- gate Taste no superado;
- paleta sin decisión registrada;
- contraste no textual de los campos.

## 17. Elementos no verificados

- Lectores de pantalla.
- Dispositivos físicos.
- Comportamiento físico del arrastre en Kanban.
- `copy-lint` de Taste.
- Estados de error y carga del ingreso real (exigirían enviar).
- Subida real de adjuntos.
- Excepción de espaciado de WCAG 2.5.8.
- Vistas privadas en producción: no hay sesión y no se inventó ninguna.

## 18. Dictamen final

1. **¿Se usaron realmente las dos skills?**
   Sí, ambas se leyeron (copias idénticas al original) y se aplicaron en el diseño, pero de forma desigual.
   Taste se aplicó parcialmente: tipo, tipografía, radio, bordes, foco, presupuesto y gate ejecutado. No se adoptó su kit ni su capa de movimiento, su gate terminó OPEN y solo sobre el portal antiguo.
   Emil se aplicó de forma consistente.
2. **Taste:** cumple en T1, T9, T13, T14, T16, T21 y T29 (7 PASS, 18 PARTIAL). Falla en T4, T6, T7, T11, T17 y T18. El detalle está en la sección 4.
3. **Emil:** cumple 15 criterios. Parciales: presión, curva de Tailwind, movimiento reducido, salida del modal y hover de color. Falla en el bucle del punto pulsante.
4. **¿El portal es SaaS corporativo moderno?** Sí.
5. **¿El panel es Enterprise?** En estructura y densidad sí. En sistema visual no: violeta, emojis, dos botones rellenos e incoherencias de idioma.
6. **¿Contraste medio y paleta Procont?** Contraste medio: sí. Paleta Procont: no exactamente (ΔE 6–11 frente a la oficial, sin registro de aprobación), y el panel añade violeta.
7. **¿Coherencia entre áreas?** Las áreas 1–3 son coherentes entre sí; el panel rompe el sistema de iconos y de color.
8. **¿Animaciones justificadas?** Sí, salvo el punto pulsante; ninguna es decorativa. La falta de entrada del hero y de momento asignado incumple Taste, aunque está justificada por Emil.
9. **¿Móvil correcto?** Sí: sin desbordamiento, navegación adaptada, tablas y tablero con desplazamiento interno; detalles menores en H-14 y H-21.
10. **¿Qué corregir primero?** H-02, H-03 y H-12 (violeta y contraste del panel); H-04 (confirmar la paleta); H-05 (bordes de campo); H-01 (gate).
11. **¿Merece aprobación?** Las áreas públicas y de cliente merecerían APROBADO CON OBSERVACIONES. El conjunto no.

### **Dictamen: NO APROBADO**

Motivos:
- incumplimientos explícitos de Taste en el panel (violeta prohibido, un solo sistema) y en su proceso (gate sin PASS y no ejecutado sobre la versión ni las áreas actuales);
- fallos de contraste AA en la acción principal de validación;
- paleta no trazable a la identidad oficial.

No hay defectos críticos de uso. Al corregir H-01 a H-05 y H-12, el dictamen podría pasar a APROBADO CON OBSERVACIONES.
