// ─── Temas claro y oscuro: una sola aplicación, dos juegos de tokens ─────────────────────────────
// Cada familia de color Tailwind usada por la interfaz se resuelve con variables CSS por ROL:
//   bg  → fondos (bg-*, from/via/to)      tx → texto (text-*, placeholder-*)      bd → bordes (border-*, ring-*, divide-*)
// En claro, los tres roles valen exactamente el hex aprobado (el diseño claro no cambia). En oscuro cada rol
// tiene su propio valor: un mismo `brand-700` es texto azul claro sobre navy, relleno azul con texto blanco o
// borde visible, en lugar de invertir la paleta. Valores y contrastes: docs/validation/dark-mode-20261123.
import twColors from 'tailwindcss/colors'
import { BRAND_GOLD, BRAND_NAVY, BRAND_NEUTRAL } from './brand'

type Scale = Record<string, string>
type Role = 'bg' | 'tx' | 'bd'
const SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950']
const pick = (s: Scale): Scale => Object.fromEntries(SHADES.filter(k => s[k]).map(k => [k, s[k]]))

/** Paleta clara aprobada (corrección UX/UI 23/11/2026), igual para los tres roles. */
const LIGHT: Record<string, Scale> = {
  gray: pick(BRAND_NEUTRAL), slate: pick(BRAND_NEUTRAL), brand: pick(BRAND_NAVY), accent: pick(BRAND_GOLD),
  red: pick(twColors.red), green: pick(twColors.green), yellow: pick(twColors.yellow),
  // Avatares: los mismos tonos de antes (brand-600, brand-800, gray-600, gray-700, brand-500), ahora con nombre propio.
  avatar: { 1: BRAND_NAVY[600], 2: BRAND_NAVY[800], 3: BRAND_NEUTRAL[600], 4: BRAND_NEUTRAL[700], 5: BRAND_NAVY[500] },
}

/**
 * Oscuro: grafito profundo con sesgo azul (croma ≈ 0,02; corrección de color 23/11/2026, antes navy 0,044),
 * para que la banda navy, el azul de acción y el dorado contrasten por matiz; nunca negro ni blanco puros.
 * Página #0B0F16 → alterno #0F141C → superficie #131A26 → elevada #1A2230 (Taste cards.md: un escalón por nivel).
 * Texto principal #E2E8F0 (14:1), secundario #B8C3D6, atenuado #A3B0C7, meta #8E9DB8 (≥ 4,99:1 en todas las
 * superficies). Azul de marca como texto #93C5FD; relleno #1D4ED8–#2563EB (texto blanco ≥ 4,9:1); dorado
 * oficial #EEBB31 sin cambios como relleno, #F2CE52 solo como texto de aviso medido (≥ 10:1).
 */
