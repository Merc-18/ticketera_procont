import { useId } from 'react'
import { AREAS } from '../../lib/constants'

interface Props {
  value: string
  onChange: (value: string) => void
  required?: boolean
  placeholder?: string
  className?: string
  /** Valores adicionales a sugerir (p. ej. áreas ya registradas). */
  suggestions?: readonly string[]
}

/**
 * Campo de área en texto libre con sugerencias del catálogo centralizado
 * (`AREAS`). Mientras Procont Business no defina su catálogo, no se ofrecen
 * opciones predefinidas ni se asume un área por defecto.
 */
export default function AreaInput({ value, onChange, required, placeholder = 'Escribe el área', className, suggestions = [] }: Props) {
  const listId = useId()
  const options = Array.from(new Set([...AREAS, ...suggestions].filter(Boolean)))
  return (
    <>
      <input
        type="text"
        required={required}
        maxLength={200}
        value={value}
        onChange={e => onChange(e.target.value)}
        list={options.length > 0 ? listId : undefined}
        placeholder={placeholder}
        className={className}
      />
      {options.length > 0 && (
        <datalist id={listId}>
          {options.map(a => <option key={a} value={a} />)}
        </datalist>
      )}
    </>
  )
}
