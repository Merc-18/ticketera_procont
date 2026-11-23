import { useState } from 'react'
import { useAreas, type Area } from '../../hooks/useAreas'
import { errorMessage } from '../../lib/supabase-errors'
import { toast } from '../../lib/toast'
import Icon from '../ui/Icon'

/** Administración del catálogo de áreas (solo superadmin; RLS lo exige en Supabase). */
export default function AreasPanel() {
  const { areas, loading, available, error, reload, createArea, updateArea } = useAreas({ onlyActive: false })
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [busy, setBusy] = useState(false)

  const run = async (action: () => Promise<void>, done: string) => {
    setBusy(true)
    try { await action(); toast.success(done) }
    catch (err) { toast.error(errorMessage(err)) }
    finally { setBusy(false) }
  }

  const submitNew = (e: React.FormEvent) => {
    e.preventDefault()
    void run(async () => { await createArea(newName); setNewName('') }, 'Área creada.')
  }
  const saveEdit = (area: Area) => {
    void run(async () => { await updateArea(area.id, { name: editName }); setEditingId(null) }, 'Área actualizada.')
  }
  const toggle = (area: Area) => {
    void run(() => updateArea(area.id, { is_active: !area.is_active }),
      area.is_active ? 'Área desactivada.' : 'Área reactivada.')
  }

  if (loading) return <p className="text-sm text-gray-500 py-8 text-center">Cargando áreas...</p>
  if (!available) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5 text-sm text-yellow-800">
        El catálogo de áreas aún no está disponible en Supabase (migración <code>20261118000200_areas</code> pendiente).
        Mientras tanto, los formularios aceptan el área como texto libre.
        {error && <button onClick={() => void reload()} className="ml-2 underline">Reintentar</button>}
      </div>
    )
  }

  const active = areas.filter(a => a.is_active).length
  return (
    <div className="space-y-5 max-w-3xl">
      <form onSubmit={submitNew} className="bg-surface rounded-xl border shadow-sm p-4 flex flex-col sm:flex-row gap-3">
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          maxLength={200}
          required
          placeholder="Nombre de la nueva área"
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <button type="submit" disabled={busy || !newName.trim()}
          className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-brand-700 transition disabled:opacity-50">
          <Icon name="plus" size={16} className="inline-block mr-1 -mt-0.5" />Agregar área
        </button>
      </form>

      <div className="bg-surface rounded-xl border shadow-sm overflow-hidden">
        {areas.length === 0 ? (
          <div className="py-12 text-center text-gray-400">
            <Icon name="tag" size={32} className="mx-auto mb-2 text-gray-500" />
            <p className="font-medium">Aún no hay áreas registradas</p>
            <p className="text-xs mt-1">Los formularios usan texto libre hasta que exista al menos un área activa.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b text-xs font-semibold text-gray-500">
                <th className="text-left px-4 py-3">Área</th>
                <th className="text-left px-4 py-3">Estado</th>
                <th className="text-right px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {areas.map(area => (
                <tr key={area.id} className={area.is_active ? '' : 'opacity-60'}>
                  <td className="px-4 py-3 text-sm">
                    {editingId === area.id ? (
                      <input value={editName} onChange={e => setEditName(e.target.value)} maxLength={200} autoFocus
                        className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                    ) : <span className="font-medium text-gray-900">{area.name}</span>}
                  </td>
                  <td className="px-4 py-3 text-xs font-medium">
                    {area.is_active
                      ? <span className="text-green-700">● Activa</span>
                      : <span className="text-gray-500">● Inactiva</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {editingId === area.id ? (
                        <>
                          <button disabled={busy || !editName.trim()} onClick={() => saveEdit(area)}
                            className="px-3 py-1 bg-primary text-white rounded-lg text-xs font-medium hover:bg-brand-700 disabled:opacity-50">Guardar</button>
                          <button onClick={() => setEditingId(null)}
                            className="px-3 py-1 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-200">Cancelar</button>
                        </>
                      ) : (
                        <>
                          <button disabled={busy} onClick={() => { setEditingId(area.id); setEditName(area.name) }}
                            className="px-3 py-1 bg-brand-50 text-brand-700 rounded-lg text-xs font-medium hover:bg-brand-100"><Icon name="edit" size={14} className="inline-block mr-1 -mt-0.5" />Editar</button>
                          <button disabled={busy} onClick={() => toggle(area)}
                            className={`px-3 py-1 rounded-lg text-xs font-medium ${area.is_active
                              ? 'bg-yellow-50 text-yellow-800 hover:bg-yellow-100'
                              : 'bg-green-50 text-green-700 hover:bg-green-100'}`}>
                            {area.is_active ? 'Desactivar' : 'Activar'}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-xs text-gray-400">
        {active} activa{active !== 1 ? 's' : ''} de {areas.length}. Desactivar oculta el área en formularios y filtros
        sin modificar solicitudes existentes. Renombrar no cambia el texto guardado en solicitudes anteriores.
      </p>
    </div>
  )
}
