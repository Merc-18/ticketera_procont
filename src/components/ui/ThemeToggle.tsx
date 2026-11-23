import { useSyncExternalStore } from 'react'
import Icon from './Icon'
import { getTheme, setTheme, subscribeTheme, type Theme } from '../../lib/theme'

const OPTIONS: { value: Theme; label: string; icon: 'sun' | 'moon' }[] = [
  { value: 'light', label: 'Modo claro', icon: 'sun' },
  { value: 'dark', label: 'Modo oscuro', icon: 'moon' },
]

/**
 * Selector de apariencia: dos opciones siempre visibles (Lucide Sun / Moon) con estado activo por aria-pressed,
 * nombre accesible y tooltip nativo; objetivos de 44 px. `onBand` para la banda azul del panel. En páginas sin barra
 * va en una fila encima de la tarjeta, alineado a la derecha (el mismo lado que en las barras).
 */
export default function ThemeToggle({ onBand = false }: { onBand?: boolean }) {
  const theme = useSyncExternalStore(subscribeTheme, getTheme, () => 'light' as Theme)
  return (
    <div role="group" aria-label="Apariencia" className={`theme-toggle${onBand ? ' on-band' : ''}`}>
      {OPTIONS.map(option => (
        <button key={option.value} type="button" aria-pressed={theme === option.value} aria-label={option.label} title={option.label}
          onClick={() => setTheme(option.value)}>
          <Icon name={option.icon} size={18} />
        </button>
      ))}
    </div>
  )
}
