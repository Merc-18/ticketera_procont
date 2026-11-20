import type { Config } from 'tailwindcss'
import { BRAND_NAVY, BRAND_GOLD } from './src/theme/brand'

// Paleta corporativa centralizada en src/theme/brand.ts
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  future: { hoverOnlyWhenSupported: true },
  theme: {
    extend: {
      colors: {
        brand:   BRAND_NAVY,
        accent:  BRAND_GOLD,
        primary: BRAND_NAVY[600],
        gray: { 50: '#F0F4F8', 100: '#E4ECF4', 200: '#CBD7E5', 300: '#9AAFC6', 400: '#5B6F86', 500: '#52657B', 600: '#465B73', 700: '#334155', 800: '#283D54', 900: '#23364D', 950: '#102C49' },
        slate: { 50: '#E8EEF5' },
        white: '#F8FAFC',
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
