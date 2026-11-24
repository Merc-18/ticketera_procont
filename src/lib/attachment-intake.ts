// Entrada de adjuntos (24/11/2026): un único filtro para los tres orígenes — explorador, arrastrar y soltar,
// y portapapeles (Ctrl/Cmd + V). No crea límites nuevos: refleja el contrato vigente.
//   · Extensiones: ATTACHMENT_ACCEPT (selector de archivos existente).
//   · MIME: los del bucket privado `request-attachments` (migración 20261118000400_request_intake.sql);
//     el tipo se resuelve igual que el adaptador de reservas (contracts/ticket-security-client.mjs).
//   · Cantidad y tamaño: attachment-prep.ts (4 archivos; 2.500.000 bytes por archivo y en total; las imágenes
//     se comprimen y se aceptan hasta MAX_SOURCE_IMAGE_BYTES antes de comprimir).
// El servidor sigue validando todo (reserva, Storage y RLS); este filtro solo evita errores previsibles.
import { MAX_ATTACHMENTS, MAX_SOURCE_IMAGE_BYTES, MAX_TOTAL_BYTES, formatBytes, isCompressibleImage } from './attachment-prep.ts'

export const ATTACHMENT_ACCEPT = '.png,.jpg,.jpeg,.webp,.gif,.pdf,.txt,.csv,.xlsx,.xls,.docx,.doc'
const EXTENSIONS = new Set(ATTACHMENT_ACCEPT.split(',').map(e => e.slice(1)))

/** MIME por extensión: la misma tabla que usa el adaptador de reservas cuando el navegador no informa el tipo. */
export const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', doc: 'application/msword',
}
/** MIME permitidos por el bucket (allowed_mime_types). */
export const ATTACHMENT_MIME_TYPES = new Set(Object.values(MIME_BY_EXTENSION))

/** Formatos legibles para la ayuda de la zona de adjuntos. */
export const ATTACHMENT_FORMATS_LABEL = 'PNG, JPG, WEBP, GIF, PDF, TXT, CSV, Excel y Word'

export const extensionOf = (name: string) => {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}
export const mimeOf = (file: { name: string; type: string }) => file.type || MIME_BY_EXTENSION[extensionOf(file.name)] || 'application/octet-stream'

/** Vista previa solo para imágenes que el navegador muestra de forma nativa. */
const PREVIEWABLE = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
export const canPreview = (file: { name: string; type: string }) => PREVIEWABLE.has(mimeOf(file))

export type RejectCode = 'format' | 'size' | 'duplicate' | 'limit'
export interface Rejection { name: string; code: RejectCode; message: string }
export interface Screening { accepted: File[]; rejected: Rejection[] }

/** Huella para detectar duplicados: tamaño + SHA-256 del contenido (o nombre + tamaño si no hay WebCrypto). */
export type Fingerprint = (file: File) => Promise<string>
export const contentFingerprint: Fingerprint = async file => {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) return `n:${file.name.toLowerCase()}:${file.size}`
  try {
    const digest = new Uint8Array(await subtle.digest('SHA-256', await file.arrayBuffer()))
    return `h:${file.size}:${Array.from(digest, b => b.toString(16).padStart(2, '0')).join('')}`
  } catch { return `n:${file.name.toLowerCase()}:${file.size}` }
}

/** Revisa un archivo aislado: formato y tamaño (sin contar los demás). */
export function checkFile(file: File): Rejection | null {
  const ext = extensionOf(file.name)
  if (!EXTENSIONS.has(ext) || !ATTACHMENT_MIME_TYPES.has(mimeOf(file))) {
    return { name: file.name, code: 'format', message: `«${file.name}» no tiene un formato permitido. Usa ${ATTACHMENT_FORMATS_LABEL}.` }
  }
  if (isCompressibleImage(mimeOf(file))) {
    if (file.size > MAX_SOURCE_IMAGE_BYTES) {
      return { name: file.name, code: 'size', message: `«${file.name}» pesa ${formatBytes(file.size)}: es demasiado grande para procesarla (máx. ${formatBytes(MAX_SOURCE_IMAGE_BYTES)}).` }
    }
  } else if (file.size > MAX_TOTAL_BYTES) {
    return { name: file.name, code: 'size', message: `«${file.name}» pesa ${formatBytes(file.size)} y supera el máximo de ${formatBytes(MAX_TOTAL_BYTES)}. Los documentos no se comprimen.` }
  }
  return null
}

/**
 * Filtra los archivos entrantes contra los ya pendientes: formato → tamaño → duplicado → cantidad.
 * Nunca modifica los existentes; lo rechazado no entra en la lista y se explica con su motivo.
 */
export async function screenIncoming(existing: File[], incoming: File[], fingerprint: Fingerprint = contentFingerprint): Promise<Screening> {
  const accepted: File[] = []
  const rejected: Rejection[] = []
  const prints = await Promise.all(existing.map(fingerprint))
  const seen = new Map(prints.map((p, i) => [p, existing[i].name]))
  for (const file of incoming) {
    const problem = checkFile(file)
    if (problem) { rejected.push(problem); continue }
    const print = await fingerprint(file)
    const twin = seen.get(print)
    if (twin !== undefined) {
      rejected.push({ name: file.name, code: 'duplicate', message: twin === file.name
        ? `«${file.name}» ya está en la lista; no se añadió de nuevo.`
        : `«${file.name}» tiene el mismo contenido que «${twin}», que ya está en la lista; no se añadió de nuevo.` })
      continue
    }
    if (existing.length + accepted.length >= MAX_ATTACHMENTS) {
      rejected.push({ name: file.name, code: 'limit', message: `«${file.name}» no se añadió: puedes adjuntar hasta ${MAX_ATTACHMENTS} archivos.` })
      continue
    }
    seen.set(print, file.name)
    accepted.push(file)
  }
  return { accepted, rejected }
}

/** Nombre legible para una imagen pegada sin nombre propio (los navegadores la llaman «image.png»). */
export function namePastedImage(file: File, now = new Date(), index = 0): File {
  const generic = !file.name || /^image\.(png|jpe?g|gif|webp)$/i.test(file.name)
  if (!generic) return file
  const ext = extensionOf(file.name) || ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' } as Record<string, string>)[file.type] || 'png'
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return new File([file], `captura-${stamp}${index ? `-${index + 1}` : ''}.${ext}`, { type: file.type || MIME_BY_EXTENSION[ext], lastModified: file.lastModified })
}

/** Archivos reales que expone un evento de portapapeles (nunca texto ni rutas). */
export function clipboardFiles(data: Pick<DataTransfer, 'files' | 'items'> | null | undefined): File[] {
  if (!data) return []
  const direct = Array.from(data.files ?? [])
  if (direct.length) return direct
  const out: File[] = []
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind === 'file') { const f = item.getAsFile(); if (f) out.push(f) }
  }
  return out
}

/** ¿El arrastre transporta archivos? (no texto, enlaces ni tarjetas del tablero) */
export const dragHasFiles = (data: Pick<DataTransfer, 'types'> | null | undefined) => !!data && Array.from(data.types ?? []).includes('Files')
