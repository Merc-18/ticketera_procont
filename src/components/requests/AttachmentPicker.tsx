import Icon from '../ui/Icon'
import { useEffect, useRef, useState } from 'react'
import { ATTACHMENT_ACCEPT } from '../../lib/attachments'
import {
  MAX_ATTACHMENTS, MAX_TOTAL_BYTES, canvasCompressor, formatBytes, prepareAttachments, type PreparationResult,
} from '../../lib/attachment-prep'

interface Props {
  /** Notifica el resultado preparado (o null mientras procesa). El formulario solo envía si ok=true. */
  onChange: (result: PreparationResult | null) => void
  resetKey?: number
}

/**
 * Selección y revisión de adjuntos. Hasta 4 archivos; si el total supera 2,5 MB se comprimen
 * solo las imágenes en el navegador. Muestra tamaño original y final antes de enviar.
 */
export default function AttachmentPicker({ onChange, resetKey }: Props) {
  const [files, setFiles] = useState<File[]>([])
  const [result, setResult] = useState<PreparationResult | null>(null)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const run = useRef(0)

  useEffect(() => { setFiles([]); setResult(null) }, [resetKey])

  useEffect(() => {
    const id = ++run.current
    if (files.length === 0) { setResult(null); setBusy(false); onChange({ items: [], totalBytes: 0, originalBytes: 0, ok: true, error: null }); return }
    setBusy(true); onChange(null)
    void prepareAttachments(files, canvasCompressor).then(r => {
      if (id !== run.current) return   // descartar resultados de una selección anterior
      setResult(r); setBusy(false); onChange(r)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files])

  const add = (list: FileList | null) => {
    const picked = Array.from(list ?? [])
    setFiles(prev => [...prev, ...picked])   // si se excede el máximo se muestra el error y no se envía
    if (input.current) input.current.value = ''
  }
  const remove = (index: number) => setFiles(prev => prev.filter((_, i) => i !== index))
  const total = result?.totalBytes ?? files.reduce((n, f) => n + f.size, 0)
  const pct = Math.min(100, Math.round((total / MAX_TOTAL_BYTES) * 100))
  const over = files.length > MAX_ATTACHMENTS || (result !== null && !result.ok)

  return (
    <div className="attachment-picker space-y-3">
      <input id="ticket-attachments" aria-label="Adjuntar capturas o documentos" ref={input} type="file" multiple accept={ATTACHMENT_ACCEPT} disabled={files.length >= MAX_ATTACHMENTS}
        onChange={e => add(e.target.files)}
        className="sr-only" />
      <label htmlFor="ticket-attachments" className="attachment-trigger ui-button ui-button-secondary cursor-pointer">
        <Icon name="upload" size={18} /> Seleccionar archivos
      </label>
      <p className="text-xs text-gray-600">
        Hasta {MAX_ATTACHMENTS} archivos, {formatBytes(MAX_TOTAL_BYTES)} en total. Las imágenes se comprimen automáticamente si es necesario; los documentos se envían sin cambios.
      </p>

      {files.length > 0 && (
        <div className="border rounded-lg divide-y">
          {files.map((f, i) => {
            const item = result?.items[i]
            return (
              <div key={`${f.name}-${i}`} className="attachment-file flex items-center gap-3 px-3 py-2 text-sm">
                <Icon name="file" />
                <span className="flex-1 min-w-0 truncate text-gray-800" title={f.name}>{f.name}</span>
                <span className="text-xs text-gray-500 whitespace-nowrap">
                  {item?.compressed
                    ? <>{formatBytes(item.originalSize)} → <strong className="text-green-700">{formatBytes(item.file.size)}</strong></>
                    : formatBytes(f.size)}
                </span>
                {item?.compressed && <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-700">comprimida</span>}
                <button type="button" onClick={() => remove(i)} className="text-gray-400 hover:text-red-600" aria-label={`Quitar ${f.name}`}>✕</button>
              </div>
            )
          })}
          <div className="px-3 py-2 space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-gray-600">{busy ? 'Optimizando imágenes…' : 'Tamaño total a enviar'}</span>
              <span className={over ? 'text-red-700 font-semibold' : 'text-gray-800 font-semibold'}>
                {formatBytes(total)} / {formatBytes(MAX_TOTAL_BYTES)}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
              <div className={`h-full ${over ? 'bg-red-500' : 'bg-accent-400'}`} style={{ width: '100%', transform: `scaleX(${pct / 100})`, transformOrigin: 'left' }} />
            </div>
            {result && result.ok && result.originalBytes > result.totalBytes && (
              <p className="text-xs text-green-700">Imágenes optimizadas: {formatBytes(result.originalBytes)} → {formatBytes(result.totalBytes)}.</p>
            )}
          </div>
        </div>
      )}
      {result?.error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{result.error}</p>}
    </div>
  )
}
