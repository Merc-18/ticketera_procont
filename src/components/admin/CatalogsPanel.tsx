import { useState } from 'react'
import { useCatalogs, saveCatalogRow } from '../../hooks/useCatalogs'
import { errorMessage } from '../../lib/supabase-errors'
import { toast } from '../../lib/toast'
import AreasPanel from './AreasPanel'
import Icon from '../ui/Icon'

type Table = Parameters<typeof saveCatalogRow>[0]
type Section = 'studios' | 'systems' | 'areas' | 'types'
const input = 'px-2 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary'
const btn = 'px-2.5 py-1 rounded-lg text-xs font-medium transition disabled:opacity-50'

/** Fila editable genérica: nombre (y código opcional), activar/desactivar. Sin borrado. */
function Row({ table, id, name, code, active, codeLabel, onSaved, indent = false, extra }: {
  table: Table; id: string; name: string; code?: string | null; active: boolean; codeLabel?: string
  onSaved: () => Promise<void>; indent?: boolean; extra?: React.ReactNode
}) {
  const [editing, setEditing] = useState(false)
  const [n, setN] = useState(name)
  const [c, setC] = useState(code ?? '')
  const [busy, setBusy] = useState(false)
  const save = async (values: Record<string, unknown>, msg: string) => {
    setBusy(true)
    try { await saveCatalogRow(table, values, id); await onSaved(); setEditing(false); toast.success(msg) }
    catch (err) { toast.error(errorMessage(err)) } finally { setBusy(false) }
  }
  const values = () => table === 'studio_codes' ? { code: c.trim().toUpperCase() }
    : { name: n.trim(), ...(codeLabel ? { code: c.trim().toUpperCase() || null } : {}) }
  return (
    <div className={`flex flex-wrap items-center gap-2 py-2 ${indent ? 'pl-6' : ''} ${active ? '' : 'opacity-60'}`}>
      {editing ? (
        <>
          {table !== 'studio_codes' && <input className={`${input} flex-1 min-w-[10rem]`} value={n} maxLength={300} onChange={e => setN(e.target.value)} />}
          {(codeLabel || table === 'studio_codes') && <input className={`${input} w-32 font-mono`} placeholder={codeLabel ?? 'Código'} value={c} maxLength={50} onChange={e => setC(e.target.value)} />}
          <button disabled={busy} onClick={() => void save(values(), 'Guardado.')} className={`${btn} bg-primary text-white hover:bg-brand-700`}>Guardar</button>
          <button onClick={() => { setEditing(false); setN(name); setC(code ?? '') }} className={`${btn} bg-gray-100 text-gray-700`}>Cancelar</button>
        </>
      ) : (
        <>
          <span className="flex-1 min-w-[10rem] text-sm text-gray-900">
            {table === 'studio_codes' ? <span className="font-mono">{code}</span> : name}
            {codeLabel && code && <span className="ml-2 font-mono text-xs text-gray-500">{code}</span>}
            {!active && <span className="ml-2 text-xs text-gray-500">(inactivo)</span>}
          </span>
          {extra}
          <button disabled={busy} onClick={() => setEditing(true)} className={`${btn} bg-brand-50 text-brand-700 hover:bg-brand-100`}><Icon name="edit" size={14} className="inline-block mr-1 -mt-0.5" />Editar</button>
          <button disabled={busy} onClick={() => void save({ is_active: !active }, active ? 'Desactivado.' : 'Activado.')}
            className={`${btn} ${active ? 'bg-yellow-50 text-yellow-800 hover:bg-yellow-100' : 'bg-green-50 text-green-700 hover:bg-green-100'}`}>
            {active ? 'Desactivar' : 'Activar'}
          </button>
        </>
      )}
    </div>
  )
}

/** Formulario breve para agregar un registro. */
function AddForm({ placeholder, codePlaceholder, onAdd, small = false }: {
  placeholder: string; codePlaceholder?: string; onAdd: (name: string, code: string) => Promise<void>; small?: boolean
}) {
  const [n, setN] = useState(''); const [c, setC] = useState(''); const [busy, setBusy] = useState(false)
  return (
    <form className={`flex flex-wrap gap-2 ${small ? 'pl-6 py-1' : ''}`} onSubmit={e => {
      e.preventDefault(); setBusy(true)
      onAdd(n.trim(), c.trim().toUpperCase()).then(() => { setN(''); setC(''); toast.success('Agregado.') })
        .catch(err => toast.error(errorMessage(err))).finally(() => setBusy(false))
    }}>
      <input required className={`${input} flex-1 min-w-[10rem]`} placeholder={placeholder} value={n} maxLength={300} onChange={e => setN(e.target.value)} />
      {codePlaceholder && <input className={`${input} w-32 font-mono`} placeholder={codePlaceholder} value={c} maxLength={20} onChange={e => setC(e.target.value)} />}
      <button disabled={busy || !n.trim()} className={`${btn} bg-primary text-white hover:bg-brand-700`}><Icon name="plus" size={14} className="inline-block mr-1 -mt-0.5" />Agregar</button>
    </form>
  )
}

