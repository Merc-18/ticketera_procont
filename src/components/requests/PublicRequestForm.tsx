import { useRef, useState } from 'react'
import { createRpcAttempt } from '../../lib/rpc-attempt'
import { errorMessage } from '../../lib/supabase-errors'
import type { SubmissionReceipt } from '../../lib/operations'
import { useCatalogs } from '../../hooks/useCatalogs'
import type { DeliveryItem, DeliveryResult } from '../../lib/attachments'
import type { RpcAttempt } from '../../lib/rpc-attempt'
import type { ClientProduct, ClientTicketInput } from '../../lib/client-portal'
import type { PreparationResult } from '../../lib/attachment-prep'
import AttachmentPicker from './AttachmentPicker'
import Icon from '../ui/Icon'
import { BRAND } from '../../theme/brand'

const EMPTY = { requester_name: '', system_id: '', request_type_id: '', title: '', description: '' }
const field = 'ui-input focus:ring-2 focus:ring-primary'

/** Sesión de cliente autenticado (portal Quipu/QuipuFac): sin estudio; producto desde la sesión. */
export interface ClientFormConfig {
  /** Productos permitidos devueltos por el backend para la sesión. */
  products: ClientProduct[]
  /** true: abierto desde una plataforma; el producto queda fijo y no hay selector. */
  fixedProduct: boolean
  /** Creación con el contrato del cliente autenticado (client_submit_request). */
  submit: (input: ClientTicketInput, attempt: RpcAttempt) => Promise<SubmissionReceipt>
  onViewMine: () => void
  /** Entrega de adjuntos con la sesión del cliente (client_reserve_attachments). */
  deliver: (requestId: string, trackingToken: string, items: DeliveryItem[]) => Promise<DeliveryResult>
}

/**
 * Formulario de solicitud (aprobado 18/11/2026) dentro del espacio del cliente autenticado.
 * El cliente no ve correo, estudio, subproyecto, área, RUC, códigos, responsables, prioridad,
 * SLA ni plazos: el estudio lo deriva el servidor y el producto se elige solo entre los
 * permitidos por la sesión (o queda fijo si se abrió desde una plataforma).
 * No existe un modo anónimo: toda creación usa el contrato del cliente autenticado.
 */
