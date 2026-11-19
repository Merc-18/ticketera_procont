import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { operations } from '../../lib/api'
import { createRpcAttempt } from '../../lib/rpc-attempt'
import { errorMessage } from '../../lib/supabase-errors'
import { handoffTracking } from '../../lib/tracking-handoff'
import type { SubmissionReceipt } from '../../lib/operations'
import { useCatalogs } from '../../hooks/useCatalogs'
import { uploadRequestAttachments, type DeliveryItem, type DeliveryResult } from '../../lib/attachments'
import type { RpcAttempt } from '../../lib/rpc-attempt'
import type { ClientProduct, ClientTicketInput } from '../../lib/client-portal'
import type { PreparationResult } from '../../lib/attachment-prep'
import AttachmentPicker from './AttachmentPicker'
import BrandLogo from '../ui/BrandLogo'
import { BRAND } from '../../theme/brand'

const EMPTY = { requester_name: '', studio_id: '', system_id: '', request_type_id: '', title: '', description: '' }
const field = 'w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary outline-none bg-white'

/** Modo cliente autenticado (portal Quipu/QuipuFac): sin estudio; producto desde la sesión. */
export interface ClientFormConfig {
  /** Productos permitidos devueltos por el backend para la sesión. */
  products: ClientProduct[]
  /** true: abierto desde una plataforma; el producto queda fijo y no hay selector. */
  fixedProduct: boolean
  submit: (input: ClientTicketInput, attempt: RpcAttempt) => Promise<SubmissionReceipt>
  onViewMine: () => void
  /** Entrega de adjuntos; por defecto la misma del formulario público (token del ticket). */
  deliver?: (requestId: string, trackingToken: string, items: DeliveryItem[]) => Promise<DeliveryResult>
}

/**
 * Formulario público definitivo (aprobado 18/11/2026). El cliente no ve correo, subproyecto,
 * área, RUC, códigos, responsables, prioridad, SLA ni plazos.
 * Con `client` se reutiliza dentro del espacio del cliente: el estudio lo deriva el servidor y el
 * producto se elige solo entre los permitidos (o queda fijo si viene de una plataforma).
 */
