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