export default function CatalogsPanel() {
  const cat = useCatalogs('admin')
  const [section, setSection] = useState<Section>('studios')
  const [areaStudio, setAreaStudio] = useState('')
  const reload = cat.reload

  if (cat.loading) return <p className="text-sm text-gray-500 py-8 text-center">Cargando catálogos...</p>
  if (!cat.available) {
    return (
      <div className="space-y-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-800">
          Los catálogos de estudios y proyectos requieren la migración <code>20261118000300_ticket_catalogs</code> y <code>20261118000400_request_intake</code>, pendientes de aplicar.
        </div>
        <AreasPanel />
      </div>
    )
  }

  const card = 'bg-surface rounded-xl border shadow-sm p-4 divide-y divide-gray-100'
  const studioForAreas = areaStudio || cat.studios.find(s => cat.areas.some(a => a.studio_id === s.id))?.id || ''
  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {([['studios', 'Estudios'], ['systems', 'Proyectos'], ['areas', 'Áreas'], ['types', 'Tipos de solicitud']] as [Section, string][]).map(([k, l]) => (
          <button key={k} onClick={() => setSection(k)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition ${section === k ? 'bg-surface text-primary shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>{l}</button>
        ))}
      </div>

      {section === 'studios' && (
        <>
          <AddForm placeholder="Nombre del nuevo estudio" onAdd={async name => { await saveCatalogRow('studios', { name }); await reload() }} />
          {cat.studios.map(s => (
            <div key={s.id} className={card}>
              <Row table="studios" id={s.id} name={s.name} active={s.is_active} onSaved={reload}
                extra={<span className="text-xs text-gray-500 font-mono">{s.ruc ? `RUC ${s.ruc}` : 'Sin RUC'}</span>} />
              {s.review_note && <p className="text-xs text-yellow-800 bg-yellow-50 rounded px-2 py-1 my-1"><Icon name="alert" size={12} className="inline-block mr-1 -mt-0.5" />{s.review_note}</p>}
              {cat.codes.filter(c => c.studio_id === s.id).map(c => (
                <Row key={c.id} table="studio_codes" id={c.id} name={c.code} code={c.code} active={c.is_active} onSaved={reload} indent />
              ))}
              <AddForm small placeholder="Nuevo código interno (p. ej. ABC_01)" onAdd={async code => {
                await saveCatalogRow('studio_codes', { studio_id: s.id, code: code.toUpperCase() }); await reload()
              }} />
            </div>
          ))}
        </>
      )}

      {section === 'systems' && (
        <>
          <AddForm placeholder="Nombre del nuevo proyecto" onAdd={async name => {
            await saveCatalogRow('catalog_systems', { name, sort_order: cat.systems.length + 1 }); await reload()
          }} />
          {cat.systems.map(sys => (
            <div key={sys.id} className={card}>
              <Row table="catalog_systems" id={sys.id} name={sys.name} active={sys.is_active} onSaved={reload}
                extra={
                  <label className="text-xs text-gray-600 flex items-center gap-1">
                    <input type="checkbox" checked={sys.requires_subproject} className="accent-primary" onChange={e => {
                      saveCatalogRow('catalog_systems', { requires_subproject: e.target.checked }, sys.id).then(reload)
                        .catch(err => toast.error(errorMessage(err)))
                    }} /> Subproyecto obligatorio
                  </label>
                } />
              {cat.subsystems.filter(x => x.system_id === sys.id).map(x => (
                <Row key={x.id} table="catalog_subsystems" id={x.id} name={x.name} active={x.is_active} onSaved={reload} indent />
              ))}
              <AddForm small placeholder="Nuevo subproyecto" onAdd={async name => {
                await saveCatalogRow('catalog_subsystems', { system_id: sys.id, name }); await reload()
              }} />
            </div>
          ))}
        </>
      )}

      {section === 'types' && (
        <>
          <AddForm placeholder="Nuevo tipo de solicitud" onAdd={async name => {
            await saveCatalogRow('request_types', { name, sort_order: cat.requestTypes.length + 1 }); await reload()
          }} />
          <div className={card}>
            {cat.requestTypes.map(t => (
              <Row key={t.id} table="request_types" id={t.id} name={t.name} active={t.is_active} onSaved={reload} />
            ))}
          </div>
          <p className="text-xs text-gray-400">El cliente elige un único tipo principal. Desactivar un tipo lo oculta del formulario sin alterar solicitudes anteriores.</p>
        </>
      )}

      {section === 'areas' && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-gray-600">Estudio:</span>
            <select value={studioForAreas} onChange={e => setAreaStudio(e.target.value)} className={`${input} bg-surface`}>
              {cat.studios.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <AddForm placeholder="Nueva área principal" codePlaceholder="Código (p. ej. X000)" onAdd={async (name, code) => {
            await saveCatalogRow('areas', { name, code: code || null, studio_id: studioForAreas }); await reload()
          }} />
          {cat.areas.filter(a => a.studio_id === studioForAreas && !a.parent_id).map(a => (
            <div key={a.id} className={card}>
              <Row table="areas" id={a.id} name={a.name} code={a.code} codeLabel="Código" active={a.is_active} onSaved={reload} />
              {cat.areas.filter(x => x.parent_id === a.id).map(x => (
                <Row key={x.id} table="areas" id={x.id} name={x.name} code={x.code} codeLabel="Código" active={x.is_active} onSaved={reload} indent />
              ))}
              <AddForm small placeholder="Nueva subárea" codePlaceholder="Código" onAdd={async (name, code) => {
                await saveCatalogRow('areas', { name, code: code || null, studio_id: a.studio_id, parent_id: a.id }); await reload()
              }} />
            </div>
          ))}
          {!cat.areas.some(a => a.studio_id === studioForAreas) && (
            <p className="text-sm text-gray-400">Este estudio no tiene áreas: el formulario no mostrará selector de área.</p>
          )}
        </>
      )}
    </div>
  )
}
