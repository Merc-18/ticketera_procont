import type { CatalogArea, CatalogSubsystem, CatalogSystem, Studio } from '../../hooks/useCatalogs'

export interface ClassificationValue {
  studio_id: string; system_id: string; subsystem_id: string; area_id: string; subarea_id: string
}
export const EMPTY_CLASSIFICATION: ClassificationValue = { studio_id: '', system_id: '', subsystem_id: '', area_id: '', subarea_id: '' }

interface Props {
  value: ClassificationValue
  onChange: (value: ClassificationValue) => void
  studios: Studio[]
  systems: CatalogSystem[]
  subsystems: CatalogSubsystem[]
  areas: CatalogArea[]
  selectClassName: string
}

/**
 * Estudio → proyecto/subproyecto → área/subárea. Muestra solo nombres (nunca RUC ni
 * códigos internos). Las áreas aparecen únicamente para estudios que las tengan.
 */
export default function ClassificationFields({ value, onChange, studios, systems, subsystems, areas, selectClassName }: Props) {
  const uniqueStudios = Array.from(new Map(studios.map(s => [s.name.toLowerCase(), s])).values())
  const subs = subsystems.filter(s => s.system_id === value.system_id)
  const studioAreas = areas.filter(a => a.studio_id === value.studio_id && !a.parent_id && value.studio_id)
  const subareas = areas.filter(a => a.parent_id === value.area_id && value.area_id)
  const system = systems.find(s => s.id === value.system_id)
  const set = (patch: Partial<ClassificationValue>) => onChange({ ...value, ...patch })
  const label = (text: string, required: boolean) => (
    <label className="block text-sm font-medium text-gray-700 mb-2">
      {text} {required && <span className="text-red-500">*</span>}
    </label>
  )

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="sm:col-span-2">
        {label('Estudio', true)}
        <select required value={value.studio_id} className={selectClassName}
          onChange={e => set({ studio_id: e.target.value, area_id: '', subarea_id: '' })}>
          <option value="">Selecciona un estudio</option>
          {uniqueStudios.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div>
        {label('Proyecto', true)}
        <select required value={value.system_id} className={selectClassName}
          onChange={e => set({ system_id: e.target.value, subsystem_id: '' })}>
          <option value="">Selecciona un proyecto</option>
          {systems.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      {subs.length > 0 && (
        <div>
          {label('Subproyecto', !!system?.requires_subproject)}
          <select required={!!system?.requires_subproject} value={value.subsystem_id} className={selectClassName}
            onChange={e => set({ subsystem_id: e.target.value })}>
            <option value="">Selecciona un subproyecto</option>
            {subs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}
      {studioAreas.length > 0 && (
        <div>
          {label('Área', true)}
          <select required value={value.area_id} className={selectClassName}
            onChange={e => set({ area_id: e.target.value, subarea_id: '' })}>
            <option value="">Selecciona un área</option>
            {studioAreas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
      )}
      {subareas.length > 0 && (
        <div>
          {label('Subárea', true)}
          <select required value={value.subarea_id} className={selectClassName}
            onChange={e => set({ subarea_id: e.target.value })}>
            <option value="">Selecciona una subárea</option>
            {subareas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
      )}
    </div>
  )
}
