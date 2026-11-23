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

/**
 * Escala azul oficial (corrección UX/UI 23/11/2026). procontbusiness.com usa la escala azul de
 * Tailwind: blue-900 #1E3A8A [V-CSS, mayor superficie renderizada] y blue-500 #3B82F6 [V-CSS].
 * 700–900: azules del isotipo [V-LOGO] #01257B (67 % de píxeles), #001E64, #001B5E.
 * 50–300 y 500: pasos de la misma escala azul de Tailwind que usa el sitio [D], para tintes y estados.
 */
export const BRAND_NAVY = {
  50: '#EFF6FF', 100: '#DBEAFE', 200: '#BFDBFE', 300: '#93C5FD',
  400: '#3B82F6', 500: '#1E40AF', 600: '#1E3A8A', 700: '#01257B',
  800: '#001E64', 900: '#001B5E', 950: '#001B5E',
} as const

/**
 * Dorado oficial: #EEBB31 [V-CSS, superficies], #F2CE52 [V-CSS], #FFCC2A [V-LOGO], #FFC930 [V-JS],
 * #FEF9C3 y #FDE047 [V-CSS]. 50, 600 y 700 son pasos de la misma escala amarilla de Tailwind [D],
 * usados solo como fondo tenue (50) o texto oscuro sobre dorado (600, 700). El dorado nunca es texto.
 */
export const BRAND_GOLD = {
  50: '#FEFCE8', 100: '#FEF9C3', 200: '#FDE047', 300: '#F2CE52',
  400: '#EEBB31', 500: '#FFC930', 600: '#A16207', 700: '#713F12',
} as const

/**
 * Neutros oficiales [V-CSS]: #F8FAFC #F1F5F9 #E2E8F0 #CBD5E1 #64748B #4B5563 #374151 #1F2937
 * #0F172A #020617. 400 (#64748B) solo como texto meta sobre superficies (4,55:1), nunca sobre el fondo.
 */
export const BRAND_NEUTRAL = {
  50: '#F8FAFC', 100: '#F1F5F9', 200: '#E2E8F0', 300: '#CBD5E1', 400: '#64748B',
  500: '#4B5563', 600: '#374151', 700: '#1F2937', 800: '#0F172A', 900: '#0F172A', 950: '#020617',
} as const

/**
 * Estados. Danger: #EF4444 [V-CSS] solo como indicador; texto y relleno con blanco #B91C1C
 * (red-700, misma escala) [D] para AA. Success #15803D (green-700) [D]: el sitio no publica un
 * verde; se usa solo para estados funcionales de completado y aprobación. Warning: #FEF9C3 [V-CSS]
 * con texto #713F12 [D].
 */
export const BRAND_STATE = {
  success: '#15803D', successBg: '#F0FDF4', danger: '#B91C1C', dangerIndicator: '#EF4444',
  dangerBg: '#FEF2F2', warningBg: '#FEF9C3', warningText: '#713F12',
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
