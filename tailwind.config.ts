import type { Config } from 'tailwindcss'
import { BRAND_NAVY, BRAND_GOLD } from './src/theme/brand'

// Paleta corporativa centralizada en src/theme/brand.ts
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand:   BRAND_NAVY,
        accent:  BRAND_GOLD,
        primary: BRAND_NAVY[600],
        // Estados semánticos: se mantienen los valores funcionales existentes
        success: '#10B981',
        warning: '#F59E0B',
        danger:  '#EF4444',
        info:    '#8B5CF6',
      },
    },
  },
  plugins: [],
} satisfies Config
