# Tokens de tema — claro y oscuro

Fuente única: `src/theme/themes.ts` (escalas Tailwind por **rol**) y `src/index.css` (tokens semánticos `--p-*`). Los valores y contrastes de este documento se **leen del CSS compilado** (`CSS compilado index-BPTFn9Z6.css`) con [`data/harness/tokens.mjs`](data/harness/tokens.mjs); el detalle completo está en [`data/contrast-measurements.json`](data/contrast-measurements.json).

## Arquitectura

- **Una aplicación, dos juegos de tokens.** `<html data-theme="light|dark">`. Sin clases `dark:` duplicadas ni hojas separadas.
- **Escalas por rol.** Cada familia usada por la interfaz (gray/slate, brand, accent, red, green, yellow, avatar) genera 237 variables `--bg-*`, `--tx-*` y `--bd-*`. Tailwind las consume mediante `backgroundColor`, `textColor`, `borderColor`, `ringColor`, `divideColor`, `accentColor` y `placeholderColor`. En claro los tres roles valen el mismo hex aprobado, así que el diseño claro no cambia. En oscuro un mismo `brand-700` es texto `#93C5FD`, relleno `#1D4ED8` con texto blanco o borde visible. No es una inversión de colores.
- **Tokens semánticos.** Las clases propias (`.ui-button-*`, `.portal-option`, `.modal-panel`…) usan `--p-*`. La acción se separó en *texto/foco* (`--p-action`, `--p-focus`) y *relleno* (`--p-action-fill*`), y el peligro en *texto* y *relleno*.
- **Fijos a propósito.** `text-white` (#F8FAFC) sobre rellenos, `text-on-accent` (#0F172A) sobre dorado en los dos temas, los fondos `bg-black/50` de los modales y las veladuras `bg-white/10` sobre la banda navy.
- **Nativos.** `color-scheme` por tema (listas desplegables, barras de desplazamiento, casillas) y campos sin fondo propio en `--p-elevated`.

## Tokens semánticos

| Token | Uso | Claro | Oscuro |
|---|---|---|---|
| `--p-bg` | Background (página) | `#e2e8f0` | `#060b16` |
| `--p-surface` | Surface (tarjetas, barras) | `#f8fafc` | `#111b30` |
| `--p-elevated` | Surface elevated (campos, modales) | `#ffffff` | `#172338` |
| `--p-ink` | Primary text | `#1f2937` | `#e2e8f0` |
| `--p-ink-2` | Texto secundario fuerte | `#374151` | `#ced7e5` |
| `--p-muted` | Secondary text | `#4b5563` | `#a3b0c7` |
| `--p-meta` | Muted text / placeholder | `#64748b` | `#8e9db8` |
| `--p-action` | Brand primary como texto, enlace y borde activo | `#1e3a8a` | `#93c5fd` |
| `--p-action-hover` | Acción texto hover | `#01257b` | `#bfdbfe` |
| `--p-action-active` | Acción texto activa | `#001e64` | `#bfdbfe` |
| `--p-action-ink` | Texto sobre relleno de acción | `#f8fafc` | `#f8fafc` |
| `--p-tint` | Surface interactive (selección activa) | `#dbeafe` | `#172b5c` |
| `--p-tint-weak` | Surface interactive suave (hover, cabeceras de tabla) | `#eff6ff` | `#12224a` |
| `--p-accent-tint` | Tinte dorado (icono de acento, aviso) | `#fef9c3` | `#2b230c` |
| `--gold` | Brand secondary / Accent (dorado oficial) | `#eebb31` | `#eebb31` |
| `--line` | Border (separadores, tarjetas) | `#cbd5e1` | `#2a3854` |
| `--field-line` | Border de campo (≥ 3:1) | `#64748b` | `#7083a3` |
| `--success` | Success (texto) | `#15803d` | `#86efac` |
| `--danger` | Danger (texto, borde) | `#b91c1c` | `#fca5a5` |
| `--danger-bg` | Tinte de error | `#fef2f2` | `#2a1316` |
| `--warning-bg` | Warning tinte | `#fef9c3` | `#2b230c` |
| `--warning-ink` | Warning texto | `#713f12` | `#f2ce52` |
| `--p-action-fill` | Brand primary como relleno (botón primario) | `#1e3a8a` | `#2563eb` |
| `--p-action-fill-hover` | Relleno primario hover | `#01257b` | `#1d4ed8` |
| `--p-action-fill-active` | Relleno primario presionado | `#001e64` | `#1e40af` |
| `--p-focus` | Focus (anillo de 2 px) | `#1e3a8a` | `#93c5fd` |
| `--danger-fill` | Danger relleno (botón sólido) | `#b91c1c` | `#dc2626` |
| `--danger-fill-ink` | Texto sobre peligro sólido | `#fff` | `#f8fafc` |
| `--p-band` | Banda corporativa (cabecera del panel, modal) | `#01257b` | `#0d1a3f` |
| `--surface` | Superficie (canales RGB para bg-surface) | `248 250 252` | `17 27 48` |
| `--p-backdrop` |  | `rgb(1 37 123 / .45)` | `rgb(2 6 23 / .72)` |
| `--p-modal-shadow` |  | `0 24px 80px rgb(1 37 123 / .15)` | `0 24px 80px rgb(0 0 0 / .55)` |

Escalones de superficie: página → superficie → elevada. En claro `#E2E8F0 → #F8FAFC → #FFFFFF`; en oscuro `#060B16 → #111B30 → #172338`, con matiz navy ≈ 222° de la identidad, sin negro puro. Texto principal `#E2E8F0`, nunca blanco puro como texto general.

## Contrastes medidos (WCAG 2.2 AA)

| Par | Mínimo | Claro | Oscuro (primer plano / fondo) | Resultado |
|---|---|---|---|---|
| Texto principal / página | 4.5:1 | 11.91:1 | 15.96:1 (`#E2E8F0`/`#060B16`) | PASS |
| Texto principal / superficie | 4.5:1 | 14.03:1 | 13.93:1 (`#E2E8F0`/`#111B30`) | PASS |
| Texto secundario / superficie | 4.5:1 | 9.85:1 | 11.83:1 (`#CED7E5`/`#111B30`) | PASS |
| Texto atenuado / superficie | 4.5:1 | 7.22:1 | 7.84:1 (`#A3B0C7`/`#111B30`) | PASS |
| Texto atenuado / página | 4.5:1 | 6.13:1 | 8.99:1 (`#A3B0C7`/`#060B16`) | PASS |
| Meta / superficie | 4.5:1 | 4.55:1 | 6.27:1 (`#8E9DB8`/`#111B30`) | PASS |
| Meta / elevada | 4.5:1 | 4.76:1 | 5.75:1 (`#8E9DB8`/`#172338`) | PASS |
| Placeholder (meta) / campo | 4.5:1 | 4.76:1 | 5.75:1 (`#8E9DB8`/`#172338`) | PASS |
| Acción como texto / superficie | 4.5:1 | 9.9:1 | 9.52:1 (`#93C5FD`/`#111B30`) | PASS |
| Acción como texto / tinte | 4.5:1 | 8.49:1 | 7.58:1 (`#93C5FD`/`#172B5C`) | PASS |
| Botón primario: texto / relleno | 4.5:1 | 9.9:1 | 4.94:1 (`#F8FAFC`/`#2563EB`) | PASS |
| Botón primario hover: texto / relleno | 4.5:1 | 12.93:1 | 6.41:1 (`#F8FAFC`/`#1D4ED8`) | PASS |
| Peligro sólido: texto / relleno | 4.5:1 | 6.47:1 | 4.62:1 (`#F8FAFC`/`#DC2626`) | PASS |
| Error (texto) / superficie | 4.5:1 | 6.18:1 | 9.04:1 (`#FCA5A5`/`#111B30`) | PASS |
| Error (texto) / tinte de error | 4.5:1 | 5.91:1 | 9.2:1 (`#FCA5A5`/`#2A1316`) | PASS |
| Aviso: texto / tinte | 4.5:1 | 8.07:1 | 10.18:1 (`#F2CE52`/`#2B230C`) | PASS |
| Éxito (texto) / superficie | 4.5:1 | 4.79:1 | 12.23:1 (`#86EFAC`/`#111B30`) | PASS |
| Borde de campo / campo (1.4.11) | 3:1 | 4.76:1 | 4.1:1 (`#7083A3`/`#172338`) | PASS |
| Borde de campo / superficie (1.4.11) | 3:1 | 4.55:1 | 4.47:1 (`#7083A3`/`#111B30`) | PASS |
| Foco / página (1.4.11) | 3:1 | 8.4:1 | 10.91:1 (`#93C5FD`/`#060B16`) | PASS |
| Foco / superficie (1.4.11) | 3:1 | 9.9:1 | 9.52:1 (`#93C5FD`/`#111B30`) | PASS |
| Relleno primario / página (Taste 3:1) | 3:1 | 8.4:1 | 3.81:1 (`#2563EB`/`#060B16`) | PASS |
| Dorado / superficie (informativo: siempre con etiqueta) | — | 1.7:1 | 9.64:1 (`#EEBB31`/`#111B30`) | PASS |
| Superficie / página (escalón) | — | 1.18:1 | 1.15:1 (`#111B30`/`#060B16`) | PASS |
| Texto blanco / banda | 4.5:1 | 12.93:1 | 16.23:1 (`#F8FAFC`/`#0D1A3F`) | PASS |
| Insignia gray: text-gray-700 / bg-gray-100 | 4.5:1 | 13.4:1 | 10.54:1 (`#CED7E5`/`#19253D`) | PASS |
| Insignia brand: text-brand-700 / bg-brand-50 | 4.5:1 | 12.43:1 | 8.6:1 (`#93C5FD`/`#12224A`) | PASS |
| Insignia red: text-red-700 / bg-red-50 | 4.5:1 | 5.91:1 | 9.2:1 (`#FCA5A5`/`#2A1316`) | PASS |
| Insignia green: text-green-700 / bg-green-50 | 4.5:1 | 4.79:1 | 11.64:1 (`#86EFAC`/`#0E2419`) | PASS |
| Insignia yellow: text-yellow-800 / bg-yellow-50 | 4.5:1 | 6.62:1 | 12.59:1 (`#FDE047`/`#241E0A`) | PASS |
| Insignia accent: text-accent-700 / bg-accent-100 | 4.5:1 | 8.07:1 | 10.18:1 (`#F2CE52`/`#2B230C`) | PASS |
| text-gray-500 / superficie | 4.5:1 | 7.22:1 | 7.84:1 (`#A3B0C7`/`#111B30`) | PASS |
| text-gray-600 / superficie | 4.5:1 | 9.85:1 | 9.66:1 (`#B8C3D6`/`#111B30`) | PASS |
| text-gray-400 / superficie | 4.5:1 | 4.55:1 | 6.27:1 (`#8E9DB8`/`#111B30`) | PASS |
| text-brand-700 / superficie | 4.5:1 | 12.93:1 | 9.52:1 (`#93C5FD`/`#111B30`) | PASS |
| text-green-800 / superficie | 4.5:1 | 6.81:1 | 12.23:1 (`#86EFAC`/`#111B30`) | PASS |
| text-red-700 / superficie | 4.5:1 | 6.18:1 | 9.04:1 (`#FCA5A5`/`#111B30`) | PASS |
| text-yellow-800 / superficie | 4.5:1 | 6.55:1 | 13.02:1 (`#FDE047`/`#111B30`) | PASS |
| text-white / bg-brand-600 | 4.5:1 | 9.9:1 | 4.94:1 (`#F8FAFC`/`#2563EB`) | PASS |
| text-white / bg-brand-700 | 4.5:1 | 12.93:1 | 6.41:1 (`#F8FAFC`/`#1D4ED8`) | PASS |
| text-white / bg-red-700 | 4.5:1 | 6.18:1 | 4.62:1 (`#F8FAFC`/`#DC2626`) | PASS |
| text-white / bg-green-700 | 4.5:1 | 4.79:1 | 4.79:1 (`#F8FAFC`/`#15803D`) | PASS |
| text-white / bg-avatar-1 | 4.5:1 | 9.9:1 | 6.41:1 (`#F8FAFC`/`#1D4ED8`) | PASS |
| text-white / bg-avatar-2 | 4.5:1 | 14.65:1 | 8.34:1 (`#F8FAFC`/`#1E40AF`) | PASS |
| text-white / bg-avatar-3 | 4.5:1 | 9.85:1 | 7.1:1 (`#F8FAFC`/`#44557A`) | PASS |
| text-white / bg-avatar-4 | 4.5:1 | 14.03:1 | 8.42:1 (`#F8FAFC`/`#3A4A6E`) | PASS |
| text-white / bg-avatar-5 | 4.5:1 | 8.34:1 | 4.94:1 (`#F8FAFC`/`#2563EB`) | PASS |
| text-white / bg-gray-800 | 4.5:1 | 17.06:1 | 13.3:1 (`#F8FAFC`/`#1F2C47`) | PASS |
| text-white / bg-gray-400 | 4.5:1 | 4.55:1 | 4.55:1 (`#F8FAFC`/`#64748B`) | PASS |
| Barra/punto bg-brand-600 / superficie (1.4.11) | 3:1 | 9.9:1 | 3.32:1 (`#2563EB`/`#111B30`) | PASS |
| Barra/punto bg-red-700 / superficie (1.4.11) | 3:1 | 6.18:1 | 3.55:1 (`#DC2626`/`#111B30`) | PASS |
| Barra/punto bg-gray-400 / superficie (1.4.11) | 3:1 | 4.55:1 | 3.61:1 (`#64748B`/`#111B30`) | PASS |
| Barra/punto bg-gray-500 / superficie (1.4.11) | 3:1 | 7.22:1 | 4.99:1 (`#7C8BA6`/`#111B30`) | PASS |
| Barra/punto bg-green-700 / superficie (1.4.11) | 3:1 | 4.79:1 | 3.42:1 (`#15803D`/`#111B30`) | PASS |
| Barra dorada bg-accent-400 / superficie (informativo: barra con etiqueta y número) | — | 1.7:1 | 9.64:1 (`#EEBB31`/`#111B30`) | PASS |
| text-on-accent / bg-accent-400 | 4.5:1 | 10.02:1 | 10.02:1 (`#0F172A`/`#EEBB31`) | PASS |

**56 pares medidos, 0 fallan.** Los pares marcados «informativo» no tienen mínimo porque el elemento siempre va con etiqueta y número. Dos casos:

- La barra dorada sobre la superficie clara (1,7:1) es del diseño claro aprobado y no se modificó.
- La barra de progreso sobre su pista no requiere 3:1 porque el porcentaje figura como texto.

Además de estos pares, la re-auditoría mide el contraste real de **todo el texto renderizado** en 115 pantallas por tema: 0 textos bajo 4,5:1 en claro y 0 en oscuro.

## Escalas por rol (oscuro)

Los valores de cada variable `--bg-*`, `--tx-*` y `--bd-*` (237) están en `data/contrast-measurements.json` → `roleVars`. Resumen de decisiones:

| Familia | Fondo (bg) | Texto (tx) | Borde (bd) |
|---|---|---|---|
| gray | 50–300 escalones navy `#141F35…#2A3854`; 400–500 barras `#64748B`/`#7C8BA6`; 600–800 rellenos con texto blanco | 400 `#8E9DB8` (meta) → 900 `#E8EDF5` | 200 `#2A3854` (línea), 300 `#33446A`, 400 `#6B7C9C` |
| brand | 50/100 tintes `#12224A`/`#172B5C`; 600 `#2563EB` y 700 `#1D4ED8` rellenos | `#93C5FD` (texto de marca) | 200 `#2B4A8A`, 400 `#3B82F6`, 600 `#60A5FA` |
| accent (dorado) | 300–500 dorados oficiales sin cambio; 50/100 tintes `#211B0B`/`#2B230C` | `#F2CE52` (solo aviso medido ≥ 10:1) | 400 `#EEBB31` |
| red / green / yellow | tintes oscuros 50–200; rellenos `#DC2626` / `#15803D` | `#FCA5A5` / `#86EFAC` / `#FDE047` | tonos medios visibles |
| avatar 1–5 | `#1D4ED8 #1E40AF #44557A #3A4A6E #2563EB` (claro: los tonos anteriores, sin cambio) | — | — |

**Sin violeta:** ningún color de los temas cae en el matiz 255–320°. Lo confirman los 35 colores renderizados en claro y los 53 en oscuro.
