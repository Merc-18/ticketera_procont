# Informe de accesibilidad — WCAG 2.2 AA en ambos temas

Método:

- **Re-auditoría automática** de 115 pantallas **por tema** (4 áreas × 5 anchos, más 320 px), sobre el build local con datos ficticios: [`data/reaudit-light-results.json`](data/reaudit-light-results.json) y [`data/reaudit-dark-results.json`](data/reaudit-dark-results.json). Mide el contraste real de cada texto renderizado contra su fondo efectivo.
- **Medición de tokens** leída del CSS compilado: [THEME_TOKENS.md](THEME_TOKENS.md), 56 pares.
- **Suite de pruebas del tema** ([`tests/ui/theme.ui.test.mjs`](../../../tests/ui/theme.ui.test.mjs), 8 pruebas).

## Resultado por tema

| Métrica (115 pantallas) | Claro aprobado (cierre) | **Claro (esta rama)** | **Oscuro** |
|---|---|---|---|
| Textos bajo 4,5:1 | 0 | **0** | **0** |
| Texto de lectura < 16 px · texto < 13 px | 0 · 0 | 0 · 0 | 0 · 0 |
| Campos sin etiqueta visible · controles sin nombre | 0 · 0 | 0 · 0 | 0 · 0 |
| Saltos de encabezado · pantallas con h1 | 0 · 115/115 | 0 · 115/115 | 0 · 115/115 |
| Emoji renderizado | 0 | 0 | 0 |
| Desbordamiento (incluidas 6 rutas a 320 px) | 0 | 0 | 0 |
| Paradas de Tab con anillo visible y sin transición | 54/54 | 58/58 (más el selector) | 58/58 |
| Colores con matiz violeta (255–320°) | 0 | 0 de 35 | 0 de 53 |

Objetivos < 24 px: solo los falsos positivos de siempre en ambos temas. Son el enlace de salto visualmente oculto (1×1, que mide 44 px al recibir el foco) y el input de archivo oculto (se activa con su `<label>` de 44 px).

## Elementos medidos (oscuro; detalle en THEME_TOKENS.md)

| Elemento | Oscuro | Mínimo |
|---|---|---|
| Texto primario / página · superficie | 15,96:1 · 13,93:1 | 4,5:1 |
| Texto secundario / superficie | 11,83:1 | 4,5:1 |
| Texto atenuado / superficie · página | 7,84:1 · 8,99:1 | 4,5:1 |
| Placeholder (meta) / campo | 5,75:1 | 4,5:1 |
| Botón primario (texto / relleno; hover) | 4,94:1; 6,41:1 | 4,5:1 |
| Relleno primario / página (componente) | 3,78:1 | 3:1 |
| Botón de peligro sólido | 4,62:1 | 4,5:1 |
| Mensaje de error / superficie · tinte de error | 9,04:1 · 9,2:1 | 4,5:1 |
| Insignias (texto / tinte): neutra, marca, roja, verde, amarilla, dorada | 10,54 · 8,6 · 9,2 · 11,64 · 12,59 · 10,18 | 4,5:1 |
| Borde de campo / campo · superficie (1.4.11) | 4,1:1 · 4,47:1 | 3:1 |
| Foco / página · superficie (1.4.11) | 10,91:1 · 9,52:1 | 3:1 |
| Avatares (texto blanco / relleno) | 4,94–8,42:1 | 4,5:1 |
| Barras y puntos funcionales / superficie | 3,32–4,99:1 | 3:1 |
| Texto sobre dorado (`text-on-accent`) | 10,02:1 | 4,5:1 |
| Estados deshabilitados | Opacidad .55 sobre los mismos tokens (WCAG exime los controles deshabilitados); los campos deshabilitados usan `--p-bg` con texto `--p-muted` (8,99:1) | — |
| Tooltips | `title` nativo, dibujado por el sistema | — |

## Selector de tema

| Criterio | Resultado |
|---|---|
| 4.1.2 Nombre, función, valor | `role="group"` «Apariencia»; dos `button` con `aria-label` «Modo claro»/«Modo oscuro» y `aria-pressed` |
| 1.4.1 Uso del color | El estado activo se distingue por tinte, color e `aria-pressed`, no solo por el color |
| 2.1.1 Teclado | Tab llega a cada opción; Enter o Espacio la activa (prueba «teclado») |
| 2.4.7 Foco visible | Anillo de 2 px sólido (prueba «selector accesible») |
| 2.5.8 Tamaño del objetivo | 44 × 44 cada opción |
| 2.5.3 Etiqueta en el nombre | El tooltip y el nombre accesible son el mismo texto |
| 2.3.3 / movimiento reducido | El cambio es solo un fundido de opacidad de 120 ms; con teclado no hay animación |
| Sin destello (FOUC) | En `DOMContentLoaded`, antes de que React pinte, el fondo ya es el del tema elegido en `/portal`, `/cliente`, `/tracking`, `/login` y al recargar |

## Lectores de pantalla

Lo verificado es el árbol de accesibilidad y los roles mediante Playwright: nombres, `aria-pressed` y grupo. No se probó con NVDA ni con VoiceOver.
