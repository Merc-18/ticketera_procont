import Icon from '../ui/Icon'
import { useEffect, useId, useRef, useState } from 'react'
import {
  MAX_ATTACHMENTS, MAX_TOTAL_BYTES, canvasCompressor, formatBytes, prepareAttachments, type PreparationResult,
} from '../../lib/attachment-prep'
import {
  ATTACHMENT_ACCEPT, ATTACHMENT_FORMATS_LABEL, canPreview, clipboardFiles, dragHasFiles, extensionOf, namePastedImage, screenIncoming,
} from '../../lib/attachment-intake'

interface Props {
  /** Notifica el resultado preparado (o null mientras procesa). El formulario solo envía si ok=true. */
  onChange: (result: PreparationResult | null) => void
  resetKey?: number
  /** El formulario está enviando: la lista queda de solo lectura y se indica la carga. */
  sending?: boolean
}

type Source = 'picker' | 'drop' | 'paste'
interface Entry { id: number; file: File; preview: string | null; source: Source }
interface Notice { id: number; tone: 'ok' | 'error' | 'info'; text: string }

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent)
const PASTE_KEYS = isMac ? 'Cmd + V' : 'Ctrl + V'

/**
 * Adjuntos del ticket: tres formas de añadir — «Seleccionar archivos», arrastrar y soltar, o pegar con Ctrl/Cmd + V
 * con el foco en la zona. Los tres orígenes pasan por el mismo filtro (attachment-intake.ts) y por la misma
 * preparación (attachment-prep.ts: hasta 4 archivos, 2,5 MB en total; solo se comprimen imágenes). Nada se sube
 * aquí: los archivos quedan pendientes hasta el envío del formulario, que usa el flujo de reservas existente.
 * Emil: sin animación con teclado; el estado de arrastre cambia color y borde (150 ms), no posición.
 */
