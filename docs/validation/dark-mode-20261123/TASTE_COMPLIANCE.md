# Cumplimiento Taste — `design-taste-frontend` 2.5.1 (modo oscuro)

Fuente: `Leonxlnx/taste-skill`, SKILL.md sha256 `0c7a5852…`, con las referencias leídas `system.md`, `cards.md`, `motion.md`, `perf.md` e `icons.md` (procedencia en [`../ux-ui-audit-20261123/data/skills-provenance.json`](../ux-ui-audit-20261123/data/skills-provenance.json)).
**El gate histórico no se reinicia:** sigue en OPEN 14 (rondas agotadas) y el registro OPEN 19 se conserva. Las excepciones T7/T11 de la corrección UX/UI siguen siendo excepciones y no se convierten en PASS.

## Reglas de Taste que decidieron la implementación

| Regla original (referencia) | Cómo decidió la implementación | Evidencia |
|---|---|---|
| «Dark pages … are tech only» (SKILL «Tech below means site-kind software…») | Ticketera declara `data-type="software"`, `page-type` y `site-kind` `software`. Es «tech», así que el grado oscuro está permitido | `index.html` |
| «The grade (light or evening) is chosen once on load or by a click, never by scrolling» (`system.md`) | El tema se aplica en la carga, antes del primer pintado, o con un clic en el selector. Nunca al desplazarse ni por el sistema operativo | `index.html` (script de cabecera), `src/lib/theme.ts`, prueba «persistencia sin destello» |
| «Never violet or lavender» (OKLCH 270–330°) (`system.md`) | La escala oscura usa navy de matiz ≈ 222°, el azul oficial y el dorado oficial. Análisis de matiz de los colores renderizados: 0 entre 255 y 320° en ambos temas | `reaudit-*/results.json` (`colours`) |
| «One accent at most … its label 4.5:1 on it and it 3:1 on the ground; `--action` drives buttons, links and focus» (`system.md`) | El token de acción se separó por rol: texto/foco `#93C5FD` y relleno `#2563EB`. Etiqueta sobre el relleno 4,94:1; relleno frente a la página 3,78:1 y frente a la superficie 3,32:1. En la primera versión el relleno era `#1D4ED8` (2,94:1 frente a la página) y se corrigió por esta regla | [THEME_TOKENS.md](THEME_TOKENS.md) |
| «Fill `--card`, one clear step off the page (dark: `#151517` on `#070708`)» (`cards.md`) | Página `#060B16` → superficie `#111B30` → elevada `#172338`. El escalón superficie/página es 1,15:1, casi igual que en claro (1,18:1) | THEME_TOKENS.md |
| «Border 1px, ink at 8 to 14%; inner top highlight 1px (white 5-7%, dark only). No blurred shadow at rest» (`cards.md`) | `--line #2A3854` (tinta `#E2E8F0` al ≈ 12 % sobre la superficie). Reflejo superior `inset 0 1px 0 rgb(255 255 255 / .05)` solo en oscuro, en tarjetas, columnas, barras de herramientas y paneles. Sin sombra difusa en reposo; el modal usa elevación (`--p-elevated`) más su sombra | `src/index.css` |
| «Real logos keep their own full colours … never redrawn or tinted» (`system.md`, `icons.md`) | El logotipo PNG no se tiñe. En oscuro lleva solo un contorno de 1 px (blanco al 16 %) por fuera, para separarlo del navy | `.brand-logo-img` |
| Un sistema de iconos (`icons.md`) | Sol y Luna se añadieron al mismo set Lucide de `Icon.tsx`, sin emoji | `src/components/ui/Icon.tsx` |
| Hover y presión (`motion.md`): botón −1 px, tarjeta −2 px, presión con tono | Sin cambios en ningún tema. La re-auditoría oscura mide el mismo hover (−2 px, 150 ms) y la misma presión (`scale(.98)` + 1 px) | `reaudit-dark/results.json` → `motion` |
| Movimiento reducido: «everything at rest, nothing hidden, colours keep changing» (`motion.md`) | Sin transformaciones; color y opacidad se conservan. El cambio de tema es solo un fundido de opacidad (120 ms) | `reducedMotion`, prueba de tema |
| `meta theme-color` = la base de la página (`system.md`) | `#E2E8F0` en claro y `#060B16` en oscuro; se actualiza al cambiar de tema | prueba «puntero» |
| Contraste: tinta 7:1, atenuado 4,5:1 (`system.md`) | Oscuro: tinta 13,9–16:1, atenuado 7,8–9:1, meta ≥ 5,75:1 | THEME_TOKENS.md |
| Objetivos de 44 px (SKILL §5) | Cada opción del selector mide 44 × 44 | prueba «selector accesible» |
| Presupuesto (`perf.md`) | Sin dependencias nuevas; JS inicial +1,7 KB; CSS +17 KB (+3 KB gzip) por las variables de los dos temas | PERFORMANCE_REPORT.md |

## Matriz T1–T33 en modo oscuro

En el modo claro el estado es el de la corrección UX/UI publicada ([`../ux-ui-correction-20261123/TASTE_COMPLIANCE.md`](../ux-ui-correction-20261123/TASTE_COMPLIANCE.md): PASS 26 · PARTIAL 4 · FAIL 2 por excepción · N/A 1), y el modo claro no cambió (ver RESPONSIVE/ACCESSIBILITY). Para el oscuro se re-evaluaron los criterios que dependen del color o de la superficie:

| # | Criterio | Oscuro | Evidencia |
|---|---|---|---|
| T5 | Paleta del cliente | PASS: navy, azul y dorado oficiales adaptados por rol | THEME_TOKENS.md |
| T6 | Kit y capa de movimiento | PASS: kit sin editar; sus alias (`--bg`, `--ink`, `--card`, `--action`) siguen al tema | `src/index.css` |
| T12–T15 | Hover, solo transform/opacity, foco y movimiento reducido | PASS: mismos valores medidos | `reaudit-dark` |
| T17 | Sin pulso aislado | PASS | — |
| T18 | Nunca violeta | PASS: 0 colores en 255–320° | `reaudit-dark` |
| T19 | Interfaz 90–95 % neutra | PASS: superficies navy neutras; acento azul en acción y selección; dorado en marcas | capturas |
| T20 | Un sistema | PASS: mismos componentes y clases; el tema solo cambia tokens | — |
| T21 | Escala de radio | PASS | — |
| T22–T23 | ≥ 13 px y lectura a 16 px | PASS: 0 / 0 | `reaudit-dark` |
| T25 | Contraste | PASS: 0 textos bajo 4,5:1 en 115 pantallas | `reaudit-dark` |
| T26 | Acceso | PASS: etiquetas, encabezados y h1 sin cambios; selector con nombre y estado | pruebas |
| T28 | 44 px | PASS | pruebas |
| T29 | Sin desbordamiento a 320/390 | PASS | `overflow320` |
| T30 | Presupuesto JS | Igual que en claro (3 WARN y 0 FAIL, excepción H-20); el tema no añade dependencias | PERFORMANCE_REPORT.md |
| T31 | Cabecera | PASS: `theme-color` por tema | — |
| T7, T11 | Una sección por pantalla; momento | Siguen como **FAIL por excepción autorizada**, sin cambio | — |
| T2, T4, T8, T32 | Gate y copy | Sin cambio respecto a la corrección: el gate no se reinicia | — |

## Gate

No se ejecutaron rondas nuevas del gate: están agotadas y reiniciarlas está prohibido. El cumplimiento oscuro se demuestra con la re-auditoría automática de 115 pantallas, las mediciones de contraste desde el CSS compilado y la suite de pruebas del tema.