const DARK: Record<Role, Record<string, Scale>> = {
  bg: {
    gray: { 50: '#161D29', 100: '#1B2331', 200: '#212A3A', 300: '#2C3647', 400: '#64748B', 500: '#7C8BA6', 600: '#46526A', 700: '#3B465C', 800: '#1F2838', 900: '#1B2331', 950: '#0B0F16' },
    brand: { 50: '#12224A', 100: '#172B5C', 200: '#1E3A75', 300: '#2B4F96', 400: '#3B82F6', 500: '#93C5FD', 600: '#2563EB', 700: '#1D4ED8', 800: '#60A5FA', 900: '#1E3A8A', 950: '#1E3A8A' },
    accent: { 50: '#211B0B', 100: '#2B230C', 200: '#5C4A14', 300: '#F2CE52', 400: '#EEBB31', 500: '#FFC930', 600: '#A16207', 700: '#713F12' },
    red: { 50: '#2A1316', 100: '#3A171C', 200: '#5A1D24', 300: '#7F1D1D', 400: '#EF4444', 500: '#EF4444', 600: '#DC2626', 700: '#DC2626', 800: '#B91C1C', 900: '#7F1D1D', 950: '#450A0A' },
    green: { 50: '#0E2419', 100: '#12301F', 200: '#14532D', 300: '#166534', 400: '#22C55E', 500: '#16A34A', 600: '#15803D', 700: '#15803D', 800: '#166534', 900: '#14532D', 950: '#052E16' },
    yellow: { 50: '#241E0A', 100: '#2E260D', 200: '#5C4A14', 300: '#FDE047', 400: '#FACC15', 500: '#EAB308', 600: '#CA8A04', 700: '#A16207', 800: '#854D0E', 900: '#713F12', 950: '#422006' },
    avatar: { 1: '#1D4ED8', 2: '#1E40AF', 3: '#44557A', 4: '#3A4A6E', 5: '#2563EB' },
  },
  tx: {
    gray: { 50: '#F1F5F9', 100: '#E2E8F0', 200: '#CBD5E1', 300: '#5E6E8C', 400: '#8E9DB8', 500: '#A3B0C7', 600: '#B8C3D6', 700: '#CED7E5', 800: '#E2E8F0', 900: '#E8EDF5', 950: '#F1F5F9' },
    brand: { 50: '#EFF6FF', 100: '#DBEAFE', 200: '#BFDBFE', 300: '#93C5FD', 400: '#93C5FD', 500: '#93C5FD', 600: '#93C5FD', 700: '#93C5FD', 800: '#BFDBFE', 900: '#BFDBFE', 950: '#DBEAFE' },
    accent: { 50: '#FEFCE8', 100: '#FEF9C3', 200: '#FDE047', 300: '#F2CE52', 400: '#F2CE52', 500: '#F2CE52', 600: '#F2CE52', 700: '#F2CE52', 800: '#FDE68A' },
    red: { 50: '#FEF2F2', 100: '#FEE2E2', 200: '#FECACA', 300: '#FCA5A5', 400: '#F87171', 500: '#F87171', 600: '#FCA5A5', 700: '#FCA5A5', 800: '#FCA5A5', 900: '#FECACA', 950: '#FEE2E2' },
    green: { 50: '#F0FDF4', 100: '#DCFCE7', 200: '#BBF7D0', 300: '#86EFAC', 400: '#4ADE80', 500: '#4ADE80', 600: '#86EFAC', 700: '#86EFAC', 800: '#86EFAC', 900: '#BBF7D0', 950: '#DCFCE7' },
    yellow: { 50: '#FEFCE8', 100: '#FEF9C3', 200: '#FEF08A', 300: '#FDE047', 400: '#FDE047', 500: '#FDE047', 600: '#FDE047', 700: '#FDE047', 800: '#FDE047', 900: '#FEF08A', 950: '#FEF9C3' },
    avatar: {},
  },
  bd: {
    gray: { 50: '#1B2331', 100: '#212A3A', 200: '#283143', 300: '#343F54', 400: '#6B7891', 500: '#7C8BA6', 600: '#94A3B8', 700: '#A3B0C7', 800: '#B8C3D6', 900: '#CED7E5', 950: '#E2E8F0' },
    brand: { 50: '#172B5C', 100: '#1E3A75', 200: '#2B4A8A', 300: '#36589E', 400: '#3B82F6', 500: '#60A5FA', 600: '#60A5FA', 700: '#93C5FD', 800: '#93C5FD', 900: '#BFDBFE', 950: '#BFDBFE' },
    accent: { 50: '#2B230C', 100: '#5C4A14', 200: '#5C4A14', 300: '#8A6A1C', 400: '#EEBB31', 500: '#FFC930', 600: '#F2CE52', 700: '#F2CE52' },
    red: { 50: '#3A171C', 100: '#5A1D24', 200: '#5A1D24', 300: '#7F1D1D', 400: '#EF4444', 500: '#EF4444', 600: '#F87171', 700: '#F87171', 800: '#FCA5A5', 900: '#FCA5A5', 950: '#FECACA' },
    green: { 50: '#12301F', 100: '#14532D', 200: '#14532D', 300: '#166534', 400: '#22C55E', 500: '#22C55E', 600: '#4ADE80', 700: '#4ADE80', 800: '#86EFAC', 900: '#86EFAC', 950: '#BBF7D0' },
    yellow: { 50: '#2E260D', 100: '#5C4A14', 200: '#5C4A14', 300: '#854D0E', 400: '#EAB308', 500: '#EAB308', 600: '#FACC15', 700: '#FDE047', 800: '#FDE047', 900: '#FEF08A', 950: '#FEF9C3' },
    avatar: {},
  },
}

const channels = (hex: string) => {
  const h = hex.replace('#', '')
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)).join(' ')
}
const varName = (role: Role, family: string, shade: string) => `--${role}-${family}-${shade}`
/** `slate` es alias de `gray` en ambos temas. */
const darkFamily = (family: string) => (family === 'slate' ? 'gray' : family)

/** Escalas Tailwind que apuntan a las variables del rol indicado. */
export function themeColors(role: Role) {
  const out: Record<string, Scale> = {}
  for (const [family, scale] of Object.entries(LIGHT)) {
    out[family] = Object.fromEntries(Object.keys(scale).map(s => [s, `rgb(var(${varName(role, family, s)}) / <alpha-value>)`]))
  }
  return out
}

/** Bloque de variables para `addBase`: claro en :root, oscuro bajo [data-theme="dark"]. */
export function themeVariables() {
  const light: Record<string, string> = {}
  const dark: Record<string, string> = {}
  for (const role of ['bg', 'tx', 'bd'] as Role[]) {
    for (const [family, scale] of Object.entries(LIGHT)) {
      for (const [shade, hex] of Object.entries(scale)) {
        light[varName(role, family, shade)] = channels(hex)
        const d = DARK[role][darkFamily(family)]?.[shade] ?? DARK.bg[darkFamily(family)]?.[shade] ?? hex
        dark[varName(role, family, shade)] = channels(d)
      }
    }
  }
  return { ':root': light, ':root[data-theme="dark"]': dark }
}

/** Para pruebas y documentación (THEME_TOKENS.md). */
export const THEME_SCALES = { LIGHT, DARK }
