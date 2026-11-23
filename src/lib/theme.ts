// Preferencia de apariencia (claro / oscuro). Solo guarda la palabra 'light' o 'dark' en localStorage:
// nunca datos de sesión. Claro es el valor por defecto y no se deduce del sistema operativo: el tema solo
// cambia cuando la persona lo elige. index.html aplica la preferencia antes del primer pintado (sin destello).
import { flushSync } from 'react-dom'

export type Theme = 'light' | 'dark'
export const THEME_STORAGE_KEY = 'ticketera-theme'
const THEME_COLOR: Record<Theme, string> = { light: '#E2E8F0', dark: '#060B16' }
const listeners = new Set<() => void>()

export function getTheme(): Theme {
  return typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

export function subscribeTheme(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function persist(theme: Theme) {
  try { localStorage.setItem(THEME_STORAGE_KEY, theme) } catch { /* almacenamiento bloqueado: el tema vale para esta visita */ }
}

function apply(theme: Theme) {
  const root = document.documentElement
  root.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme])
  // React actualiza el estado pulsado del selector dentro del mismo cuadro que la captura nueva.
  flushSync(() => { listeners.forEach(listener => listener()) })
}

type ViewTransitionDocument = Document & { startViewTransition?: (update: () => void) => { finished: Promise<void> } }

/**
 * Cambia el tema. Emil: el cambio es ocasional → un único fundido de opacidad de toda la página (200 ms,
 * curva ease-out propia, 120 ms con movimiento reducido); con teclado no se anima. Durante el cambio se
 * suspenden las transiciones de color de cada elemento para que no haya cientos de animaciones sueltas.
 */
export function setTheme(theme: Theme) {
  if (theme === getTheme()) return
  persist(theme)
  const root = document.documentElement
  const doc = document as ViewTransitionDocument
  root.setAttribute('data-theme-switching', '')
  const release = () => requestAnimationFrame(() => requestAnimationFrame(() => root.removeAttribute('data-theme-switching')))
  if (root.dataset.input === 'keyboard' || typeof doc.startViewTransition !== 'function') {
    apply(theme)
    release()
    return
  }
  doc.startViewTransition(() => apply(theme)).finished.finally(release)
}
