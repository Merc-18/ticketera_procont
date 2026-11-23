# Frontend

> **Revisión documental 20/11/2026 · base `c857a727c8e7640bbce8daada940f973acbf013e` · clasificación: ACTUAL.**
> Fuente oficial: [PRODUCT_REQUIREMENTS](specs/PRODUCT_REQUIREMENTS.md); estado operativo: [PROJECT_STATUS](PROJECT_STATUS.md).
> La marca/tema se conserva en src/theme/brand.ts. Pie global muestra versión fijada al build en Lima. No asumir que los pendientes organizacionales históricos siguen bloqueando el piloto.

## Alcance del documento anterior

El contenido siguiente conserva sus fechas y evidencias originales. Los estados de activación o contratos sustituidos no se consideran vigentes; prevalecen las especificaciones enlazadas arriba.

Título original conservado como contexto: **Frontend — identidad corporativa Procont Business**.

18/11/2026. Base `5c19523`. Solo frontend: sin cambios de backend, migraciones,
Supabase remoto, usuarios ni despliegue.

## Fuente y método

Referencia oficial: <https://procontbusiness.com/>. Se descargaron el CSS
publicado (`assets/index-Bg-xulEQ.css`), el bundle JS y `/logo.png`
(SHA-256 `8a692554…e4eb427`). Los colores se tomaron de reglas CSS, literales JS
y del conteo de píxeles de la paleta del PNG. No se usaron recursos de otras
empresas con nombre similar.

## Paleta (fuente única: `src/theme/brand.ts`)

| Token Tailwind | HEX | Estado | Origen / uso en el sitio |
|---|---|---|---|
| `brand-600` / `primary` | `#1E3A8A` | Verificado (CSS) | `bg-blue-900`: navbar, footer, secciones |
| `brand-700` | `#01257B` | Verificado (logo) | Fondo del isotipo (color dominante) |
| `brand-800` | `#001E64` | Verificado (logo) | Cara sombreada del isotipo |
| `accent-300` | `#F2CE52` | Verificado (CSS) | `brand-secondary-300`, hover de CTA |
| `accent-400` | `#EEBB31` | Verificado (CSS) | `brand-secondary-400`, CTA con texto negro |
| `accent-500` | `#FFCC2A` | Verificado (logo) | Base amarilla del isotipo |
| — | `#FFC930` | Verificado (JS) | Íconos de contacto (solo referencia) |
| — | `#020617`, `#0F172A` | Verificado (CSS) | Texto slate del sitio (solo referencia) |
| `brand-50…500`, `brand-900/950` | `#EFF6FF` `#DBEAFE` `#BFDBFE` `#93C5FD` `#3B82F6` `#1E40AF` `#001B5E` | Escala Tailwind blue del sitio + sombra del logo | Tintes para fondos, selección y foco; `900/950` sombra del isotipo |
| `accent-50…200`, `600/700` | `#FEFCE8` `#FEF9C3` `#FDE047` `#A16207` `#713F12` | Escala Tailwind yellow del sitio | Fondos suaves; `600/700` para texto dorado AA |
| `gray-*` / `slate-*` | `#F8FAFC` `#F1F5F9` `#E2E8F0` `#CBD5E1` `#64748B` `#4B5563` `#374151` `#1F2937` `#0F172A` `#020617` | Neutros del sitio | Superficies, bordes (campos `#64748B`, 3:1) y texto |

Corrección UX/UI del 23/11/2026 (D-037): se retiraron los derivados anteriores
(`#173D66`/`#D5AE54` y la escala `#EEF2FA…#000E38`), el violeta (`info` ahora es
`brand-600`) y todo emoji de interfaz; ver
[docs/validation/ux-ui-correction-20261123/](validation/ux-ui-correction-20261123/REPORT.md).

Los derivados no son colores oficiales; solo completan la escala. Los colores
semánticos (éxito, alerta, error) y los colores categóricos de fases/tipos se
mantienen; no forman parte de la marca.

## Cambios de interfaz

- `tailwind.config.js` → `tailwind.config.ts`, que importa la paleta central.
  Todas las clases `blue-*` pasan a `brand-*` (misma escala tonal).
- Logotipo oficial en `public/brand/procont-logo.png`, favicon y `theme-color`.
  Componente `BrandLogo`; textos de marca en `BRAND` (`src/theme/brand.ts`).
- Encabezado de la app: barra azul corporativa con logo, borde dorado,
  reloj/notificaciones/usuario; navegación en barra blanca con pestaña activa azul
  (adaptable, con `flex-wrap`). La app no tiene menú lateral.
- Portal, login y formulario público: degradado azul corporativo, CTA dorado,
  logotipo y textos «Ticketera Procont / Procont Business».
- Botones, tarjetas, formularios, tablas, filtros y estados heredan `brand-*`.

## Retiro de referencias heredadas

- Título «Ticketera Controlling Gilat» y textos «equipo de Controlling».
- Catálogo `AREAS` y colores por área de Gilat (AASS, ATC, Controlling, DDC,
  GERE, OC, PMO, QA, SAQ) y la lista duplicada del formulario público: el
  catálogo queda **vacío** y los campos usan `AreaInput` (texto libre con
  sugerencias del catálogo). Se conserva la obligatoriedad donde existía.
- Importador Planner: ya no fija el área `DDC`; el operador indica el área
  (obligatoria para importar).
- Filtro de área del dashboard: opciones tomadas de las áreas presentes en datos.

## Pendientes organizacionales (no inventados)

- Catálogo oficial de áreas (añadir a `AREAS` en `src/lib/constants.ts`).
- Tipos de solicitud, plazos y factores SLA heredados de `sla-config.ts` y del
  formulario público (incluida la diferencia 4/5 días «Streamlit»).
- Etiquetas internas en inglés (Boards, Requests, fases) y nombre técnico
  `ticketera-controlling` en `package.json`: sin cambios.

## Verificación

- `npm run build`: correcto (tsc + Vite). Aviso de tamaño de chunk preexistente.
- `node --test tests/consumers.test.mjs`: 19/19 (red bloqueada en la prueba).
- Capturas headless de `/portal` (1280 px y 390 px), `/login` y `/request`.
  El panel autenticado no se capturó: requiere sesión y no se crearon usuarios.
