# Informe de accesibilidad — WCAG 2.2 AA

Método: re-auditoría automática de **115 pantallas**. Las 4 áreas (portal, ingreso, espacio del cliente, panel interno) se recorrieron a 1920, 1440, 768, 390 y 360 px, más 320 px para desbordamiento, con recorridos de Tab, sobre el build local con datos ficticios. Las razones de contraste se calcularon con la fórmula de luminancia relativa de WCAG.

## Métricas agregadas (antes → después)

| Métrica | Auditoría [SIM] 75 pantallas | Auditoría [PROD] 30 pantallas | **Final, 115 pantallas** |
|---|---|---|---|
| Textos bajo 4,5:1 (`lowContrastCount`) | 525 | 0 | **0** |
| Texto de lectura < 16 px | 210 | 20 | **0** |
| Texto < 13 px | 80 | 0 | **0** |
| Campos sin etiqueta visible (`unlabeledFields`) | 160 | 15 | **0** |
| Controles sin nombre accesible | 0 | 0 | **0** |
| Saltos de nivel de encabezado | n/d | n/d | **0** |
| Pantallas con `h1` | 35/75 | 30/30 | **115/115** |
| Desbordamiento horizontal (incluido 320 px) | 0 | 0 | **0** |
| Emoji renderizado | n/d (264 en el código) | n/d | **0** |
| Objetivos < 24 px | 105 | 35 | 133, todos falsos positivos (ver abajo) |

**Objetivos < 24 px.** Los 133 casos son dos elementos ocultos a propósito:

- `a "Saltar al contenido"`, 1×1, 113 casos: el enlace de salto visualmente oculto, que ocupa 44 px cuando recibe el foco.
- `input#ticket-attachments`, 1×44, 20 casos: el input de archivo oculto, que se activa con su `<label>` visible de 44 px.

Ningún control visible queda por debajo de 44 px.

## Contraste de pares clave

| Par | Razón | Requisito |
|---|---|---|
| Tinta `#1F2937` / superficie `#F8FAFC` | 14,03:1 | 4,5:1 |
| Texto atenuado `#4B5563` / superficie | 7,22:1 | 4,5:1 |
| Meta `#64748B` / blanco | 4,76:1 | 4,5:1 |
| Borde de campo `#64748B` / superficie (1.4.11) | 4,55:1 | 3:1 (antes 1,39:1) |
| Texto del botón primario `#F8FAFC` / `#1E3A8A` | 9,90:1 | 4,5:1 (antes 3,15:1 en «Aceptar y crear trabajo») |
| Botón de peligro sólido `#F8FAFC` / `#B91C1C` | 6,18:1 | 4,5:1 |
| Etiqueta del Gantt `#0F172A`/`#111827` sobre la barra dorada `#EEBB31` | ≈ 10:1 | 4,5:1 (antes blanco 1,78:1) |
| Glifo de orden de la tabla `#4B5563` / `#EFF6FF` | 6,94:1 | 4,5:1 (antes 4,37:1) |
| Aviso `#713F12` / `#FEF9C3` | 8,07:1 | 4,5:1 |
| Anillo de foco `#1E3A8A` / fondo `#E2E8F0` | 8,40:1 | 3:1 |

## Criterios WCAG

| Criterio | Antes | Después |
|---|---|---|
| 1.3.1 Información y relaciones | PARTIAL (panel sin h1) | **PASS**: h1 por vista, h2 en las secciones, 0 saltos |
| 1.4.3 Contraste de texto | FAIL en el panel | **PASS** |
| 1.4.11 Contraste no textual | FAIL (borde 1,39:1) | **PASS** (4,55:1) |
| 1.4.10 Reflow (320 px) | PASS | PASS |
| 2.1.1 Teclado | PARTIAL (título de la bandeja solo con ratón; eliminar del checklist solo con hover) | **PASS** (H-26, H-28) |
| 2.4.7 Foco visible | PASS | PASS: anillo de 2 px en el 100 % de las paradas `tab-*`, sin transición |
| 2.5.3 Etiqueta en el nombre | FAIL («Cancelar» con otro `aria-label`) | **PASS** (H-27) |
| 2.5.8 Tamaño del objetivo | PARTIAL | **PASS** (≥ 44 px visibles) |
| 3.3.1 Identificación de errores | PARTIAL | **PASS**: `aria-invalid` y mensaje bajo cada campo; foco en el primer error; línea `role=status` |
| 3.3.2 Etiquetas o instrucciones | PARTIAL | **PASS**: `<label>` visibles en filtros, búsqueda y selectores |
| 4.1.2 Nombre, función y valor | PASS | PASS: `aria-pressed` en los controles segmentados y en Aceptar/Rechazar |
| 2.3.3 / movimiento reducido | PARTIAL | **PASS** (sin transformaciones; color y opacidad suaves) |

## Observaciones

- El selector de prioridad del modal de proyecto tiene una etiqueta `sr-only` («Prioridad definitiva»). Su texto visible es «Prioridad: Alto», que contiene la etiqueta, así que cumple 2.5.3.
- No se probó con lectores de pantalla reales (NVDA, VoiceOver); la verificación es automática más inspección del DOM.

## Cierre (re-auditoría `202611231439`, 115 pantallas)

| Métrica | Valor |
|---|---|
| Textos bajo 4,5:1 · lectura < 16 px · texto < 13 px | 0 · 0 · 0 |
| Campos sin etiqueta · controles sin nombre · saltos de encabezado | 0 · 0 · 0 |
| Pantallas con `h1` | 115/115 |
| Emoji renderizado · colores con matiz violeta (255–320°) | 0 · 0 (35 colores distintos analizados) |
| Desbordamiento (incluido 320 px) | 0 |

Los cambios del cierre no alteran el contraste: el copyright conserva su color `--p-muted` (6,13:1 sobre el fondo `#E2E8F0`) y la cabecera conserva su texto. Foco con teclado: 54/54 paradas con anillo visible y sin transición. La carga diferida añade un estado «Cargando vista…» con `role=status`, que se anuncia a los lectores de pantalla. Fuente: [`cierre/data/reaudit-results.json`](cierre/data/reaudit-results.json).
