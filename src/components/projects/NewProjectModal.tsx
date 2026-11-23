import ControlLabel from '../ui/ControlLabel'
import ModalFocus from '../ui/ModalFocus'
import { useState, useRef } from 'react'
import { createRpcAttempt, type RpcAttempt } from '../../lib/rpc-attempt'
import type { InternalProjectInput } from '../../lib/operations'
import { useUsers } from '../../hooks/useUsers'
import AreaInput from '../ui/AreaInput'
import Icon from '../ui/Icon'
import { PRIORITY_LABEL } from '../../lib/constants'

/** Proyecto interno nuevo: siempre Development (inicia en Backlog) con responsable principal obligatorio. */
interface Props {
  onClose: () => void
  onCreate: (data: InternalProjectInput, attempt: RpcAttempt) => Promise<void>
}

const PRIORITY_OPTS = [
  { value: 'low',    label: PRIORITY_LABEL.low },
  { value: 'medium', label: PRIORITY_LABEL.medium },
  { value: 'high',   label: PRIORITY_LABEL.high },
  { value: 'urgent', label: PRIORITY_LABEL.urgent },
] as const

export default function NewProjectModal({ onClose, onCreate }: Props) {
  const { assignableUsers } = useUsers()
  const attempt = useRef(createRpcAttempt())
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [assignee, setAssignee] = useState('')
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium')
  const [startDate, setStartDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [area, setArea] = useState('')
  const [requesterName, setRequesterName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!title.trim() || !description.trim() || !assignee) return
    setSaving(true)
    setError(null)
    try {
      await onCreate({
        title,
        description,
        assigned_dev: assignee,
        priority,
        start_date: startDate || undefined,
        due_date: dueDate || undefined,
        area: area || undefined,
        requester_name: requesterName.trim() || undefined,
      }, attempt.current)
      onClose()
    } catch (err: any) {
      setError(err.message ?? 'Error al crear el proyecto')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div role="dialog" aria-modal="true" aria-label="Nuevo proyecto" className="modal-panel bg-surface rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        <ModalFocus onDismiss={onClose} />
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-lg font-medium text-gray-900"><ControlLabel icon="plus">Nuevo proyecto</ControlLabel></h2>
            <p className="text-xs text-gray-500">Board Development · inicia en Backlog</p>
          </div>
          <button aria-label="Cerrar" onClick={onClose} className="text-gray-600 hover:text-gray-900 hover:bg-gray-100"><Icon name="close" size={20} /></button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {/* Título */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Título <span className="text-red-700">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Nombre del proyecto..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>

          {/* Descripción */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Descripción <span className="text-red-700">*</span>
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Describe el alcance del proyecto..."
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
            />
          </div>

          {/* Tipo + Prioridad */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5" htmlFor="np-assignee">
                Responsable principal <span className="text-red-700">*</span>
              </label>
              <select
                id="np-assignee"
                value={assignee}
                onChange={e => setAssignee(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="">Selecciona…</option>
                {assignableUsers.map(u => <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Prioridad</label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value as any)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                {PRIORITY_OPTS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Fechas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Fecha de inicio</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Fecha objetivo <span className="text-gray-600 font-normal">(opcional)</span></label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
          </div>

          {/* Área + Solicitante */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Área</label>
              <AreaInput
                value={area}
                onChange={setArea}
                placeholder="Sin área"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                Solicitante <span className="text-gray-600 font-normal">(opcional)</span>
              </label>
              <input
                type="text"
                value={requesterName}
                onChange={e => setRequesterName(e.target.value)}
                placeholder="Nombre de quien solicita..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-gray-50 rounded-b-2xl">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-200 transition"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!title.trim() || !description.trim() || !assignee || saving}
            className="px-5 py-2 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {saving ? 'Creando…' : 'Crear proyecto'}
          </button>
        </div>
      </div>
    </div>
  )
}
