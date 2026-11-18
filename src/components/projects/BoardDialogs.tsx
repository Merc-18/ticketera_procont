import { useEffect, useState } from 'react'
import { PHASE_LABELS } from '../../lib/constants'
import { reopenTargets, type BoardFlow, type PendingItem } from '../../lib/board'

const shell = 'fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[70]'
const card = 'bg-white rounded-xl max-w-lg w-full shadow-2xl max-h-[90vh] overflow-y-auto'

/**
 * Confirmación explícita para pasar a Done con tareas pendientes del checklist. Muestra la lista
 * exacta devuelta por el servidor; la confirmación se envía con su huella (pending_fingerprint)
 * y queda auditada. Nunca se confirma automáticamente.
 */
export function DoneConfirmDialog({ title, pending, busy, onConfirm, onCancel }: {
  title: string; pending: PendingItem[]; busy: boolean; onConfirm: () => void; onCancel: () => void
}) {
  const [ack, setAck] = useState(false)
  return (
    <div className={shell} role="dialog" aria-modal="true" aria-labelledby="done-confirm-title">
      <div className={card}>
        <div className="px-5 py-4 border-b bg-amber-50">
          <h3 id="done-confirm-title" className="font-bold text-amber-900">⚠️ Tareas pendientes antes de Done</h3>
          <p className="text-sm text-amber-800 mt-1">«{title}» tiene {pending.length} tarea{pending.length !== 1 ? 's' : ''} sin completar.</p>
        </div>
        <ul className="px-5 py-3 space-y-1.5 max-h-60 overflow-y-auto">
          {pending.map(item => (
            <li key={item.id} className="text-sm text-gray-800 flex gap-2">
              <span className="text-gray-400 shrink-0">☐</span>
              <span className="break-words"><span className="text-xs text-gray-500">{PHASE_LABELS[item.phase] ?? item.phase} · </span>{item.description}</span>
            </li>
          ))}
        </ul>
        <div className="px-5 py-4 border-t space-y-3">
          <label className="flex items-start gap-2 text-sm text-gray-800">
            <input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} className="mt-0.5 w-4 h-4" />
            Confirmo pasar a Done con estas tareas pendientes. La confirmación queda registrada en el historial.
          </label>
          <div className="flex gap-2 justify-end">
            <button onClick={onCancel} disabled={busy} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200">Cancelar</button>
            <button onClick={onConfirm} disabled={!ack || busy}
              className="px-4 py-2 bg-emerald-700 text-white rounded-lg text-sm font-semibold hover:bg-emerald-800 disabled:opacity-50">
              {busy ? 'Guardando…' : 'Confirmar y pasar a Done'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Bloqueo: motivo obligatorio (máx. 5000 caracteres, validado también en el servidor). */
export function BlockDialog({ initial, busy, onConfirm, onCancel }: {
  initial?: string | null; busy: boolean; onConfirm: (reason: string) => void; onCancel: () => void
}) {
  const [reason, setReason] = useState(initial ?? '')
  const valid = reason.trim().length > 0 && reason.length <= 5000
  return (
    <div className={shell} role="dialog" aria-modal="true" aria-labelledby="block-title">
      <div className={card}>
        <div className="px-5 py-4 border-b bg-red-50">
          <h3 id="block-title" className="font-bold text-red-900">🚫 {initial ? 'Corregir motivo del bloqueo' : 'Bloquear ticket'}</h3>
          <p className="text-sm text-red-800 mt-1">El ticket conserva su fase y responsable. Mientras esté bloqueado no puede cambiar de fase ni terminarse; sí admite comentarios, checklist y evidencias.</p>
        </div>
        <div className="px-5 py-4 space-y-3">
          <label className="block text-xs font-semibold text-gray-600" htmlFor="block-reason">Motivo <span className="text-red-500">*</span></label>
          <textarea id="block-reason" rows={3} value={reason} onChange={e => setReason(e.target.value)} autoFocus maxLength={5000}
            placeholder="Describe qué impide continuar…"
            className="w-full px-3 py-2 border border-red-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-red-400 resize-none" />
          <div className="flex gap-2 justify-end">
            <button onClick={onCancel} disabled={busy} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200">Cancelar</button>
            <button onClick={() => onConfirm(reason.trim())} disabled={!valid || busy}
              className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
              {busy ? 'Guardando…' : 'Confirmar bloqueo'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Reapertura: motivo obligatorio y fase de retorno entre las admitidas por el servidor. */
export function ReopenDialog({ flows, busy, onConfirm, onCancel }: {
  flows: BoardFlow[]; busy: boolean; onConfirm: (flowId: string, phase: string, reason: string) => void; onCancel: () => void
}) {
  const [flowId, setFlowId] = useState(flows[0]?.id ?? '')
  const flow = flows.find(f => f.id === flowId) ?? flows[0]
  const targets = flow ? reopenTargets(flow.flow_type) : []
  const [target, setTarget] = useState('')
  const [reason, setReason] = useState('')
  useEffect(() => { setTarget('') }, [flowId])
  const valid = !!flow && targets.includes(target) && reason.trim().length > 0 && reason.length <= 5000
  return (
    <div className={shell} role="dialog" aria-modal="true" aria-labelledby="reopen-title">
      <div className={card}>
        <div className="px-5 py-4 border-b bg-orange-50">
          <h3 id="reopen-title" className="font-bold text-orange-900">↩️ Reabrir ticket</h3>
          <p className="text-sm text-orange-800 mt-1">El ticket vuelve a trabajo activo. El cierre anterior se conserva en el historial.</p>
        </div>
        <div className="px-5 py-4 space-y-3">
          {flows.length > 1 && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1" htmlFor="reopen-flow">Flujo</label>
              <select id="reopen-flow" value={flowId} onChange={e => setFlowId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
                {flows.map(f => <option key={f.id} value={f.id}>{f.flow_type === 'development' ? 'Development' : 'Administrative (histórico)'}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1" htmlFor="reopen-phase">Fase de retorno <span className="text-red-500">*</span></label>
            <select id="reopen-phase" value={target} onChange={e => setTarget(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
              <option value="" disabled>Selecciona la fase…</option>
              {targets.map(p => <option key={p} value={p}>{PHASE_LABELS[p] ?? p}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1" htmlFor="reopen-reason">Motivo <span className="text-red-500">*</span></label>
            <textarea id="reopen-reason" rows={3} value={reason} onChange={e => setReason(e.target.value)} maxLength={5000}
              placeholder="¿Por qué se reabre?" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-400 resize-none" />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={onCancel} disabled={busy} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200">Cancelar</button>
            <button onClick={() => flow && onConfirm(flow.id, target, reason.trim())} disabled={!valid || busy}
              className="px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-semibold hover:bg-orange-700 disabled:opacity-50">
              {busy ? 'Guardando…' : 'Reabrir ticket'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
