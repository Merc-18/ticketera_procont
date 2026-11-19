import { supabase } from './supabase'
import { deliverBoardEvidence, type DeliveryItem } from './attachment-delivery.ts'
import { board } from './api'
export type { DeliveryItem, DeliveryResult } from './attachment-delivery.ts'

/** Evidencias de solicitudes: bucket privado `request-attachments`, carpeta = id de la solicitud. */
export const ATTACHMENT_BUCKET = 'request-attachments'
export const ATTACHMENT_ACCEPT = '.png,.jpg,.jpeg,.webp,.gif,.pdf,.txt,.csv,.xlsx,.xls,.docx,.doc'
// Límites y compresión: attachment-prep.ts (máx. 4 archivos, total ≤ 2.500.000 bytes), iguales al contrato de Codex.

/** Nombre visible: quita el prefijo que asigna el servidor (`<uuid>-`) o el antiguo (`<n>-`). */
export const displayAttachmentName = (objectName: string) =>
  objectName.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, '').replace(/^\d+-/, '')

/**
 * Lista evidencias con enlaces firmados temporales (solo miembros internos; RLS de Storage).
 * Un fallo de lectura lanza un error: nunca se presenta como «sin evidencias».
 */
export async function listRequestAttachments(requestId: string) {
  const { data, error } = await supabase.storage.from(ATTACHMENT_BUCKET).list(requestId, { limit: 20 })
  if (error) throw new Error('No se pudieron cargar las evidencias. Actualiza e inténtalo nuevamente.')
  if (!data?.length) return []
  const paths = data.map(f => `${requestId}/${f.name}`)
  const { data: signed } = await supabase.storage.from(ATTACHMENT_BUCKET).createSignedUrls(paths, 600)
  return data.map((f, i) => ({ name: displayAttachmentName(f.name), url: signed?.[i]?.signedUrl ?? null }))
}

/**
 * Evidencias internas del tablero (M12): reserva por archivo con la sesión del editor
 * (reserve_board_evidence; sin token del cliente, válida también con el ticket bloqueado) y
 * subida a la ruta asignada por el servidor. Mismos límites: 4 archivos / 2.500.000 bytes por ticket.
 */
export const uploadBoardEvidence = (projectId: string, items: DeliveryItem[], completedKeys: ReadonlySet<string> = new Set()) =>
  deliverBoardEvidence(supabase, (file, key) => board.reserveEvidence(projectId, file, key), items, completedKeys)
