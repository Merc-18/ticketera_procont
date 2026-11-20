// ─── Identidad corporativa Procont Business ──────────────────────────────────
// Fuente única de colores y textos de marca. Consumida por tailwind.config.ts
// (clases `brand-*`, `accent-*`, `primary`) y por los componentes React.
//
// Logo y textos de referencia: https://procontbusiness.com/ (revisada 18/11/2026).
//   [V-CSS]  valor presente en el CSS publicado (assets/index-*.css)
//   [V-JS]   valor literal en el bundle JS publicado
//   [V-LOGO] color de píxel medido en /logo.png publicado
//   [D]      derivado (tinte/sombra interpolado); no es un color oficial
// Detalle en docs/frontend-identidad-procont.md.

/** Escala visual aprobada para Ticketera (20/11/2026), derivada de #173D66. */
export const BRAND_NAVY = {
  50: '#EDF3F9', 100: '#DFE8F2', 200: '#C4D4E5', 300: '#9AAFC6',
  400: '#6D8FAF', 500: '#36648E', 600: '#173D66', 700: '#173D66',
  800: '#123252', 900: '#102C49', 950: '#0C243D',
} as const

/** Dorado Procont aprobado; los tonos claros se reservan a superficies y énfasis. */
export const BRAND_GOLD = {
  50: '#FAF5E9', 100: '#F1E7CF', 200: '#E8D6AB', 300: '#DFBF78',
  400: '#D5AE54', 500: '#BB9139', 600: '#92702B', 700: '#72551F',
} as const

/** Otros valores verificados del sitio (no se exponen como escala propia). */
export const BRAND_REFERENCE = {
  iconGold: '#FFC930', // [V-JS] color de íconos de contacto
  slate950: '#020617', // [V-CSS] texto principal de tarjetas
  slate900: '#0F172A', // [V-CSS]
  white:    '#FFFFFF', // [V-CSS]
} as const

export const BRAND = {
  company:     'Procont Business',
  appName:     'Ticketera Procont',
  tagline:     'Gestión de solicitudes y proyectos',
  teamLabel:   'equipo de Procont Business',
  logoSrc:     '/brand/procont-logo.png', // copia de https://procontbusiness.com/logo.png
  website:     'https://procontbusiness.com/',
} as const
