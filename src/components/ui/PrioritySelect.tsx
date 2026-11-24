import { useEffect, useId, useRef, useState } from 'react'
import Icon from './Icon'
import { PRIORITY_COLORS, PRIORITY_LABEL } from '../../lib/constants'

export type PriorityValue = 'low' | 'medium' | 'high' | 'urgent'
const ORDER: PriorityValue[] = ['low', 'medium', 'high', 'urgent']

/**
 * Selector de prioridad en semáforo (24/11/2026). Sustituye al <select> nativo, cuyo desplegable heredaba el fondo de
 * la opción elegida (cuatro filas amarillas). Patrón «listbox» de WAI-ARIA: botón con aria-haspopup, lista con
 * aria-activedescendant; teclado (flechas, Inicio/Fin, Enter/Espacio, Escape, Tab, letra inicial) y foco visible.
 * Emil: el panel aparece desde su disparador (transform-origin arriba) en 150 ms; con teclado o movimiento reducido,
 * sin animación. Cada opción muestra su propio color: Bajo verde, Medio ámbar, Alto naranja, Urgente rojo.
 */
export default function PrioritySelect<T extends string = PriorityValue>({ id, label, value, onChange, disabled, extraOptions = [], className = '', hideLabel = false }: {
  id?: string; label: string; value: T; onChange: (value: T) => void; disabled?: boolean
  extraOptions?: { value: T; label: string }[]; className?: string; hideLabel?: boolean
}) {
  const uid = useId()
  const baseId = id ?? `prio-${uid}`
  const options: { value: T; label: string; priority?: PriorityValue }[] = [
    ...extraOptions.map(o => ({ ...o })),
    ...ORDER.map(p => ({ value: p as unknown as T, label: PRIORITY_LABEL[p], priority: p })),
  ]
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(Math.max(0, options.findIndex(o => o.value === value)))
  const button = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const current = options.find(o => o.value === value) ?? options[0]

  useEffect(() => { if (open) { setActive(Math.max(0, options.findIndex(o => o.value === value))); list.current?.focus() } }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const choose = (i: number) => { onChange(options[i].value); setOpen(false); button.current?.focus() }
  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(options.length - 1, a + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)) }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0) }
    else if (e.key === 'End') { e.preventDefault(); setActive(options.length - 1) }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(active) }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); button.current?.focus() }
    else if (e.key === 'Tab') { setOpen(false) }
    else if (e.key.length === 1) {
      const i = options.findIndex(o => o.label.toLowerCase().startsWith(e.key.toLowerCase()))
      if (i >= 0) setActive(i)
    }
  }
  const onButtonKey = (e: React.KeyboardEvent) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); setOpen(true) }
  }

  return (
    <div className={`prio-select ${className}`} ref={root}>
      <span id={`${baseId}-label`} className={hideLabel ? 'sr-only' : 'prio-select-label'}>{label}</span>
      <button ref={button} id={baseId} type="button" className="prio-select-button ui-input" disabled={disabled}
        aria-haspopup="listbox" aria-expanded={open} aria-labelledby={`${baseId}-label ${baseId}`}
        onClick={() => setOpen(o => !o)} onKeyDown={onButtonKey}>
        {current.priority
          ? <span className={`prio-chip ${PRIORITY_COLORS[current.priority]}`}><Icon name="flag" size={12} aria-hidden="true" />{current.label}</span>
          : <span className="prio-select-plain">{current.label}</span>}
        <Icon name="arrow" size={14} className="prio-select-caret" aria-hidden="true" />
      </button>
      {open && (
        <ul ref={list} role="listbox" tabIndex={-1} className="prio-select-list" aria-labelledby={`${baseId}-label`}
          aria-activedescendant={`${baseId}-opt-${active}`} onKeyDown={onListKey}>
          {options.map((o, i) => (
            <li key={String(o.value)} id={`${baseId}-opt-${i}`} role="option" aria-selected={o.value === value}
              className={`prio-select-option ${i === active ? 'is-active' : ''}`}
              onMouseEnter={() => setActive(i)} onMouseDown={e => e.preventDefault()} onClick={() => choose(i)}>
              {o.priority
                ? <span className={`prio-chip ${PRIORITY_COLORS[o.priority]}`}><Icon name="flag" size={12} aria-hidden="true" />{o.label}</span>
                : <span className="prio-select-plain">{o.label}</span>}
              {o.value === value && <Icon name="check" size={14} className="prio-select-check" aria-hidden="true" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