export default function PublicRequestForm({ client }: { client: ClientFormConfig }) {
  const catalogs = useCatalogs('public')
  const attempt = useRef(createRpcAttempt())
  const initial = client.products.length === 1 ? { ...EMPTY, system_id: client.products[0].id } : EMPTY
  const [form, setForm] = useState(initial)
  const [urgent, setUrgent] = useState(false)
  // Adjuntos ya preparados (comprimidos si hacía falta) ANTES de enviar; null = procesando.
  const [prepared, setPrepared] = useState<PreparationResult | null>({ items: [], totalBytes: 0, originalBytes: 0, ok: true, error: null })
  const [pickerKey, setPickerKey] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<SubmissionReceipt | null>(null)
  // Entrega de adjuntos (reserva con la sesión + subida). Se conserva para reintentar
  // con las mismas claves de subida mientras la autorización del ticket siga vigente.
  const [pendingDelivery, setPendingDelivery] = useState<DeliveryItem[]>([])
  const [deliveryError, setDeliveryError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)

  const set = (patch: Partial<typeof EMPTY>) => setForm(f => ({ ...f, ...patch }))
  const [nameTouched, setNameTouched] = useState(false)
  const nameInvalid = nameTouched && !form.requester_name.trim()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    // Nombre, título y descripción no pueden quedar vacíos ni contener solo espacios.
    if (!form.requester_name.trim()) { setNameTouched(true); setError('Ingresa el nombre del solicitante.'); return }
    if (!form.title.trim() || !form.description.trim()) { setError('Completa el título y la descripción.'); return }
    if (!client.products.some(p => p.id === form.system_id)) { setError('Selecciona el producto.'); return }
    if (!prepared) { setError('Espera a que terminen de prepararse los adjuntos.'); return }
    if (!prepared.ok) { setError(prepared.error); return }
    setLoading(true); setError(null)
    try {
      const result = await client.submit({ requester_name: form.requester_name, system_id: form.system_id,
        request_type_id: form.request_type_id, title: form.title, description: form.description, urgent_requested: urgent },
        attempt.current)
      // Los archivos ya están comprimidos; cada uno recibe una clave de subida estable.
      const items: DeliveryItem[] = prepared.items.map(i => ({ file: i.file, uploadKey: crypto.randomUUID() }))
      setReceipt(result)
      await deliver(result, items)
      setForm(initial); setUrgent(false); setPickerKey(k => k + 1); setNameTouched(false)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  async function deliver(target: SubmissionReceipt, items: DeliveryItem[]) {
    if (items.length === 0) { setPendingDelivery([]); setDeliveryError(null); return }
    const outcome = await client.deliver(target.id, target.tracking_token, items)
    const remaining = items.filter(i => outcome.failed.includes(i.file.name))
    setPendingDelivery(remaining)
    setDeliveryError(outcome.error)
  }
  const retryDelivery = async () => {
    if (!receipt) return
    setRetrying(true)
    try { await deliver(receipt, pendingDelivery) } finally { setRetrying(false) }
  }

  /* ── Confirmación: número REQ ── */
  if (receipt) {
    return (
      <div className="flex justify-center">
        <div className="ticket-receipt">
          <div className="mx-auto mb-6 icon-tile text-green-700"><Icon name="check" size={28} /></div>
          <h2 className="text-2xl font-bold text-brand-700 mb-2">¡Solicitud enviada!</h2>
          <p className="text-gray-600 mb-6">Tu solicitud fue registrada y será revisada por el {BRAND.teamLabel}.</p>
          <div className="bg-brand-50 border-2 border-brand-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-gray-600 mb-2">Número de seguimiento:</p>
            <p className="text-3xl font-mono text-primary">{receipt.request_number}</p>
          </div>
          {pendingDelivery.length > 0 && (
            <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-left space-y-2">
              <p>La solicitud quedó registrada, pero no se pudieron adjuntar: <strong>{pendingDelivery.map(i => i.file.name).join(', ')}</strong>.</p>
              {deliveryError && <p className="text-xs">{deliveryError}</p>}
              <p className="text-xs">Puedes reintentar durante los 30 minutos siguientes al envío.</p>
              <button type="button" onClick={() => void retryDelivery()} disabled={retrying}
                className="px-3 py-1.5 bg-accent-400 hover:bg-accent-300 text-gray-900 rounded-lg text-xs font-bold disabled:opacity-50">
                {retrying ? 'Reintentando…' : 'Reintentar adjuntos'}
              </button>
            </div>
          )}
          <p className="text-sm text-gray-500 mb-6">Puedes seguir su avance en «Mis tickets».</p>
          <div className="space-y-3">
            <button onClick={() => { attempt.current = createRpcAttempt(); setReceipt(null); setPendingDelivery([]); setDeliveryError(null) }}
              className="w-full bg-primary text-white py-3 rounded-lg font-semibold hover:bg-brand-700 transition">
              Crear otro ticket
            </button>
            <button onClick={client.onViewMine}
              className="w-full bg-gray-100 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-200 transition">
              Ver Mis tickets
            </button>
          </div>
        </div>
      </div>
    )
  }

  const label = (id: string, text: string, required = true) => (
    <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-2">
      {text} {required && <span className="text-red-500">*</span>}
    </label>
  )
  const section = 'font-medium text-brand-700'

  return (
    <div className="max-w-4xl mx-auto">
      <div className="ticket-form">
        <header>
          <h1 className="text-2xl font-bold text-brand-700 mb-1">Nuevo ticket</h1>
          <p className="text-gray-600 text-sm">Completa el formulario para enviar tu solicitud al {BRAND.teamLabel}.</p>
        </header>

        {catalogs.loading ? (
          <p className="text-center text-gray-400 py-8">Cargando formulario...</p>
        ) : !catalogs.available ? (
          <p role="alert" className="text-center text-red-700 py-8">El formulario no está disponible en este momento. Intenta más tarde.</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-8">
            <section className="space-y-4">
              <h2 className={section}>Datos del solicitante</h2>
              <div>
                {label('ticket-requester', 'Nombre del solicitante')}
                <input id="ticket-requester" required maxLength={200} value={form.requester_name} placeholder="Nombre y apellido"
                  pattern=".*\S.*" title="Ingresa el nombre del solicitante" aria-invalid={nameInvalid}
                  onBlur={() => setNameTouched(true)}
                  onChange={e => set({ requester_name: e.target.value })}
                  className={`${field} ${nameInvalid ? 'border-red-400 focus:ring-red-400' : ''}`} />
                {nameInvalid && <p className="text-xs text-red-600 mt-1">El nombre es obligatorio.</p>}
              </div>
            </section>

            <section className="space-y-4">
              <h2 className={section}>¿Para qué producto es la solicitud?</h2>
              {client.fixedProduct ? (
                <div>
                  {label('ticket-product', 'Producto')}
                  <p id="ticket-product" className={`${field} bg-gray-50 text-gray-800 flex items-center gap-2`} aria-readonly="true">
                    <Icon name="lock" size={18} />{client.products[0]?.name}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">Ingresaste desde esta plataforma: el ticket se registra para este producto.</p>
                </div>
              ) : (
                <div>
                  {label('ticket-product', 'Producto')}
                  <select id="ticket-product" required value={form.system_id} onChange={e => set({ system_id: e.target.value })} className={field}>
                    <option value="">Selecciona un producto</option>
                    {client.products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              )}
            </section>

            <section className="space-y-4">
              <h2 className={section}>¿Qué necesitas?</h2>
              <div>
                {label('ticket-type', 'Tipo de solicitud')}
                <select id="ticket-type" required value={form.request_type_id} onChange={e => set({ request_type_id: e.target.value })} className={field}>
                  <option value="">Selecciona el tipo principal</option>
                  {catalogs.requestTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                {label('ticket-title', 'Título del requerimiento')}
                <input id="ticket-title" required maxLength={300} value={form.title} placeholder="Resumen breve"
                  onChange={e => set({ title: e.target.value })} className={field} />
              </div>
              <div>
                {label('ticket-description', 'Descripción detallada')}
                <textarea id="ticket-description" required rows={6} maxLength={20000} value={form.description}
                  placeholder="Describe qué ocurre o qué necesitas, pasos para reproducirlo y el resultado esperado"
                  onChange={e => set({ description: e.target.value })} className={`${field} resize-y`} />
              </div>
              <div>
                <p className="block text-sm font-medium text-gray-700 mb-2">Adjuntar capturas o documentos</p>
                <AttachmentPicker onChange={setPrepared} resetKey={pickerKey} />
              </div>
              <label className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50">
                <input type="checkbox" checked={urgent} onChange={e => setUrgent(e.target.checked)} className="h-4 w-4 accent-red-600" />
                <span className="text-sm font-medium text-gray-800">Solicito atención urgente</span>
              </label>
            </section>

            {error && <p role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</p>}

            <button type="submit" disabled={loading || !prepared || !prepared.ok}
              className="ui-button ui-button-primary w-full">
              {loading ? 'Enviando...' : 'Enviar solicitud'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
