import {
  reserveTicketAttachments, uploadReservedTicketAttachment,
} from '../../contracts/ticket-security-client.mjs'

export interface DeliveryItem { file: File; uploadKey: string }
export interface DeliveryResult { uploaded: string[]; failed: string[]; error: string | null }

/**
 * Entrega de evidencias con el contrato de la migración 20261118000500 (Codex):
 * 1) los archivos llegan YA comprimidos (prepareAttachments); 2) se reserva el lote completo
 * con el token privado de seguimiento (atómico: si un archivo no cabe, no se reserva ninguno);
 * 3) se suben solo los archivos autorizados, a la ruta que asignó el servidor.
 * Las `uploadKey` se generan una vez por archivo y se reutilizan en reintentos (idempotencia).
 */
export async function deliverAttachments(client: unknown, requestId: string, trackingToken: string,
  items: DeliveryItem[]): Promise<DeliveryResult> {
  if (items.length === 0) return { uploaded: [], failed: [], error: null }
  let grants
  try {
    grants = await reserveTicketAttachments(client, requestId, trackingToken, items.map(i => i.file), items.map(i => i.uploadKey))
  } catch (err) {
    return { uploaded: [], failed: items.map(i => i.file.name),
      error: err instanceof Error ? err.message : 'No se autorizaron los adjuntos.' }
  }
  const uploaded: string[] = []; const failed: string[] = []
  for (const [index, grant] of grants.entries()) {
    const file = items[index].file
    try { await uploadReservedTicketAttachment(client, grant, file); uploaded.push(file.name) }
    catch { failed.push(file.name) }
  }
  return { uploaded, failed, error: failed.length ? 'Algunos adjuntos no se pudieron subir.' : null }
}


export interface BoardDeliveryResult extends DeliveryResult { uploadedKeys: string[] }
type EvidenceReservation = (file: File, key: string) => Promise<import('../../contracts/ticket-security-client.mjs').AttachmentGrant>

/** Verify a possibly committed upload after a lost response; never overwrite an existing object. */
async function committedEvidence(client: unknown, grant: import('../../contracts/ticket-security-client.mjs').AttachmentGrant) {
  try {
    const slash = grant.path.lastIndexOf('/')
    const parent = grant.path.slice(0, slash), name = grant.path.slice(slash + 1)
    const { data, error } = await (client as { storage: { from(bucket: string): {
      list(prefix: string, options: { limit: number; search: string }): PromiseLike<{
        data: { name: string; metadata?: { size?: number | string; mimetype?: string } }[] | null; error: unknown
      }>
    } } }).storage.from(grant.bucket).list(parent, { limit: 4, search: name })
    if (error) return false
    const match = data?.find(item => item.name === name)
    const size = match?.metadata?.size
    return (typeof size === 'number' || (typeof size === 'string' && /^\d+$/.test(size)))
      && Number(size) === grant.size_bytes && match?.metadata?.mimetype === grant.mime_type
  } catch { return false }
}

/** Internal delivery: retry only unknown/failed keys, including partial successes and lost replies. */
export async function deliverBoardEvidence(client: unknown, reserve: EvidenceReservation, items: DeliveryItem[],
  completedKeys: ReadonlySet<string> = new Set()): Promise<BoardDeliveryResult> {
  const known = new Set(completedKeys)
  const uploaded: string[] = [], failed: string[] = []
  let error: string | null = null
  for (const { file, uploadKey } of items) {
    if (known.has(uploadKey)) continue
    try {
      const grant = await reserve(file, uploadKey)
      try { await uploadReservedTicketAttachment(client, grant, file) }
      catch (uploadError) { if (!await committedEvidence(client, grant)) throw uploadError }
      known.add(uploadKey); uploaded.push(file.name)
    } catch {
      failed.push(file.name)
      error ??= 'No se confirmó la entrega de algunas evidencias. Reintenta los archivos pendientes.'
    }
  }
  return { uploaded, failed, error, uploadedKeys: [...known] }
}
