import { supabase } from './supabase'

/** Evidencias de solicitudes: bucket privado `request-attachments`, carpeta = id de la solicitud. */
export const ATTACHMENT_BUCKET = 'request-attachments'
export const ATTACHMENT_ACCEPT = '.png,.jpg,.jpeg,.webp,.gif,.pdf,.txt,.csv,.xlsx,.xls,.docx,.doc'
// Límites y compresión: ver attachment-prep.ts (máx. 4 archivos, total ≤ 2.500.000 bytes).

const safeName = (name: string) =>
  name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(-120) || 'archivo'

/**
 * Sube evidencias YA preparadas (comprimidas si correspondía) por prepareAttachments().
 * Devuelve los nombres que fallaron.
 */
export async function uploadRequestAttachments(requestId: string, files: File[]): Promise<string[]> {
  const failed: string[] = []
  for (const [i, file] of files.entries()) {
    const { error } = await supabase.storage.from(ATTACHMENT_BUCKET)
      .upload(`${requestId}/${i + 1}-${safeName(file.name)}`, file, { upsert: false, contentType: file.type || undefined })
    if (error) failed.push(file.name)
  }
  return failed
}

/** Lista evidencias con enlaces firmados temporales (solo miembros internos; RLS de Storage). */
export async function listRequestAttachments(requestId: string) {
  const { data, error } = await supabase.storage.from(ATTACHMENT_BUCKET).list(requestId, { limit: 20 })
  if (error || !data?.length) return []
  const paths = data.map(f => `${requestId}/${f.name}`)
  const { data: signed } = await supabase.storage.from(ATTACHMENT_BUCKET).createSignedUrls(paths, 600)
  return data.map((f, i) => ({ name: f.name.replace(/^\d+-/, ''), url: signed?.[i]?.signedUrl ?? null }))
}
