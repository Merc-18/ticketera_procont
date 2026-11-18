import { useAreas } from '../../hooks/useAreas'

interface Props {
  value: string
  onChange: (value: string) => void
  required?: boolean
  placeholder?: string
  className?: string
}

/**
 * Campo de área. Con áreas activas en Supabase muestra un selector con ese
 * catálogo (y conserva un valor histórico que ya no esté en la lista). Si el
 * catálogo está vacío o aún no disponible, mantiene el texto libre anterior.
 */
export default function AreaInput({ value, onChange, required, placeholder = 'Escribe el área', className }: Props) {
  const { activeNames, loading } = useAreas()

  if (!loading && activeNames.length > 0) {
    return (
      <select required={required} value={value} onChange={e => onChange(e.target.value)} className={className}>
        <option value="">{required ? 'Selecciona un área' : placeholder}</option>
        {activeNames.map(name => <option key={name} value={name}>{name}</option>)}
        {value && !activeNames.includes(value) && <option value={value}>{value} (histórica)</option>}
      </select>
    )
  }
  return (
    <input
      type="text"
      required={required}
      maxLength={200}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={className}
    />
  )
}
