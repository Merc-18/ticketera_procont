import type { Config } from 'tailwindcss'
import plugin from 'tailwindcss/plugin'
import { BRAND_NAVY, BRAND_GOLD, BRAND_NEUTRAL, BRAND_STATE } from './src/theme/brand'
import { themeColors, themeVariables } from './src/theme/themes'

// Paleta corporativa centralizada en src/theme/brand.ts; temas claro/oscuro por rol en src/theme/themes.ts.
const bg = themeColors('bg'), tx = themeColors('tx'), bd = themeColors('bd')
/** Superficie de tarjetas y barras (antes `bg-white` = #F8FAFC); en oscuro, #111B30. */
const surface = 'rgb(var(--surface) / <alpha-value>)'

export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  future: { hoverOnlyWhenSupported: true },
  theme: {
    extend: {
      transitionTimingFunction: { DEFAULT: 'cubic-bezier(.23,1,.32,1)' },
      transitionDuration: { DEFAULT: '150ms' },
      colors: {
        brand:   BRAND_NAVY,
        accent:  BRAND_GOLD,
        primary: BRAND_NAVY[600],
        gray: BRAND_NEUTRAL,
        slate: BRAND_NEUTRAL,
        white: '#F8FAFC',
        // Estados funcionales (ver src/theme/brand.ts). Sin violeta: «info» usa el azul de marca.
        success: BRAND_STATE.success,
        warning: BRAND_STATE.warningText,
        danger:  BRAND_STATE.danger,
        info:    BRAND_NAVY[600],
      },
      backgroundColor: { ...bg, surface, elevated: 'rgb(var(--elevated) / <alpha-value>)', primary: bg.brand[600] },
      gradientColorStops: { ...bg, surface },
      textColor: { ...tx, primary: tx.brand[600], 'on-accent': '#0F172A' },
      placeholderColor: tx,
      // DEFAULT: el `border` sin color (antes gray-200 estático) también sigue al tema.
      borderColor: { ...bd, DEFAULT: bd.gray[200], surface, primary: bd.brand[600] },
      divideColor: { ...bd, DEFAULT: bd.gray[200] },
      ringColor: { ...bd, primary: bd.brand[600] },
      ringOffsetColor: { ...bg, surface },
      outlineColor: bd,
      accentColor: { ...bg, primary: bg.brand[600] },
    },
  },
  plugins: [plugin(({ addBase }) => addBase(themeVariables()))],
} satisfies Config
