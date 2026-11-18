// ─── Identidad corporativa Procont Business ──────────────────────────────────
// Fuente única de colores y textos de marca. Consumida por tailwind.config.ts
// (clases `brand-*`, `accent-*`, `primary`) y por los componentes React.
//
// Referencia oficial: https://procontbusiness.com/ (revisada 18/11/2026).
//   [V-CSS]  valor presente en el CSS publicado (assets/index-*.css)
//   [V-JS]   valor literal en el bundle JS publicado
//   [V-LOGO] color de píxel medido en /logo.png publicado
//   [D]      derivado (tinte/sombra interpolado); no es un color oficial
// Detalle en docs/frontend-identidad-procont.md.

/** Azul corporativo (escala usada como `brand-*`). */
export const BRAND_NAVY = {
  50:  '#EEF2FA', // [D]
  100: '#DCE4F5', // [D]
  200: '#B9C8EB', // [D]
  300: '#8AA1DA', // [D]
  400: '#5574C2', // [D]
  500: '#2F4FA3', // [D]
  600: '#1E3A8A', // [V-CSS] clase bg-blue-900 del sitio: navbar, footer y secciones del sitio
  700: '#01257B', // [V-LOGO] fondo del logotipo
  800: '#001E64', // [V-LOGO] cara sombreada del logotipo
  900: '#001652', // [D]
  950: '#000E38', // [D]
} as const

/** Amarillo/dorado corporativo (escala usada como `accent-*`). */
export const BRAND_GOLD = {
  50:  '#FFF9E5', // [D]
  100: '#FFF1BF', // [D]
  200: '#FCE08A', // [D]
  300: '#F2CE52', // [V-CSS] brand-secondary-300 (hover de CTA)
  400: '#EEBB31', // [V-CSS] brand-secondary-400 (CTA y etiquetas)
  500: '#FFCC2A', // [V-LOGO] base amarilla del logotipo
  600: '#C9930E', // [D]
  700: '#8A6400', // [D] texto dorado sobre fondo claro (contraste AA)
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
