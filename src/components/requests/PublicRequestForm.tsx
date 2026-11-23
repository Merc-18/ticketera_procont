import { useEffect, useState, type MutableRefObject } from 'react'
import { createRpcAttempt } from '../../lib/rpc-attempt'
import { errorMessage } from '../../lib/supabase-errors'
import type { SubmissionReceipt } from '../../lib/operations'
import { useCatalogs } from '../../hooks/useCatalogs'
import type { DeliveryItem, DeliveryResult } from '../../lib/attachments'
import type { RpcAttempt } from '../../lib/rpc-attempt'
import { isClientPortalError, type ClientIdentity, type ClientProduct, type ClientTicketInput, type ClientSubproject } from '../../lib/client-portal'
import type { PreparationResult } from '../../lib/attachment-prep'
import { REQUESTED_PRIORITIES } from '../../lib/client-request-data'
import AttachmentPicker from './AttachmentPicker'
import Icon from '../ui/Icon'
import { BRAND } from '../../theme/brand'

const EMPTY: ClientTicketInput = {
  requester_name: '', system_id: '', subsystem_id: null, request_type_id: '',
  title: '', description: '', requested_priority: 'medium', urgent_requested: false,
}
const field = 'ui-input focus:ring-2 focus:ring-primary'

/** Sesión de cliente autenticado (portal Quipu/QuipuFac): sin estudio; producto desde la sesión. */
export interface ClientFormConfig {
  /** Productos permitidos devueltos por el backend para la sesión. */
  products: ClientProduct[]
  identity: ClientIdentity
  draft: ClientTicketInput | null
  setDraft: (draft: ClientTicketInput | null) => void
  attempt: MutableRefObject<RpcAttempt>
  uncertain: boolean
  setUncertain: (value: boolean) => void
  loadSubprojects: (id: string) => Promise<ClientSubproject[]>
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
 * El cliente no ve correo, estudio, área, RUC, códigos, responsables, prioridad definitiva,
 * SLA ni plazos: el estudio lo deriva el servidor y el producto se elige solo entre los
 * permitidos por la sesión (o queda fijo si se abrió desde una plataforma).
 * No existe un modo anónimo: toda creación usa el contrato del cliente autenticado.
 */
export default function PublicRequestForm({ client }: { client: ClientFormConfig }) {
  const catalogs = useCatalogs('public')
  const attempt = client.attempt
  const initial = client.products.length === 1 ? { ...EMPTY, system_id: client.products[0].id } : EMPTY
  const form = client.draft ?? initial
  const individual = client.identity.kind === 'individual' ? client.identity : null
  const authenticatedName = individual ? individual.display_name ?? individual.username : null
  const nameUnavailable = !!individual && (!authenticatedName || authenticatedName.length > 200)
  const product = client.products.find(p => p.id === form.system_id)
  const [options, setOptions] = useState<{ systemId: string; loading: boolean; items: ClientSubproject[]; failed: boolean }>({ systemId: '', loading: false, items: [], failed: false })
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!form.system_id) return
    let alive = true
    const systemId = form.system_id
    setOptions({ systemId, loading: true, items: [], failed: false })
    client.loadSubprojects(systemId).then(items => {
      if (alive) setOptions({ systemId, loading: false, items, failed: false })
    }).catch(() => { if (alive) setOptions({ systemId, loading: false, items: [], failed: true }) })
    return () => { alive = false }
  }, [form.system_id, client.loadSubprojects, retry])
  const ready = !!product && options.systemId === form.system_id && !options.loading && !options.failed
  const requiresSubproject = ready && !!product?.requires_subproject && options.items.length > 0
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

  // Taste (Forms): errores al enviar, cada uno bajo su campo; el primero recibe el foco.
  type FieldKey = 'ticket-requester' | 'ticket-product' | 'ticket-subproject' | 'ticket-type' | 'ticket-title' | 'ticket-description'
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({})
  const FIELD_OF: Partial<Record<keyof ClientTicketInput, FieldKey>> = { requester_name: 'ticket-requester', system_id: 'ticket-product',
    subsystem_id: 'ticket-subproject', request_type_id: 'ticket-type', title: 'ticket-title', description: 'ticket-description' }
  const set = (patch: Partial<ClientTicketInput>) => {
    client.setDraft({ ...form, ...patch })
    const cleared = Object.keys(patch).map(k => FIELD_OF[k as keyof ClientTicketInput]).filter(Boolean) as FieldKey[]
    if (patch.system_id !== undefined) cleared.push('ticket-subproject')
    if (cleared.some(k => fieldErrors[k])) setFieldErrors(prev => { const next = { ...prev }; cleared.forEach(k => delete next[k]); return next })
  }
  const [nameTouched, setNameTouched] = useState(false)
  const nameInvalid = !!fieldErrors['ticket-requester'] || (nameTouched && !form.requester_name.trim())
  const invalid = (id: FieldKey) => fieldErrors[id] ? { 'aria-invalid': true as const, 'aria-describedby': `${id}-error` } : {}
  const fieldError = (id: FieldKey) => fieldErrors[id] ? <p id={`${id}-error`} className="field-error">{fieldErrors[id]}</p> : null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (individual && nameUnavailable) { setError('No se dispone de un nombre o usuario autenticado válido.'); return }
    // Nombre, título y descripción no pueden quedar vacíos ni contener solo espacios.
    const errors: Partial<Record<FieldKey, string>> = {}
    if (!individual && !form.requester_name.trim()) errors['ticket-requester'] = 'Escribe el nombre de quien hace la solicitud.'
    if (!client.products.some(p => p.id === form.system_id)) errors['ticket-product'] = 'Elige el producto de la solicitud.'
    else if (ready && ((requiresSubproject && !form.subsystem_id) || (form.subsystem_id && !options.items.some(p => p.id === form.subsystem_id)))) errors['ticket-subproject'] = 'Elige un subproyecto de este producto.'
    if (!form.request_type_id) errors['ticket-type'] = 'Elige el tipo de solicitud.'
    if (!form.title.trim()) errors['ticket-title'] = 'Escribe un título breve.'
    if (!form.description.trim()) errors['ticket-description'] = 'Describe qué necesitas.'
    const failed = Object.keys(errors) as FieldKey[]
    setFieldErrors(errors)
    if (failed.length) {
      setNameTouched(true)
      setError(failed.length === 1 ? 'Revisa el campo marcado.' : `Revisa los ${failed.length} campos marcados.`)
      document.getElementById(failed[0])?.focus()
      return
    }
    if (!ready) { setError('Espera a que se carguen los subproyectos del producto.'); return }
    if (!prepared) { setError('Espera a que terminen de prepararse los adjuntos.'); return }
    if (!prepared.ok) { setError(prepared.error); return }
    setLoading(true); setError(null)
    try {
      const result = await client.submit(form, attempt.current)
      // Los archivos ya están comprimidos; cada uno recibe una clave de subida estable.
      const items: DeliveryItem[] = prepared.items.map(i => ({ file: i.file, uploadKey: crypto.randomUUID() }))
      setReceipt(result)
      client.setUncertain(false)
      client.setDraft(null)
      attempt.current = createRpcAttempt()
      await deliver(result, items)
      setPickerKey(k => k + 1); setNameTouched(false)
    } catch (err) {
      if (!isClientPortalError(err) || isClientPortalError(err, 'unavailable') || isClientPortalError(err, 'invalid_response')) { client.setDraft(form); client.setUncertain(true) }
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
            <div className="text-sm text-yellow-800 bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4 text-left space-y-2">
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
      {text} {required && <span className="text-red-700">*</span>}
    </label>
  )
  const section = 'font-medium text-brand-700'

  return (
    <div className="max-w-4xl mx-auto">
      <div className="ticket-form">
        <header>
          <h1 className="text-2xl font-medium text-brand-700 mb-1">Nuevo ticket</h1>
          <p className="text-gray-600 text-sm">Completa el formulario para enviar tu solicitud al {BRAND.teamLabel}.</p>
        </header>

        {catalogs.loading ? (
          <p role="status" className="text-center text-gray-600 py-8">Cargando formulario…</p>
        ) : !catalogs.available ? (
          <p role="alert" className="text-center text-red-700 py-8">El formulario no está disponible en este momento. Intenta más tarde.</p>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="space-y-8">
            <fieldset className="ticket-form-fields space-y-8 min-w-0" disabled={loading || client.uncertain}>
              <legend className="sr-only">Datos de la solicitud</legend>
              <section className="space-y-4">
                <h2 className={section}>Datos del solicitante</h2>
                {individual ? <div>
                  <p id="authenticated-requester-label" className="text-sm font-medium text-gray-700 mb-2">{individual.display_name ? 'Nombre del solicitante' : 'Usuario autenticado'}</p>
                  <p aria-labelledby="authenticated-requester-label" className={`${field} flex items-center gap-2 break-all`}><Icon name="lock" size={18} className="shrink-0" />{authenticatedName ?? 'Información no disponible'}</p>
                  <p className="text-xs text-gray-600 mt-2">{individual.display_name ? 'Nombre obtenido de tu sesión Quipu.' : 'Username exacto obtenido de tu sesión Quipu; no es un nombre personal verificado.'}</p>
                  {nameUnavailable && <p role="alert" className="text-sm text-red-700 mt-2">No tenemos un nombre o usuario válido para registrar la solicitud. Comunícate con Procont.</p>}
                </div> : <>
                <div>
                  {label('ticket-requester', 'Nombre del solicitante')}
                  <input id="ticket-requester" required maxLength={200} value={form.requester_name} placeholder="Nombre y apellido"
                    aria-invalid={nameInvalid || undefined} aria-describedby={nameInvalid ? 'ticket-requester-error' : undefined}
                    onBlur={() => setNameTouched(true)}
                    onChange={e => set({ requester_name: e.target.value })}
                    className={field} />
                  {nameInvalid && <p id="ticket-requester-error" className="field-error">{fieldErrors['ticket-requester'] ?? 'Escribe el nombre de quien hace la solicitud.'}</p>}
                </div>
                </>}
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
                    <select id="ticket-product" required {...invalid('ticket-product')} value={form.system_id} onChange={e => set({ system_id: e.target.value, subsystem_id: null })} className={field}>
                      <option value="">Selecciona un producto</option>
                      {client.products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    {fieldError('ticket-product')}
                  </div>
                )}
                <div>
                  {label('ticket-subproject', 'Subproyecto', requiresSubproject)}
                  <select id="ticket-subproject" className={field} value={form.subsystem_id ?? ''} required={requiresSubproject}
                    disabled={!ready || options.items.length === 0} aria-invalid={fieldErrors['ticket-subproject'] ? true : undefined}
                    aria-describedby={fieldErrors['ticket-subproject'] ? 'ticket-subproject-error ticket-subproject-help' : 'ticket-subproject-help'}
                    onChange={e => set({ subsystem_id: e.target.value || null })}>
                    <option value="">{!product ? 'Selecciona primero un producto' : options.failed && options.systemId === form.system_id ? 'Opciones no disponibles' : !ready ? 'Cargando subproyectos…' : !options.items.length ? 'Sin subproyectos' : requiresSubproject ? 'Selecciona un subproyecto' : 'Sin subproyecto'}</option>
                    {options.systemId === form.system_id && options.items.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  {fieldError('ticket-subproject')}
                  <p id="ticket-subproject-help" role="status" className="text-xs text-gray-600 mt-2">{!product ? 'Elige un producto para consultar sus opciones.' : options.systemId !== form.system_id || options.loading ? 'Cargando subproyectos…' : options.failed ? 'No pudimos cargar los subproyectos. Reintenta para continuar.' : !options.items.length ? 'Este producto no tiene subproyectos disponibles. Puedes continuar.' : requiresSubproject ? 'Selecciona un subproyecto para continuar.' : 'Subproyecto opcional para este producto.'}</p>
                </div>
              </section>

              <section className="space-y-4">
                <h2 className={section}>¿Qué necesitas?</h2>
                <div>
                  {label('ticket-type', 'Tipo de solicitud')}
                  <select id="ticket-type" required {...invalid('ticket-type')} value={form.request_type_id} onChange={e => set({ request_type_id: e.target.value })} className={field}>
                    <option value="">Selecciona el tipo principal</option>
                    {catalogs.requestTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  {fieldError('ticket-type')}
                </div>
                <div>
                  {label('ticket-title', 'Título del requerimiento')}
                  <input id="ticket-title" required {...invalid('ticket-title')} maxLength={300} value={form.title} placeholder="Resumen breve"
                    onChange={e => set({ title: e.target.value })} className={field} />
                  {fieldError('ticket-title')}
                </div>
                <div>
                  {label('ticket-description', 'Descripción detallada')}
                  <textarea id="ticket-description" required {...invalid('ticket-description')} rows={6} maxLength={20000} value={form.description}
                    placeholder="Describe qué ocurre o qué necesitas, pasos para reproducirlo y el resultado esperado"
                    onChange={e => set({ description: e.target.value })} className={`${field} resize-y`} />
                  {fieldError('ticket-description')}
                </div>
                <div>
                  <p className="block text-sm font-medium text-gray-700 mb-2">Adjuntar capturas o documentos</p>
                  <AttachmentPicker onChange={setPrepared} resetKey={pickerKey} />
                </div>
                <div>
                  {label('ticket-priority', 'Prioridad solicitada')}
                  <select id="ticket-priority" className={field} value={form.requested_priority} required aria-describedby="ticket-priority-help"
                    onChange={e => set({ requested_priority: e.target.value as ClientTicketInput['requested_priority'] })}>
                    {Object.entries(REQUESTED_PRIORITIES).map(([value, title]) => <option key={value} value={value}>{title}</option>)}
                  </select>
                  <p id="ticket-priority-help" className="text-xs text-gray-600 mt-2">El equipo revisará tu solicitud y asignará la prioridad definitiva. La atención urgente se solicita por separado.</p>
                </div>
                <label className="flex items-center gap-3 p-4 min-h-[44px] rounded-lg border border-gray-300 cursor-pointer hover:bg-gray-50">
                  <input type="checkbox" checked={form.urgent_requested} onChange={e => set({ urgent_requested: e.target.checked })} className="h-5 w-5 accent-red-700" />
                  <span className="text-sm font-medium text-gray-800">Solicito atención urgente (independiente de la prioridad)</span>
                </label>
              </section>

            </fieldset>
            {options.systemId === form.system_id && options.failed && <button type="button" className="ui-button ui-button-secondary" onClick={() => setRetry(n => n + 1)}>Reintentar subproyectos</button>}
            {client.uncertain && <p role="status" className="text-sm text-gray-700">No pudimos confirmar el envío. Reintenta con los mismos datos para recuperar la constancia sin duplicar tu solicitud.</p>}
            <div className="form-actions">
              <button type="submit" disabled={loading}
                className="ui-button ui-button-primary">
                {loading ? 'Enviando…' : client.uncertain ? 'Reintentar envío' : 'Enviar solicitud'}
              </button>
              <button type="button" className="ui-button ui-button-secondary" disabled={loading || client.uncertain} onClick={() => { client.setDraft(null); attempt.current = createRpcAttempt(); client.onViewMine() }}>Cancelar</button>
            </div>
            <p role="status" aria-live="polite" className={error ? 'bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm' : 'sr-only'}>{error ?? ''}</p>
          </form>
        )}
      </div>
    </div>
  )
}
