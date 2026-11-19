import { useEffect, useState } from 'react'
import AttachmentPicker from '../requests/AttachmentPicker'
import { listRequestAttachments, uploadBoardEvidence } from '../../lib/attachments'
import type { PreparationResult } from '../../lib/attachment-prep'
import { toast } from '../../lib/toast'

/** Evidencias del ticket (bucket privado). Subida interna vía reserve_board_evidence. */
export default function EvidenceSection({ projectId, requestId, editable, onChanged }: {
  projectId: string; requestId?: string | null; editable: boolean; onChanged?: () => void
}) {
  const [files, setFiles] = useState<{ name: string; url: string | null }[] | null>(null)
  const [prepared, setPrepared] = useState<PreparationResult | null>(null)
  const [keys, setKeys] = useState<Map<File, string>>(new Map())
  const [deliveredKeys, setDeliveredKeys] = useState<ReadonlySet<string>>(() => new Set())
  const [busy, setBusy] = useState(false)
  const [resetKey, setResetKey] = useState(0)

  const [loadError, setLoadError] = useState<string | null>(null)
  const load = async () => {
    setLoadError(null)
    try { setFiles(requestId ? await listRequestAttachments(requestId) : []) }
    catch (err) { setFiles(null); setLoadError(err instanceof Error ? err.message : 'No se pudieron cargar las evidencias.') }
  }
  useEffect(() => { void load() }, [requestId])

  const upload = async () => {
    if (!prepared?.ok || prepared.items.length === 0) return
    setBusy(true)
    // Una clave por archivo, reutilizada si el usuario reintenta la misma subida (idempotencia).
    const next = new Map(keys)
    const items = prepared.items.map(i => {
      if (!next.has(i.file)) next.set(i.file, crypto.randomUUID())
      return { file: i.file, uploadKey: next.get(i.file)! }
    })
    setKeys(next)
    try {
      const result = await uploadBoardEvidence(projectId, items, deliveredKeys)
      setDeliveredKeys(new Set(result.uploadedKeys))
      if (result.uploaded.length) toast.success(`${result.uploaded.length} evidencia(s) subida(s)`)
      if (result.error) toast.error(result.error)
      if (!result.failed.length) { setResetKey(k => k + 1); setKeys(new Map()); setDeliveredKeys(new Set()) }
      await load(); onChanged?.()
    } catch { toast.error('No se pudo confirmar la entrega de las evidencias pendientes.') }
    finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold text-gray-900 mb-2">Evidencias del ticket</h3>
        {loadError ? <p role="alert" className="text-sm text-red-700">{loadError}</p>
          : files === null ? <p className="text-sm text-gray-400">Cargando…</p> : files.length === 0
          ? <p className="text-sm text-gray-400">Sin evidencias adjuntas.</p>
          : (
            <ul className="space-y-1">
              {files.map(f => (
                <li key={f.name} className="text-sm break-all">
                  {f.url ? <a href={f.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">📎 {f.name}</a> : <span>📎 {f.name}</span>}
                </li>
              ))}
            </ul>
          )}
        <p className="text-xs text-gray-400 mt-2">Límite por ticket: 4 archivos y 2,5 MB en total (incluye los adjuntos del solicitante).</p>
      </div>
      {editable && (
        <div className="border-t pt-4 space-y-3">
          <AttachmentPicker onChange={setPrepared} resetKey={resetKey} />
          <button onClick={() => { void upload() }} disabled={busy || !prepared?.ok || prepared.items.length === 0}
            className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-brand-700 disabled:opacity-50">
            {busy ? 'Subiendo…' : deliveredKeys.size ? 'Reintentar evidencias pendientes' : 'Subir evidencias'}
          </button>
        </div>
      )}
    </div>
  )
}