export default function AttachmentPicker({ onChange, resetKey, sending = false }: Props) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [result, setResult] = useState<PreparationResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [screening, setScreening] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [notices, setNotices] = useState<Notice[]>([])
  const input = useRef<HTMLInputElement>(null)
  const zone = useRef<HTMLDivElement>(null)
  const run = useRef(0)
  const seq = useRef(0)
  const depth = useRef(0)
  const entriesRef = useRef<Entry[]>([])
  entriesRef.current = entries
  const uid = useId()
  const hintId = `${uid}-hint`, titleId = `${uid}-title`

  const files = entries.map(e => e.file)
  const full = entries.length >= MAX_ATTACHMENTS
  /** Bloqueado por el formulario (fieldset deshabilitado durante el envío) o por la prop `sending`. */
  const locked = () => sending || !!zone.current?.closest('fieldset:disabled')

  // Restablecer al enviar con éxito (resetKey) y liberar vistas previas al desmontar.
  useEffect(() => {
    entriesRef.current.forEach(e => e.preview && URL.revokeObjectURL(e.preview))
    setEntries([]); setResult(null); setNotices([])
  }, [resetKey])
  useEffect(() => () => entriesRef.current.forEach(e => e.preview && URL.revokeObjectURL(e.preview)), [])

  useEffect(() => {
    const id = ++run.current
    if (files.length === 0) { setResult(null); setBusy(false); onChange({ items: [], totalBytes: 0, originalBytes: 0, ok: true, error: null }); return }
    setBusy(true); onChange(null)
    void prepareAttachments(files, canvasCompressor).then(r => {
      if (id !== run.current) return   // descartar resultados de una selección anterior
      setResult(r); setBusy(false); onChange(r)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries])

  // Fuera de la zona, soltar un archivo no debe abrirlo en la pestaña ni alterar el formulario.
  useEffect(() => {
    const outside = (e: DragEvent) => !!e.target && !zone.current?.contains(e.target as Node)
    const over = (e: DragEvent) => {
      if (!dragHasFiles(e.dataTransfer) || !outside(e)) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'none'
    }
    const drop = (e: DragEvent) => {
      if (!dragHasFiles(e.dataTransfer) || !outside(e)) return
      e.preventDefault()
      depth.current = 0; setDragActive(false)
      say([{ tone: 'info', text: 'Suelta los archivos dentro de la zona de adjuntos para añadirlos.' }])
    }
    const reset = () => { depth.current = 0; setDragActive(false) }
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    window.addEventListener('dragend', reset)
    return () => { window.removeEventListener('dragover', over); window.removeEventListener('drop', drop); window.removeEventListener('dragend', reset) }
  }, [])

  function say(items: Omit<Notice, 'id'>[]) { setNotices(items.map(n => ({ ...n, id: ++seq.current }))) }

  async function intake(incoming: File[], source: Source) {
    if (!incoming.length) return
    if (locked()) { say([{ tone: 'info', text: 'Espera a que termine el envío para modificar los adjuntos.' }]); return }
    setScreening(true)
    try {
      const now = new Date()
      const named = source === 'paste' ? incoming.map((f, i) => namePastedImage(f, now, i)) : incoming
      const { accepted, rejected } = await screenIncoming(entriesRef.current.map(e => e.file), named)
      if (accepted.length) {
        setEntries(prev => [...prev, ...accepted.map(file => ({
          id: ++seq.current, file, source, preview: canPreview(file) ? URL.createObjectURL(file) : null,
        }))])
      }
      const how = source === 'paste' ? ' desde el portapapeles' : ''
      const added: Omit<Notice, 'id'>[] = accepted.length
        ? [{ tone: 'ok', text: accepted.length === 1 ? `Se añadió «${accepted[0].name}»${how}.` : `Se añadieron ${accepted.length} archivos${how}.` }]
        : []
      say([...added, ...rejected.map(r => ({ tone: 'error' as const, text: r.message }))])
    } finally { setScreening(false) }
  }

  const remove = (id: number) => {
    if (locked()) return
    const entry = entriesRef.current.find(e => e.id === id)
    if (!entry) return
    if (entry.preview) URL.revokeObjectURL(entry.preview)
    setEntries(prev => prev.filter(e => e.id !== id))
    say([{ tone: 'info', text: `Se quitó «${entry.file.name}».` }])
    zone.current?.focus({ preventScroll: true })   // el foco no se pierde al desaparecer el botón
  }

  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    if (target.closest('input:not([type=file]), textarea, [contenteditable=true]')) return
    const pasted = clipboardFiles(e.clipboardData)
    e.preventDefault()   // nunca se toma texto del portapapeles como documento
    if (pasted.length) { void intake(pasted, 'paste'); return }
    say([{ tone: 'info', text: 'El portapapeles no contiene archivos que el navegador pueda leer. Si copiaste un archivo desde tu carpeta y tu navegador no lo permite, arrástralo aquí o usa «Seleccionar archivos».' }])
  }
  const onDragEnter = (e: React.DragEvent) => {
    if (!dragHasFiles(e.dataTransfer)) return
    e.preventDefault(); depth.current += 1; setDragActive(true)
  }
  const onDragOver = (e: React.DragEvent) => {
    if (!dragHasFiles(e.dataTransfer)) return
    e.preventDefault(); e.dataTransfer.dropEffect = locked() || full ? 'none' : 'copy'
  }
  const onDragLeave = (e: React.DragEvent) => {
    if (!dragHasFiles(e.dataTransfer)) return
    depth.current = Math.max(0, depth.current - 1)
    if (depth.current === 0) setDragActive(false)
  }
  const onDrop = (e: React.DragEvent) => {
    if (!dragHasFiles(e.dataTransfer)) return
    e.preventDefault(); e.stopPropagation()
    depth.current = 0; setDragActive(false)
    void intake(Array.from(e.dataTransfer.files ?? []), 'drop')
  }
  const onZoneKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== zone.current) return
    if ((e.key === 'Enter' || e.key === ' ') && !full && !locked()) { e.preventDefault(); input.current?.click() }
  }

  const total = result?.totalBytes ?? files.reduce((n, f) => n + f.size, 0)
  const pct = Math.min(100, Math.round((total / MAX_TOTAL_BYTES) * 100))
  const over = files.length > MAX_ATTACHMENTS || (result !== null && !result.ok)
  const state = sending ? 'sending' : dragActive ? 'drag' : entries.length ? 'filled' : 'empty'

  return (
    <div className="attachment-picker" data-state={state}>
      <div
        ref={zone}
        className="attachment-dropzone"
        data-drag={dragActive || undefined}
        data-full={full || undefined}
        tabIndex={0}
        role="group"
        aria-labelledby={titleId}
        aria-describedby={hintId}
        onPaste={onPaste}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onKeyDown={onZoneKey}
      >
        <span className="attachment-drop-icon" aria-hidden="true"><Icon name="upload" size={20} /></span>
        <div className="attachment-drop-copy">
          <p id={titleId} className="attachment-drop-title">
            {dragActive ? 'Suelta los archivos para añadirlos'
              : full ? `Llegaste al máximo de ${MAX_ATTACHMENTS} archivos`
              : <>Puedes arrastrar tus archivos aquí o pegarlos con <kbd>{PASTE_KEYS}</kbd></>}
          </p>
          <p id={hintId} className="attachment-drop-hint">
            {full ? 'Quita un archivo para añadir otro.'
              : `Hasta ${MAX_ATTACHMENTS} archivos, ${formatBytes(MAX_TOTAL_BYTES)} en total. ${ATTACHMENT_FORMATS_LABEL}. Las imágenes se comprimen automáticamente si es necesario; los documentos se envían sin cambios.`}
          </p>
        </div>
        <div className="attachment-drop-action">
          <input id="ticket-attachments" aria-label="Seleccionar archivos para adjuntar" ref={input} type="file" multiple accept={ATTACHMENT_ACCEPT}
            disabled={full || sending}
            onChange={e => { const picked = Array.from(e.target.files ?? []); e.target.value = ''; void intake(picked, 'picker') }}
            className="sr-only" />
          <label htmlFor="ticket-attachments" className="attachment-trigger ui-button ui-button-secondary cursor-pointer">
            <Icon name="upload" size={18} /> Seleccionar archivos
          </label>
        </div>
      </div>

      <div className="attachment-notices" role="status" aria-live="polite" hidden={!notices.length && !screening}>
        {screening && <p className="attachment-notice is-info">Revisando archivos…</p>}
        {notices.map(n => (
          <p key={n.id} className={`attachment-notice is-${n.tone}`}>
            <Icon name={n.tone === 'error' ? 'alert' : n.tone === 'ok' ? 'check' : 'circle'} size={14} className="shrink-0" aria-hidden="true" />
            <span>{n.text}</span>
          </p>
        ))}
      </div>

      {entries.length > 0 && (
        <div className="attachment-list" aria-busy={busy || sending}>
          <ul aria-label="Archivos pendientes de adjuntar">
            {entries.map((entry, i) => {
              const f = entry.file
              const item = result?.items[i]
              const ext = extensionOf(f.name).toUpperCase() || 'ARCHIVO'
              const status = sending ? { tone: 'info', text: 'Enviando…' }
                : busy ? { tone: 'info', text: 'Preparando…' }
                : result && !result.ok ? { tone: 'error', text: 'Revisa el límite' }
                : item?.compressed ? { tone: 'ok', text: 'Comprimida' }
                : { tone: 'ok', text: 'Lista' }
              return (
                <li key={entry.id} className="attachment-file">
                  {entry.preview
                    ? <img className="attachment-thumb" src={entry.preview} alt="" width={40} height={40} />
                    : <span className="attachment-type" aria-hidden="true">{ext.slice(0, 4)}</span>}
                  <span className="attachment-file-body">
                    <span className="attachment-file-name" title={f.name}>{f.name}</span>
                    <span className="attachment-file-meta">
                      <span>{ext}</span>
                      <span aria-hidden="true">·</span>
                      {item?.compressed
                        ? <span>{formatBytes(item.originalSize)} → <strong className="text-green-700">{formatBytes(item.file.size)}</strong></span>
                        : <span>{formatBytes(f.size)}</span>}
                      {entry.source === 'paste' && <><span aria-hidden="true">·</span><span>Pegado</span></>}
                    </span>
                  </span>
                  <span className={`attachment-status is-${status.tone}`}>{status.text}</span>
                  <button type="button" onClick={() => remove(entry.id)} disabled={sending} className="attachment-remove" aria-label={`Quitar ${f.name}`}>
                    <Icon name="close" size={16} />
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="attachment-total">
            <div className="flex justify-between gap-3 text-[13px]">
              <span className="text-gray-600">{sending ? 'Enviando adjuntos con la solicitud…' : busy ? 'Optimizando imágenes…' : `${entries.length} de ${MAX_ATTACHMENTS} archivos · tamaño total a enviar`}</span>
              <span className={over ? 'text-red-700 font-medium' : 'text-gray-800 font-medium'}>
                {formatBytes(total)} / {formatBytes(MAX_TOTAL_BYTES)}
              </span>
            </div>
            <div className="attachment-meter">
              <div className={over ? 'is-over' : ''} style={{ transform: `scaleX(${pct / 100})` }} />
            </div>
            {result && result.ok && result.originalBytes > result.totalBytes && (
              <p className="text-[13px] text-green-700">Imágenes optimizadas: {formatBytes(result.originalBytes)} → {formatBytes(result.totalBytes)}.</p>
            )}
          </div>
        </div>
      )}
      {result?.error && <p role="alert" className="attachment-error">{result.error}</p>}
    </div>
  )
}
