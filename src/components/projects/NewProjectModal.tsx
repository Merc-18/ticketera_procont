import ControlLabel from '../ui/ControlLabel'
import ModalFocus from '../ui/ModalFocus'
import { useMemo, useRef, useState } from 'react'
import { createRpcAttempt, type RpcAttempt } from '../../lib/rpc-attempt'
import type { InternalTicketInput, InternalTicketReceipt } from '../../lib/operations'
import { useUsers } from '../../hooks/useUsers'
import { useCatalogs } from '../../hooks/useCatalogs'
import Icon from '../ui/Icon'
import { PHASE_LABELS, PRIORITY_LABEL } from '../../lib/constants'
import { DEVELOPMENT_PHASES } from '../../lib/board'
import { areasApply } from '../../lib/studio-rules'
import PortfolioSelect from '../boards/PortfolioSelect'
import { decodePortfolio, usePortfolios } from '../../lib/portfolios'
import AttachmentPicker from '../requests/AttachmentPicker'
import type { PreparationResult } from '../../lib/attachment-prep'
import { uploadBoardEvidence } from '../../lib/attachments'
import { toast } from '../../lib/toast'

/**
 * Alta interna de tickets desde TI (M19) con paridad frente al portal del cliente.
 *  · «Originado por cliente»: los mismos datos que pide el portal (estudio, producto, subproyecto, tipo, prioridad
 *    solicitada, solicitante) más la clasificación del validador (código interno y, solo con el código exacto
 *    PROCONT, área/subárea). El servidor la registra, la clasifica y la aprueba en una sola transacción.
 *  · «Interno u operativo»: trabajo del propio equipo, sin datos de cliente.
 * Ambos: prioridad asignada, responsable, fase inicial, fechas, Portafolio y adjuntos (seleccionar, arrastrar, pegar).
 */
type Mode = InternalTicketInput['mode']
type Priority = InternalTicketInput['priority']
interface Props {
  onClose: () => void
  onCreate: (data: InternalTicketInput, attempt: RpcAttempt) => Promise<InternalTicketReceipt>
}
const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'urgent']
const START_PHASES = DEVELOPMENT_PHASES.filter(p => p !== 'done')

