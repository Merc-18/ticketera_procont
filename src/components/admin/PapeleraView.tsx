import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { board } from '../../lib/api'
import { actionKey } from '../../lib/board'
import { errorMessage } from '../../lib/supabase-errors'
import Icon from '../ui/Icon'
import { PRIORITY_LABEL } from '../../lib/constants'

interface DeletedProject {
  id: string
  title: string
  priority: 'low' | 'medium' | 'high' | 'urgent'
  project_type: 'development' | 'administrative' | 'dual'
  updated_at: string
  project_number?: string
  requests?: { request_number: string } | null
}

const TYPE_LABEL: Record<string, string> = {
  development: 'Development', administrative: 'Administrative', dual: 'Dual',
}

export default function PapeleraView() {
  const [error, setError] = useState<string | null>(null)
  const [projects, setProjects] = useState<DeletedProject[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null)
  const [restoring, setRestoring] = useState(false)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await supabase.from('projects')
        .select('id, title, priority, project_type, updated_at, project_number, requests(request_number)')
        .eq('status', 'deleted').order('updated_at', { ascending: false })
      if (result.error) throw result.error
      setProjects((result.data as unknown as DeletedProject[]) || [])
    } catch (err) { setError(errorMessage(err)) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const restore = async (id: string) => {
    setRestoring(true)
    try {
      // Restauración auditada por el servidor (requiere admin/superadmin). Una fase final sigue terminada.
      await board.restore(id, actionKey())
      setConfirmRestore(null)
      await load()
    } catch (err) { setError(errorMessage(err)) } finally {
      setRestoring(false)
    }
  }

  if (error) return <div role="alert" className="text-red-700 p-4">{error} <button className="underline" onClick={load}>Actualizar</button></div>

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium text-gray-900 inline-flex items-center gap-2"><Icon name="trash" size={20} />Papelera</h2>
          <p className="text-sm text-gray-500 mt-0.5">Proyectos eliminados antes del historial inmutable. Pueden restaurarse; no se borran definitivamente.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-sm font-medium">
            {projects.length} proyecto{projects.length !== 1 ? 's' : ''}
          </span>
          <button
            onClick={load}
            className="px-3 py-1 bg-white border border-gray-200 text-gray-500 rounded-lg text-sm hover:bg-gray-50 transition"
          >
            <Icon name="refresh" size={14} className="inline-block mr-1 -mt-0.5" />Actualizar
          </button>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-xl border border-dashed border-gray-200">
          <Icon name="trash" size={36} className="mx-auto mb-3 text-gray-500" />
          <p className="text-gray-500 font-medium">La papelera está vacía</p>
        </div>
      ) : (
        <div className="space-y-2">
          {projects.map(p => {
            const code = p.requests?.request_number ?? p.project_number
            return (
              <div key={p.id} className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="flex flex-col gap-1">
                    {code && (
                      <span className="font-mono text-xs text-gray-400">{code}</span>
                    )}
                    <p className="font-medium text-gray-900 truncate">{p.title}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">{TYPE_LABEL[p.project_type]}</span>
                      <span className="text-xs text-gray-400">·</span>
                      <span className="text-xs text-gray-600">Prioridad {PRIORITY_LABEL[p.priority] ?? p.priority}</span>
                      <span className="text-xs text-gray-400">·</span>
                      <span className="text-xs text-gray-400">
                        Eliminado {new Date(p.updated_at).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => setConfirmRestore(p.id)}
                    className="px-3 py-1.5 bg-brand-50 text-brand-700 border border-brand-200 rounded-lg text-xs font-medium hover:bg-brand-100 transition"
                  >
                    <Icon name="refresh" size={14} className="inline-block mr-1 -mt-0.5" />Restaurar
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Confirm restore */}
      {confirmRestore && (
        <div className="modal-backdrop fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="modal-panel bg-white rounded-lg max-w-sm w-full p-6 shadow-2xl">
            <h3 className="text-lg font-medium text-gray-900 mb-2 inline-flex items-center gap-2"><Icon name="refresh" size={20} />Restaurar proyecto</h3>
            <p className="text-sm text-gray-600 mb-6">
              El ticket volverá a los boards (activo, o terminado si ya estaba en su fase final). Queda registrado en el historial.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmRestore(null)}
                disabled={restoring}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={() => restore(confirmRestore)}
                disabled={restoring}
                className="flex-1 px-4 py-2 bg-brand-600 text-white rounded-lg font-medium hover:bg-brand-700 transition text-sm disabled:opacity-50"
              >
                {restoring ? 'Restaurando...' : 'Sí, restaurar'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
