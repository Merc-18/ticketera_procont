# Modo oscuro — Ticketera Procont (23/11/2026)

**Veredicto: APROBADO CON OBSERVACIONES** (§8).

| Dato | Valor |
|---|---|
| Base | `main` publicada `49cca39b0288192f8d1b5817f42255271ab90fd6` (versión 202611231449) |
| Rama | `dark-mode-20261123`, **solo local**, sin upstream; sin push, sin merge y sin despliegue |
| Alcance | Solo frontend, UX/UI y documentación. Sin cambios en `supabase/**`, SQL, migraciones, RPC, RLS, Edge Functions, datos, contratos, autenticación, variables de Vercel ni dependencias |
| Skills | Taste `design-taste-frontend` 2.5.1 (sha256 `0c7a5852…`) y Emil `emil-design-eng` (sha256 `cdbfe467…`), leídas del original instalado. El gate histórico OPEN 14 no se reinicia |
| Evidencia | Build local con el servidor de datos ficticios; red externa bloqueada; **no es producción** |

## 1. Qué se construyó

1. **Un sistema de tokens con dos juegos, centralizado** (`src/theme/themes.ts` y `src/index.css`):
   - cada familia Tailwind de la interfaz tiene variables por **rol** (fondo, texto y borde);
   - en claro valen exactamente el hex aprobado, así que el diseño claro no cambia;
   - en oscuro cada rol tiene su valor diseñado, en lugar de invertir la paleta;
   - los tokens semánticos `--p-*` separan la acción como texto/foco de la acción como relleno.

   Detalle en [THEME_TOKENS.md](THEME_TOKENS.md).
2. **Paleta oscura con la identidad Procont:**
   - superficies navy en escalones: página `#060B16`, superficie `#111B30`, elevada `#172338`;
   - texto `#E2E8F0`, sin blanco puro;
   - azul de marca `#93C5FD` como texto y `#2563EB` como relleno;
   - dorado oficial `#EEBB31` sin cambios, con `#F2CE52` solo como texto de aviso medido;
   - banda corporativa `#0D1A3F` con el borde dorado;
   - sin violeta.
3. **Selector de apariencia** (`ThemeToggle`, Lucide Sun/Moon): dos opciones visibles con `aria-pressed`, tooltip, 44 px y foco visible. Ubicaciones:
   - barras del portal, del ingreso y del espacio del cliente;
   - banda del panel;
   - fila superior derecha en seguimiento, `/login` y entrada al espacio.
4. **Persistencia** en `localStorage` (`ticketera-theme` = `light`/`dark`, nada de sesión):
   - claro por defecto y sin seguir al sistema operativo;
   - aplicada en el `<head>` antes del primer pintado, así que no hay destello;
   - se mantiene al navegar, al recargar y al entrar o salir de sesión.
5. **Transición** (Emil): un único fundido de opacidad de toda la página con View Transitions (200 ms, curva propia; 120 ms con movimiento reducido). Con teclado no se anima, y durante el cambio se suspenden las transiciones de cada elemento.
6. **Cobertura completa de las cuatro áreas:**
   - 72 `bg-white` pasaron a `bg-surface`;
   - el borde por defecto, el `accent-color` de las casillas y los campos sin fondo propio siguen al tema;
   - `color-scheme` por tema para los controles nativos;
   - tokens propios para los avatares y para el texto sobre dorado;
   - reflejo superior de 1 px en las tarjetas oscuras (Taste `cards.md`);
   - contorno del logotipo en oscuro, sin teñirlo.

## 2. Decisiones de diseño tomadas con las skills

Ver [TASTE_COMPLIANCE.md](TASTE_COMPLIANCE.md) y [EMIL_COMPLIANCE.md](EMIL_COMPLIANCE.md). Las que cambiaron la implementación:

- **Taste, acento 3:1 sobre el fondo.** El relleno primario pasó de `#1D4ED8` (2,94:1) a `#2563EB` (3,78:1).
- **Taste, `cards.md`.** Escalón de superficie de 1,15:1 (en claro 1,18:1), borde de tinta al ≈ 12 % y reflejo superior.
- **Taste, grado elegido en la carga o con un clic.** Script en el `<head>` y selector; nunca por scroll ni por el sistema operativo.
- **Emil, frecuencia.** Es una acción ocasional, así que lleva animación estándar; con teclado, ninguna.
- **Emil, colores que se superponen.** Un solo fundido de página en lugar de transiciones de color por elemento.
- **Emil, movimiento reducido.** Se conserva el fundido de opacidad.

## 3. Correcciones detectadas durante la implementación

| Hallazgo | Corrección |
|---|---|
| Texto blanco sobre `brand-600` oscuro `#3B82F6` (3,52:1) en etiquetas del Gantt, «Actual» y contadores | `brand-600` oscuro = `#2563EB` (4,94:1) |
| Bordes sin color (`border` a secas) casi blancos en oscuro: modal de validación, panel de urgencias, separador del Gantt | `borderColor.DEFAULT` y `divideColor.DEFAULT` siguen al tema |
| Campos del modal del personal en gris del navegador | Campos sin fondo propio en `--p-elevated` (en claro = `#FFFFFF`, sin cambio) |
| `accent-primary` de las casillas fijo en navy | `accentColor` por tema |
| Icono «+» azul sobre tinte dorado | En oscuro, dorado de marca |
| Relleno primario 2,94:1 frente a la página | `#2563EB` (3,78:1) |

