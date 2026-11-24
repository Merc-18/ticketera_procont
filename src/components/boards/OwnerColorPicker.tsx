import { useEffect, useRef, useState } from 'react'
import Icon from '../ui/Icon'
import { OWNER_COLORS, setOwnerColor, useOwnerColors, useOwnerColorStatus, type OwnerColorId } from '../../lib/card-colors'

/**
 * «Mi color de tarjeta»: el usuario interno elige el color que identifica sus tarjetas asignadas (franja lateral).
 * Solo se monta en el panel interno (nunca en el espacio del cliente). Vista previa con una tarjeta de muestra.
 * Emil: el panel aparece sin animación propia (control de uso ocasional, hereda las transiciones de color).
 */
export default function OwnerColorPicker({ userId, userName }: { userId: string; userName: string }) {
  const colors = useOwnerColors()
  const { loading, error: loadError } = useOwnerColorStatus()
  const current = colors[userId] ?? null
  const [open, setOpen] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [open])
  const choose = async (color: OwnerColorId) => {
    setSaveError(null)
    try { await setOwnerColor(color) }
    catch (err) { setSaveError(err instanceof Error ? err.message : 'No se pudo guardar el color.') }
  }
  const label = current ? OWNER_COLORS.find(c => c.id === current)?.label : loading ? 'Cargando…' : 'Sin asignación'

  return (
    <div className="owner-picker relative" ref={ref}>
      <button type="button" className="ui-button ui-button-secondary" aria-expanded={open} aria-controls="owner-color-panel" onClick={() => setOpen(o => !o)}>
        <span className={`owner-swatch ${current ? `owner-${current}` : 'owner-none'}`} aria-hidden="true" />
        <span>Mi color de tarjeta</span>
      </button>
      {open && (
        <div id="owner-color-panel" role="dialog" aria-label="Mi color de tarjeta" className="owner-panel">
          <fieldset>
            <legend>Color de tus tarjetas asignadas</legend>
            <div className="owner-options" aria-busy={loading}>
              {OWNER_COLORS.map(c => {
                const assignedTo = Object.entries(colors).find(([id, color]) => color === c.id && id !== userId)?.[0]
                return (
                <label key={c.id} className="owner-option">
                  <input type="radio" name="owner-color" checked={current === c.id} disabled={loading || !!assignedTo} onChange={() => void choose(c.id)} />
                  <span className={`owner-swatch owner-${c.id}`} aria-hidden="true" />{c.label}{assignedTo ? <span className="sr-only"> (asignado a otro miembro)</span> : null}
                </label>
                )
              })}
            </div>
          </fieldset>
          <p className="owner-preview-label">Vista previa</p>
          <div className={`owner-preview project-card prio-medium ${current ? `owner-${current}` : ''}`} aria-hidden="true">
            <b>Tarjeta de ejemplo</b>
            <span className="owner-preview-meta"><Icon name="user" size={14} />{userName.split(' ')[0]} · {label}</span>
          </div>
          {loading && <p role="status" className="owner-note">Sincronizando la preferencia del equipo…</p>}
          {(saveError || loadError) && <p role="alert" className="owner-error">{saveError || loadError}</p>}
          <p className="owner-note">El equipo comparte tu color de responsable. Prioridad y estado mantienen sus propios colores.</p>
        </div>
      )}
    </div>
  )
}
