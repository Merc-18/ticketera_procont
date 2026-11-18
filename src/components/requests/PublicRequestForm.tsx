import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { operations } from '../../lib/api'
import { createRpcAttempt } from '../../lib/rpc-attempt'
import { errorMessage } from '../../lib/supabase-errors'
import { handoffTracking } from '../../lib/tracking-handoff'
import type { SubmissionReceipt } from '../../lib/operations'
import { useCatalogs } from '../../hooks/useCatalogs'
import { uploadRequestAttachments } from '../../lib/attachments'
import type { PreparationResult } from '../../lib/attachment-prep'
import AttachmentPicker from './AttachmentPicker'
import BrandLogo from '../ui/BrandLogo'
import { BRAND } from '../../theme/brand'

const EMPTY = { requester_name: '', studio_id: '', system_id: '', request_type_id: '', title: '', description: '' }
const field = 'w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary outline-none bg-white'

/**
 * Formulario público definitivo (aprobado 18/11/2026). El cliente no ve correo, subproyecto,
 * área, RUC, códigos, responsables, prioridad, SLA ni plazos.
 */
export default function PublicRequestForm() {
  const navigate = useNavigate()
  const catalogs = useCatalogs('public')
  const attempt = useRef(createRpcAttempt())
  const [form, setForm] = useState(EMPTY)
  const [urgent, setUrgent] = useState(false)
  // Adjuntos ya preparados (comprimidos si hacía falta) ANTES de enviar; null = procesando.
  const [prepared, setPrepared] = useState<PreparationResult | null>({ items: [], totalBytes: 0, originalBytes: 0, ok: true, error: null })
  const [pickerKey, setPickerKey] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<SubmissionReceipt | null>(null)
  const [failedFiles, setFailedFiles] = useState<string[]>([])

  const set = (patch: Partial<typeof EMPTY>) => setForm(f => ({ ...f, ...patch }))
  // Nombres de estudio únicos (sin RUC ni códigos internos).
  const studios = Array.from(new Map(catalogs.studios.map(s => [s.name.toLowerCase(), s])).values())

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!prepared) { setError('Espera a que terminen de prepararse los adjuntos.'); return }
    if (!prepared.ok) { setError(prepared.error); return }
    setLoading(true); setError(null)
    try {
      const result = await operations.submitClientRequest({ ...form, urgent_requested: urgent }, attempt.current)
      const ready = prepared.items.map(i => i.file)
      const failed = ready.length ? await uploadRequestAttachments(result.id, ready) : []
      setFailedFiles(failed)
      setReceipt(result)
      setForm(EMPTY); setUrgent(false); setPickerKey(k => k + 1)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  /* ── Confirmación: número REQ y token privado ── */
  if (receipt) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-700 via-brand-800 to-brand-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 text-center border-t-4 border-accent-400">
          <div className="text-6xl mb-4">✅</div>
          <h2 className="text-2xl font-bold text-brand-700 mb-2">¡Solicitud enviada!</h2>
          <p className="text-gray-600 mb-6">Tu solicitud fue registrada y será revisada por el {BRAND.teamLabel}.</p>
          <div className="bg-brand-50 border-2 border-brand-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-gray-600 mb-2">Número de seguimiento:</p>
            <p className="text-3xl font-bold text-primary">{receipt.request_number}</p>
          </div>
          {failedFiles.length > 0 && (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
              No se pudieron adjuntar: {failedFiles.join(', ')}. La solicitud sí quedó registrada.
            </p>
          )}
          <p className="text-sm text-gray-500 mb-4">
            Guarda el número y este token para consultar tu solicitud. El token solo se muestra ahora; no lo compartas.
          </p>
          <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left">
            <p className="text-sm text-gray-600 mb-2">Token de seguimiento:</p>
            <code className="break-all select-all">{receipt.tracking_token}</code>
          </div>
          <div className="space-y-3">
            <button onClick={() => { attempt.current = createRpcAttempt(); setReceipt(null) }}
              className="w-full bg-primary text-white py-3 rounded-lg font-semibold hover:bg-brand-700 transition">
              Crear otra solicitud
            </button>
            <button onClick={() => { handoffTracking(receipt); navigate('/tracking') }}
              className="w-full bg-gray-100 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-200 transition">
              Rastrear mi solicitud
            </button>
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
    <div className="min-h-screen bg-gradient-to-br from-brand-700 via-brand-800 to-brand-950 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8">
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

          {catalogs.loading ? (
            <p className="text-center text-gray-400 py-8">Cargando formulario...</p>
          ) : !catalogs.available ? (
            <p role="alert" className="text-center text-red-700 py-8">El formulario no está disponible en este momento. Intenta más tarde.</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-8">
              <section className="space-y-4">
                <h3 className={section}>Datos del solicitante</h3>
                <div>
                  {label('Nombre')}
                  <input required maxLength={200} value={form.requester_name} placeholder="Nombre y apellido"
                    onChange={e => set({ requester_name: e.target.value })} className={field} />
                </div>
              </section>

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