export default function PublicRequestForm({ client }: { client?: ClientFormConfig } = {}) {
  const navigate = useNavigate()
  const catalogs = useCatalogs('public')
  const attempt = useRef(createRpcAttempt())
  const initial = client && client.products.length === 1 ? { ...EMPTY, system_id: client.products[0].id } : EMPTY
  const [form, setForm] = useState(initial)
  const [urgent, setUrgent] = useState(false)
  // Adjuntos ya preparados (comprimidos si hacía falta) ANTES de enviar; null = procesando.
  const [prepared, setPrepared] = useState<PreparationResult | null>({ items: [], totalBytes: 0, originalBytes: 0, ok: true, error: null })
  const [pickerKey, setPickerKey] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<SubmissionReceipt | null>(null)
  // Entrega de adjuntos (reserva con token privado + subida). Se conserva para reintentar
  // con las mismas claves de subida mientras la autorización del ticket siga vigente.
  const [pendingDelivery, setPendingDelivery] = useState<DeliveryItem[]>([])
  const [deliveryError, setDeliveryError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)

  const set = (patch: Partial<typeof EMPTY>) => setForm(f => ({ ...f, ...patch }))
  const [nameTouched, setNameTouched] = useState(false)
  const nameInvalid = nameTouched && !form.requester_name.trim()
  // Nombres de estudio únicos (sin RUC ni códigos internos).
  const studios = Array.from(new Map(catalogs.studios.map(s => [s.name.toLowerCase(), s])).values())

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    // Nombre, título y descripción no pueden quedar vacíos ni contener solo espacios.
    if (!form.requester_name.trim()) { setNameTouched(true); setError('Ingresa el nombre del solicitante.'); return }
    if (!form.title.trim() || !form.description.trim()) { setError('Completa el título y la descripción.'); return }
    if (client && !client.products.some(p => p.id === form.system_id)) { setError('Selecciona el producto.'); return }
    if (!prepared) { setError('Espera a que terminen de prepararse los adjuntos.'); return }
    if (!prepared.ok) { setError(prepared.error); return }
    setLoading(true); setError(null)
    try {
      const result = client
        ? await client.submit({ requester_name: form.requester_name, system_id: form.system_id, request_type_id: form.request_type_id,
            title: form.title, description: form.description, urgent_requested: urgent }, attempt.current)
        : await operations.submitClientRequest({ ...form, urgent_requested: urgent }, attempt.current)
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
    const outcome = await (client?.deliver ?? uploadRequestAttachments)(target.id, target.tracking_token, items)
    const remaining = items.filter(i => outcome.failed.includes(i.file.name))
    setPendingDelivery(remaining)
    setDeliveryError(outcome.error)
  }
  const retryDelivery = async () => {
    if (!receipt) return
    setRetrying(true)
    try { await deliver(receipt, pendingDelivery) } finally { setRetrying(false) }
  }

  /* ── Confirmación: número REQ y token privado ── */
  if (receipt) {
    const outer = client ? 'flex justify-center' : 'min-h-screen bg-gradient-to-br from-brand-700 via-brand-800 to-brand-950 flex items-center justify-center p-4'
    return (
      <div className={outer}>
        <div className={`max-w-md w-full bg-white rounded-2xl p-8 text-center border-t-4 border-accent-400 ${client ? 'shadow-lg border border-gray-200' : 'shadow-2xl'}`}>
          <div className="text-6xl mb-4">✅</div>
          <h2 className="text-2xl font-bold text-brand-700 mb-2">¡Solicitud enviada!</h2>
          <p className="text-gray-600 mb-6">Tu solicitud fue registrada y será revisada por el {BRAND.teamLabel}.</p>
          <div className="bg-brand-50 border-2 border-brand-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-gray-600 mb-2">Número de seguimiento:</p>
            <p className="text-3xl font-bold text-primary">{receipt.request_number}</p>
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
          <p className="text-sm text-gray-500 mb-6">
            {client
              ? 'Puedes seguir su avance en «Mis tickets».'
              : 'Guarda este número: con él puedes consultar el estado de tu solicitud en «Rastrear solicitud».'}
          </p>
          <div className="space-y-3">
            <button onClick={() => { attempt.current = createRpcAttempt(); setReceipt(null); setPendingDelivery([]); setDeliveryError(null) }}
              className="w-full bg-primary text-white py-3 rounded-lg font-semibold hover:bg-brand-700 transition">
              {client ? 'Crear otro ticket' : 'Crear otra solicitud'}
            </button>
            {client ? (
              <button onClick={client.onViewMine}
                className="w-full bg-gray-100 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-200 transition">
                Ver Mis tickets
              </button>
            ) : (
              <button onClick={() => { handoffTracking(receipt.request_number); navigate('/tracking') }}
                className="w-full bg-gray-100 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-200 transition">
                Rastrear mi solicitud
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  const label = (text: string, required = true) => (
    <label className="block text-sm font-medium text-gray-700 mb-2">
      {text} {required && <span className="text-red-500">*</span>}
    </label>
  )
  const section = 'font-semibold text-brand-700 border-b pb-2'

  return (
    <div className={client ? '' : 'min-h-screen bg-gradient-to-br from-brand-700 via-brand-800 to-brand-950 py-12 px-4'}>
      <div className="max-w-3xl mx-auto">
        <div className={`bg-white rounded-2xl p-6 sm:p-8 ${client ? 'shadow-sm border border-gray-200' : 'shadow-2xl'}`}>
          {client ? (
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-brand-700 mb-1">Nuevo ticket</h1>
              <p className="text-gray-600 text-sm">Completa el formulario para enviar tu solicitud al {BRAND.teamLabel}.</p>
            </div>
          ) : (
          <div className="mb-8">
            <button type="button" onClick={() => navigate('/portal')}
              className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 transition mb-4">← Inicio</button>
            <div className="text-center">
              <BrandLogo size={48} showName={false} className="justify-center mb-4" />
              <h1 className="text-3xl font-bold text-brand-700 mb-2">Nueva Solicitud</h1>
              <div className="mx-auto mb-3 h-1 w-16 rounded-full bg-accent-400" aria-hidden="true" />
              <p className="text-gray-600">Completa el formulario para enviar una solicitud al {BRAND.teamLabel}</p>
            </div>
          </div>
          )}

          {catalogs.loading ? (
            <p className="text-center text-gray-400 py-8">Cargando formulario...</p>
          ) : !catalogs.available ? (
            <p role="alert" className="text-center text-red-700 py-8">El formulario no está disponible en este momento. Intenta más tarde.</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-8">
              <section className="space-y-4">
                <h3 className={section}>Datos del solicitante</h3>
                <div>
                  {label('Nombre del solicitante')}
                  <input required maxLength={200} value={form.requester_name} placeholder="Nombre y apellido"
                    pattern=".*\S.*" title="Ingresa el nombre del solicitante" aria-invalid={nameInvalid}
                    onBlur={() => setNameTouched(true)}
                    onChange={e => set({ requester_name: e.target.value })}
                    className={`${field} ${nameInvalid ? 'border-red-400 focus:ring-red-400' : ''}`} />
                  {nameInvalid && <p className="text-xs text-red-600 mt-1">El nombre es obligatorio.</p>}
                </div>
              </section>

              {client ? (
              <section className="space-y-4">
                <h3 className={section}>¿Para qué producto es la solicitud?</h3>
                {client.fixedProduct ? (
                  <div>
                    {label('Producto')}
                    <p className={`${field} bg-gray-50 text-gray-800 flex items-center gap-2`} aria-readonly="true">
                      <span aria-hidden="true">🔒</span>{client.products[0]?.name}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">Ingresaste desde esta plataforma: el ticket se registra para este producto.</p>
                  </div>
                ) : (
                  <div>
                    {label('Producto')}
                    <select required value={form.system_id} onChange={e => set({ system_id: e.target.value })} className={field}>
                      <option value="">Selecciona un producto</option>
                      {client.products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                )}
              </section>
              ) : (
              <section className="space-y-4">
                <h3 className={section}>¿Dónde ocurre el problema o requerimiento?</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    {label('Estudio')}
                    <select required value={form.studio_id} onChange={e => set({ studio_id: e.target.value })} className={field}>
                      <option value="">Selecciona un estudio</option>
                      {studios.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div>
                    {label('Proyecto / Sistema')}
                    <select required value={form.system_id} onChange={e => set({ system_id: e.target.value })} className={field}>
                      <option value="">Selecciona un proyecto</option>
                      {catalogs.systems.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                </div>
              </section>
              )}

              <section className="space-y-4">
                <h3 className={section}>¿Qué necesitas?</h3>
                <div>
                  {label('Tipo de solicitud')}
                  <select required value={form.request_type_id} onChange={e => set({ request_type_id: e.target.value })} className={field}>
                    <option value="">Selecciona el tipo principal</option>
                    {catalogs.requestTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div>
                  {label('Título del requerimiento')}
                  <input required maxLength={300} value={form.title} placeholder="Resumen breve"
                    onChange={e => set({ title: e.target.value })} className={field} />
                </div>
                <div>
                  {label('Descripción detallada')}
                  <textarea required rows={6} maxLength={20000} value={form.description}
                    placeholder="Describe qué ocurre o qué necesitas, pasos para reproducirlo y el resultado esperado"
                    onChange={e => set({ description: e.target.value })} className={`${field} resize-y`} />
                </div>
                <div>
                  {label('Adjuntar capturas o documentos', false)}
                  <AttachmentPicker onChange={setPrepared} resetKey={pickerKey} />
                </div>
                <label className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50">
                  <input type="checkbox" checked={urgent} onChange={e => setUrgent(e.target.checked)} className="h-4 w-4 accent-red-600" />
                  <span className="text-sm font-medium text-gray-800">Solicito atención urgente</span>
                </label>
              </section>

              {error && <p role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</p>}

              <button type="submit" disabled={loading || !prepared || !prepared.ok}
                className="w-full bg-accent-400 hover:bg-accent-300 text-gray-900 py-3.5 rounded-lg font-bold transition disabled:opacity-50">
                {loading ? 'Enviando...' : 'Enviar solicitud'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