export default function NewProjectModal({ onClose, onCreate }: Props) {
  const { assignableUsers } = useUsers()
  const catalogs = useCatalogs('member')
  const portfolios = usePortfolios()
  const attempt = useRef(createRpcAttempt())
  const [mode, setMode] = useState<Mode>('client')
  const [f, setF] = useState({ title: '', description: '', priority: 'medium' as Priority, assigned_dev: '', initial_phase: 'backlog',
    start_date: '', due_date: '', requester_name: '', requester_email: '', portfolio: '', studio_id: '', studio_code_id: '',
    system_id: '', subsystem_id: '', request_type_id: '', requested_priority: 'medium' as Priority, area_id: '', subarea_id: '' })
  const set = (patch: Partial<typeof f>) => setF(prev => ({ ...prev, ...patch }))
  const [prepared, setPrepared] = useState<PreparationResult | null>({ items: [], totalBytes: 0, originalBytes: 0, ok: true, error: null })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)

  const codes = catalogs.codes.filter(c => c.studio_id === f.studio_id)
  const system = catalogs.systems.find(s => s.id === f.system_id)
  const subs = catalogs.subsystems.filter(s => s.system_id === f.system_id)
  const needsSub = !!system?.requires_subproject && subs.length > 0
  const areaApplies = mode === 'client' && areasApply(f.studio_code_id, catalogs.codes)
  const rootAreas = catalogs.areas.filter(a => a.studio_id === f.studio_id && !a.parent_id)
  const subAreas = catalogs.areas.filter(a => a.parent_id === f.area_id)
  const areaRequired = areaApplies && rootAreas.length > 0

  const missing = useMemo(() => {
    const m: string[] = []
    if (!f.title.trim()) m.push('Título')
    if (!f.description.trim()) m.push('Descripción')
    if (!f.assigned_dev) m.push('Responsable principal')
    if (mode === 'client') {
      if (!f.requester_name.trim()) m.push('Solicitante')
      if (!f.studio_id) m.push('Estudio')
      if (!f.studio_code_id) m.push('Código interno')
      if (!f.system_id) m.push('Producto')
      if (needsSub && !f.subsystem_id) m.push('Subproyecto')
      if (!f.request_type_id) m.push('Tipo de solicitud')
      if (areaRequired && !f.area_id) m.push('Área')
    }
    if (f.start_date && f.due_date && f.due_date < f.start_date) m.push('Fecha objetivo posterior al inicio')
    return m
  }, [f, mode, needsSub, areaRequired])

  const handleSubmit = async () => {
    setTouched(true)
    if (missing.length) { setError(`Completa: ${missing.join(', ')}.`); return }
    if (!prepared) { setError('Espera a que terminen de prepararse los adjuntos.'); return }
    if (!prepared.ok) { setError(prepared.error); return }
    setSaving(true); setError(null)
    try {
      const target = decodePortfolio(f.portfolio, portfolios.initiatives)
      const receipt = await onCreate({
        mode, title: f.title, description: f.description, priority: f.priority, assigned_dev: f.assigned_dev,
        start_date: f.start_date || undefined, due_date: f.due_date || undefined, initial_phase: f.initial_phase,
        requester_name: f.requester_name || undefined, requester_email: mode === 'client' ? f.requester_email || undefined : undefined,
        portfolio_id: target.portfolio_id, initiative_id: target.initiative_id,
        ...(mode === 'client' ? { studio_id: f.studio_id, studio_code_id: f.studio_code_id, system_id: f.system_id,
          subsystem_id: f.subsystem_id || null, request_type_id: f.request_type_id, requested_priority: f.requested_priority,
          area_id: areaApplies ? f.area_id || null : null, subarea_id: areaApplies ? f.subarea_id || null : null } : {}),
      }, attempt.current)
      // Evidencias con el flujo interno existente (reserve_board_evidence); el ticket ya está creado.
      if (prepared.items.length) {
        const result = await uploadBoardEvidence(receipt.project.id, prepared.items.map(i => ({ file: i.file, uploadKey: crypto.randomUUID() })))
        if (result.error) toast.error(`Ticket ${receipt.request_number} creado; ${result.error} Puedes reintentarlo desde la pestaña Evidencias.`)
        else toast.success(`Ticket ${receipt.request_number} creado con ${result.uploaded.length} adjunto(s).`)
      } else toast.success(`Ticket ${receipt.request_number} creado.`)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el ticket.')
    } finally {
      setSaving(false)
    }
  }

  const req = <span className="text-red-700" aria-hidden="true"> *</span>
  const invalid = (cond: boolean) => (touched && cond ? { 'aria-invalid': true as const } : {})

  return (
    <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center">
      <div role="dialog" aria-modal="true" aria-label="Nuevo ticket" className="modal-panel new-ticket w-full max-w-3xl flex flex-col max-h-[90vh]">
        <ModalFocus onDismiss={onClose} />
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-lg font-medium text-gray-900"><ControlLabel icon="plus">Nuevo ticket</ControlLabel></h2>
            <p className="text-sm text-gray-600">Board Development · los campos con * son obligatorios.</p>
          </div>
          <button aria-label="Cerrar" onClick={onClose}><Icon name="close" size={20} /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">
          <fieldset className="new-ticket-mode">
            <legend>Origen del ticket</legend>
            <div role="radiogroup" className="segmented">
              {([['client', 'Originado por cliente', 'Registra la solicitud de un cliente con los mismos datos que el portal.'],
                 ['internal', 'Interno u operativo', 'Trabajo del equipo de TI; sin datos de cliente.']] as const).map(([value, label, hint]) => (
                <label key={value} className={`new-ticket-mode-option ${mode === value ? 'is-on' : ''}`}>
                  <input type="radio" name="ticket-mode" value={value} checked={mode === value} onChange={() => setMode(value)} />
                  <span><strong>{label}</strong><small>{hint}</small></span>
                </label>
              ))}
            </div>
          </fieldset>

          <section className="new-ticket-section" aria-labelledby="nt-what">
            <h3 id="nt-what">Solicitud</h3>
            <label className="nt-field nt-wide" htmlFor="nt-title"><span>Título{req}</span>
              <input id="nt-title" className="ui-input" maxLength={300} value={f.title} onChange={e => set({ title: e.target.value })} placeholder="Resumen breve" {...invalid(!f.title.trim())} />
            </label>
            <label className="nt-field nt-wide" htmlFor="nt-description"><span>Descripción{req}</span>
              <textarea id="nt-description" className="ui-input" rows={4} maxLength={20000} value={f.description} onChange={e => set({ description: e.target.value })}
                placeholder="Qué ocurre o qué se necesita, pasos y resultado esperado" {...invalid(!f.description.trim())} />
            </label>
            {mode === 'client' ? (<>
              <label className="nt-field" htmlFor="nt-requester"><span>Solicitante (cliente){req}</span>
                <input id="nt-requester" className="ui-input" maxLength={200} value={f.requester_name} onChange={e => set({ requester_name: e.target.value })} {...invalid(!f.requester_name.trim())} />
              </label>
              <label className="nt-field" htmlFor="nt-email"><span>Correo del solicitante <small>(opcional)</small></span>
                <input id="nt-email" type="email" className="ui-input" maxLength={320} value={f.requester_email} onChange={e => set({ requester_email: e.target.value })} />
              </label>
              <label className="nt-field" htmlFor="nt-type"><span>Tipo de solicitud{req}</span>
                <select id="nt-type" className="ui-input" value={f.request_type_id} onChange={e => set({ request_type_id: e.target.value })} {...invalid(!f.request_type_id)}>
                  <option value="">Selecciona…</option>
                  {catalogs.requestTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
              <label className="nt-field" htmlFor="nt-requested-priority"><span>Prioridad solicitada por el cliente</span>
                <select id="nt-requested-priority" className="ui-input" value={f.requested_priority} onChange={e => set({ requested_priority: e.target.value as Priority })}>
                  {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
                </select>
              </label>
            </>) : (
              <label className="nt-field nt-wide" htmlFor="nt-requester"><span>Solicitante <small>(opcional; por defecto, tú)</small></span>
                <input id="nt-requester" className="ui-input" maxLength={200} value={f.requester_name} onChange={e => set({ requester_name: e.target.value })} />
              </label>
            )}
          </section>

          {mode === 'client' && (
            <section className="new-ticket-section" aria-labelledby="nt-class">
              <h3 id="nt-class">Clasificación</h3>
              <label className="nt-field" htmlFor="nt-studio"><span>Estudio{req}</span>
                <select id="nt-studio" className="ui-input" value={f.studio_id} onChange={e => set({ studio_id: e.target.value, studio_code_id: '', area_id: '', subarea_id: '' })} {...invalid(!f.studio_id)}>
                  <option value="">Selecciona…</option>
                  {catalogs.studios.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <label className="nt-field" htmlFor="nt-code"><span>Código interno{req}</span>
                <select id="nt-code" className="ui-input" value={f.studio_code_id} disabled={!f.studio_id} onChange={e => set({ studio_code_id: e.target.value, area_id: '', subarea_id: '' })} {...invalid(!f.studio_code_id)}>
                  <option value="">{f.studio_id ? 'Selecciona…' : 'Elige primero el estudio'}</option>
                  {codes.map(c => <option key={c.id} value={c.id}>{c.code}</option>)}
                </select>
              </label>
              <label className="nt-field" htmlFor="nt-system"><span>Producto{req}</span>
                <select id="nt-system" className="ui-input" value={f.system_id} onChange={e => set({ system_id: e.target.value, subsystem_id: '' })} {...invalid(!f.system_id)}>
                  <option value="">Selecciona…</option>
                  {catalogs.systems.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <label className="nt-field" htmlFor="nt-subsystem"><span>Subproyecto{needsSub ? req : <small> (opcional)</small>}</span>
                <select id="nt-subsystem" className="ui-input" value={f.subsystem_id} disabled={!subs.length} onChange={e => set({ subsystem_id: e.target.value })} {...invalid(needsSub && !f.subsystem_id)}>
                  <option value="">{subs.length ? 'Selecciona…' : 'Este producto no tiene subproyectos'}</option>
                  {subs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              {areaApplies ? (<>
                <label className="nt-field" htmlFor="nt-area"><span>Área{areaRequired ? req : null}</span>
                  <select id="nt-area" className="ui-input" value={f.area_id} onChange={e => set({ area_id: e.target.value, subarea_id: '' })} {...invalid(areaRequired && !f.area_id)}>
                    <option value="">Selecciona…</option>
                    {rootAreas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </label>
                <label className="nt-field" htmlFor="nt-subarea"><span>Subárea <small>(opcional)</small></span>
                  <select id="nt-subarea" className="ui-input" value={f.subarea_id} disabled={!subAreas.length} onChange={e => set({ subarea_id: e.target.value })}>
                    <option value="">{subAreas.length ? 'Selecciona…' : 'Sin subáreas'}</option>
                    {subAreas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </label>
              </>) : f.studio_code_id ? (
                <p className="nt-note nt-wide">Área y subárea solo aplican al código interno PROCONT.</p>
              ) : null}
            </section>
          )}

          <section className="new-ticket-section" aria-labelledby="nt-work">
            <h3 id="nt-work">Gestión interna</h3>
            <label className="nt-field" htmlFor="nt-priority"><span>Prioridad asignada{req}</span>
              <select id="nt-priority" className="ui-input" value={f.priority} onChange={e => set({ priority: e.target.value as Priority })}>
                {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
              </select>
            </label>
            <label className="nt-field" htmlFor="nt-assignee"><span>Responsable principal{req}</span>
              <select id="nt-assignee" className="ui-input" value={f.assigned_dev} onChange={e => set({ assigned_dev: e.target.value })} {...invalid(!f.assigned_dev)}>
                <option value="">Selecciona…</option>
                {assignableUsers.map(u => <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>)}
              </select>
            </label>
            <label className="nt-field" htmlFor="nt-phase"><span>Fase inicial</span>
              <select id="nt-phase" className="ui-input" value={f.initial_phase} onChange={e => set({ initial_phase: e.target.value })}>
                {START_PHASES.map(p => <option key={p} value={p}>{PHASE_LABELS[p] ?? p}</option>)}
              </select>
            </label>
            <label className="nt-field" htmlFor="nt-portfolio"><span>Portafolio <small>(opcional)</small></span>
              <PortfolioSelect id="nt-portfolio" value={f.portfolio} onChange={v => set({ portfolio: v })} />
            </label>
            <label className="nt-field" htmlFor="nt-start"><span>Fecha de inicio <small>(opcional)</small></span>
              <input id="nt-start" type="date" className="ui-input" value={f.start_date} onChange={e => set({ start_date: e.target.value })} />
            </label>
            <label className="nt-field" htmlFor="nt-due"><span>Fecha objetivo <small>(opcional)</small></span>
              <input id="nt-due" type="date" className="ui-input" value={f.due_date} onChange={e => set({ due_date: e.target.value })} {...invalid(!!f.start_date && !!f.due_date && f.due_date < f.start_date)} />
            </label>
          </section>

          <section className="new-ticket-section" aria-labelledby="nt-files">
            <h3 id="nt-files">Adjuntos <small>(opcional)</small></h3>
            <div className="nt-wide"><AttachmentPicker onChange={setPrepared} sending={saving} /></div>
          </section>

          {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t">
          <button onClick={onClose} className="ui-button ui-button-quiet">Cancelar</button>
          <button onClick={() => { void handleSubmit() }} disabled={saving} className="ui-button ui-button-primary">
            {saving ? 'Creando…' : 'Crear ticket'}
          </button>
        </div>
      </div>
    </div>
  )
}
