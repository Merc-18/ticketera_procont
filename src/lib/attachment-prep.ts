// Preparación de adjuntos en el navegador ANTES de reservar o subir (reglas aprobadas 18/11/2026):
// máximo 4 archivos, total combinado ≤ 2.500.000 bytes; solo las imágenes se comprimen,
// los documentos (PDF, Word, Excel, texto…) se envían sin modificar.
// La lógica de planificación es pura (testeable en Node); la compresión real usa Canvas.

export const MAX_ATTACHMENTS = 4
export const MAX_TOTAL_BYTES = 2_500_000
/** Tamaño máximo de una imagen original que se intenta procesar (memoria del navegador). */
export const MAX_SOURCE_IMAGE_BYTES = 25 * 1024 * 1024

/** Imágenes que se pueden recomprimir sin perder información esencial (GIF puede ser animado: se conserva). */
const COMPRESSIBLE = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/bmp'])
export const isCompressibleImage = (type: string) => COMPRESSIBLE.has(type.toLowerCase())

/**
 * Niveles de compresión, de menor a mayor pérdida. Se conserva la proporción y nunca se
 * baja de 1600 px en el lado mayor, para que el texto de capturas siga siendo legible.
 */
export const LEVELS: { maxSide: number | null; quality: number }[] = [
  { maxSide: null, quality: 0.9 },
  { maxSide: 2560, quality: 0.85 },
  { maxSide: 2048, quality: 0.8 },
  { maxSide: 1600, quality: 0.75 },
  { maxSide: 1600, quality: 0.65 },
]

export interface PreparedAttachment {
  file: File            // archivo a subir (original o comprimido)
  originalName: string
  originalSize: number
  compressed: boolean
  kind: 'image' | 'document'
}

export interface PreparationResult {
  items: PreparedAttachment[]
  totalBytes: number
  originalBytes: number
  ok: boolean
  error: string | null
}

export type Compressor = (file: File, level: { maxSide: number | null; quality: number }) => Promise<File | null>

const sum = (xs: { size: number }[]) => xs.reduce((n, x) => n + x.size, 0)

export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`
  if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(0)} KB`
  return `${(bytes / 1_000_000).toFixed(2)} MB`
}

/**
 * Ajusta la selección al límite. Si el total ya cabe, no modifica nada. Si no, recomprime solo
 * las imágenes, nivel por nivel (siempre desde el original y quedándose con la versión menor),
 * hasta cumplir el límite. Si ni así cabe, devuelve ok=false con un mensaje claro.
 */
export async function prepareAttachments(files: File[], compress: Compressor, limit = MAX_TOTAL_BYTES): Promise<PreparationResult> {
  const originalBytes = sum(files)
  const base = (f: File): PreparedAttachment => ({ file: f, originalName: f.name, originalSize: f.size, compressed: false,
    kind: isCompressibleImage(f.type) ? 'image' : 'document' })
  let items = files.map(base)
  const fail = (error: string): PreparationResult => ({ items, totalBytes: sum(items.map(i => i.file)), originalBytes, ok: false, error })

  if (files.length > MAX_ATTACHMENTS) return fail(`Puedes adjuntar hasta ${MAX_ATTACHMENTS} archivos.`)
  const huge = files.find(f => isCompressibleImage(f.type) && f.size > MAX_SOURCE_IMAGE_BYTES)
  if (huge) return fail(`«${huge.name}» es demasiado grande para procesarla (máx. ${formatBytes(MAX_SOURCE_IMAGE_BYTES)}).`)
  if (originalBytes <= limit) return { items, totalBytes: originalBytes, originalBytes, ok: true, error: null }

  const docsBytes = sum(files.filter(f => !isCompressibleImage(f.type)))
  if (docsBytes > limit) {
    return fail(`Los documentos suman ${formatBytes(docsBytes)} y superan el límite de ${formatBytes(limit)}. ` +
      'Los documentos no se comprimen: reduce o quita alguno.')
  }
  if (!files.some(f => isCompressibleImage(f.type))) {
    return fail(`El total (${formatBytes(originalBytes)}) supera el límite de ${formatBytes(limit)}. Quita algún archivo.`)
  }

  for (const level of LEVELS) {
    items = await Promise.all(files.map(async f => {
      if (!isCompressibleImage(f.type)) return base(f)
      const out = await compress(f, level).catch(() => null)
      return out && out.size < f.size ? { ...base(f), file: out, compressed: true } : base(f)
    }))
    const total = sum(items.map(i => i.file))
    if (total <= limit) return { items, totalBytes: total, originalBytes, ok: true, error: null }
  }
  const total = sum(items.map(i => i.file))
  return { items, totalBytes: total, originalBytes, ok: false,
    error: `Aun comprimiendo las imágenes, el total es ${formatBytes(total)} y supera el límite de ${formatBytes(limit)}. ` +
      'Quita algún archivo o adjunta capturas más pequeñas.' }
}

/** Metadatos de los adjuntos preparados, listos para un contrato de reserva previo a la subida. */
export const attachmentManifest = (items: PreparedAttachment[]) =>
  items.map(i => ({ name: i.file.name, size: i.file.size, type: i.file.type || 'application/octet-stream' }))

/** Compresor de navegador: Canvas → WebP (o JPEG si el navegador no codifica WebP). Conserva proporción. */
export const canvasCompressor: Compressor = async (file, { maxSide, quality }) => {
  const bitmap = await createImageBitmap(file)
  try {
    const scale = maxSide ? Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height)) : 1
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width; canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#FFFFFF'           // fondo blanco para transparencias (JPEG no tiene alfa)
    ctx.fillRect(0, 0, width, height)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0, width, height)
    const encode = (type: string) => new Promise<Blob | null>(res => canvas.toBlob(res, type, quality))
    let blob = await encode('image/webp')
    if (!blob || blob.type !== 'image/webp') blob = await encode('image/jpeg')
    if (!blob) return null
    const ext = blob.type === 'image/webp' ? 'webp' : 'jpg'
    const name = file.name.replace(/\.[^.]+$/, '') + '.' + ext
    return new File([blob], name, { type: blob.type, lastModified: Date.now() })
  } finally {
    bitmap.close()
  }
}
