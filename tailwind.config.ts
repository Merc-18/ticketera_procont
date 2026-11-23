import type { Config } from 'tailwindcss'
import { BRAND_NAVY, BRAND_GOLD, BRAND_NEUTRAL, BRAND_STATE } from './src/theme/brand'

// Paleta corporativa centralizada en src/theme/brand.ts
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
    },
  },
  plugins: [],
} satisfies Config