## 4. Pruebas

| Suite | Resultado |
|---|---|
| `tsc --noEmit` y `npm run build` | PASS |
| Unitarias Node (`tests/*.test.mjs`) | **173/173** |
| UI con Vite dev (`tests/ui/*.ui.test.mjs`), incluidas las **8 nuevas del tema** | **69/69** (6 omitidas: solo corren con build y se cubren en la fila siguiente) |
| UX sobre build de producción | **36/36**, 0 omitidas |
| Re-auditoría claro / oscuro | 115 + 115 pantallas (más 6 + 6 a 320 px), 0 fallos, 0 errores de página, 0 peticiones externas |
| Tokens medidos desde el CSS compilado | 56 pares, 0 fallos |

Las pruebas Python no se ejecutaron porque no hay cambios en scripts Python ni en backend; su último resultado es 52/52.

Logs en [`data/tests/`](data/tests/).

La suite del tema cubre:

- claro por defecto;
- selector accesible;
- puntero con una sola View Transition;
- teclado sin animación;
- movimiento reducido a 120 ms;
- persistencia sin destello en 4 rutas y al recargar;
- sesión de cliente (fixtures: entrar, navegar, salir);
- sesión del panel (fixtures: entrar, cambiar de tema, cerrar sesión).

No se usaron logins reales ni se crearon tickets.

## 5. El modo claro no se degradó

- Las métricas de las 115 pantallas en claro son idénticas a las de la corrección aprobada: contraste, lectura, etiquetas, encabezados, desbordamiento y emoji en 0; h1 en 115/115.
- El **inventario de colores renderizados** en claro coincide con el aprobado: 75 de 115 pantallas idénticas. Las otras 40 solo añaden `#DBEAFE` y `#1E3A8A`, el tinte y el icono activos del nuevo selector, que son tokens ya aprobados. **No desaparece ningún color.**
- El movimiento medido en claro es idéntico.

## 6. Evidencia

- [`screenshots/light/`](screenshots/light/) y [`screenshots/dark/`](screenshots/dark/): 121 + 121 capturas comparables con el mismo nombre de pantalla. [`screenshots-manifest.json`](screenshots-manifest.json) registra área, pantalla, tema, resolución, versión, fecha y sha256 de cada una.
- Informes: [THEME_TOKENS](THEME_TOKENS.md) · [Accesibilidad](ACCESSIBILITY_REPORT.md) · [Responsive](RESPONSIVE_REPORT.md) · [Rendimiento](PERFORMANCE_REPORT.md).
- [`SHA256SUMS`](SHA256SUMS) cubre todos los archivos de esta carpeta.

## 7. Archivos

- **Nuevos:**
  - `src/theme/themes.ts`, `src/lib/theme.ts`;
  - `src/components/ui/ThemeToggle.tsx`;
  - `tests/ui/theme.ui.test.mjs`;
  - esta carpeta.
- **Modificados:**
  - `tailwind.config.ts`, `index.html` (script de tema), `src/index.css` (tokens oscuros, roles y selector);
  - `src/components/ui/Icon.tsx` (Sun y Moon) y `BrandLogo.tsx` (clase del logotipo);
  - `src/lib/constants.ts` (avatares);
  - `App.tsx`, `RequestValidationModal.tsx` (banda), `PublicLanding.tsx`, `ClientHome.tsx`, `ClientWorkspace.tsx`, `RequestTracking.tsx`, `LoginForm.tsx`, `ClientLaunch.tsx` (selector);
  - 4 archivos con `text-on-accent`;
  - unos 30 componentes con `bg-white` → `bg-surface`.

## 8. Veredicto

**APROBADO CON OBSERVACIONES.** Se cumplen los 14 criterios de finalización:

- el tema se puede cambiar y persiste;
- cubre las cuatro áreas sin componentes olvidados;
- conserva la paleta oficial y no tiene violeta;
- 0 contrastes insuficientes en los dos temas;
- animaciones conformes a Taste y Emil, con movimiento reducido;
- responsive en los dos temas;
- modo claro intacto;
- pruebas aprobadas, documentación completa y bundle verificable.

Observaciones:

- **(a)** El gate Taste sigue en **OPEN 14**: no se reinicia y sus excepciones previas (T7, T11, H-20) no cambian. El modo oscuro se valida con la re-auditoría y las mediciones, no con rondas nuevas.
- **(b)** Las pruebas se hicieron en Chromium emulado: no en Safari ni Firefox, ni con lectores de pantalla reales. En navegadores sin View Transitions el cambio es instantáneo.
- **(c)** Los tres recorridos con JavaScript en WARN siguen igual (+1,7 KiB).
- **(d)** Todo está **sin publicar**: el usuario revisará antes de autorizar.
