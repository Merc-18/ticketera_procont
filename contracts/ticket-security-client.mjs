/** Prepared adapter; not imported into Claude's frontend until integration review.
 * uploadKey must be generated once and retained per file for network retries.
 * No privileged key. Tracking token is sent only to RPC, never in object paths.
 */
export async function uploadTicketAttachment(client, requestId, trackingToken, file, uploadKey) {
  const mimeByExtension = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
    gif: 'image/gif', pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel', doc: 'application/msword' }
  const { data: grant, error } = await client.rpc('reserve_request_attachment', {
    p_request_id: requestId, p_tracking_token: trackingToken, p_upload_key: uploadKey,
    p_file_name: file.name, p_size_bytes: file.size,
    p_mime_type: file.type || mimeByExtension[file.name.split('.').at(-1)?.toLowerCase()] || 'application/octet-stream',
  })
  if (error || !grant) throw new Error('No se autorizó la reserva del adjunto. Conserva su identificador para revisión.')
  const result = await client.storage.from(grant.bucket).upload(grant.path, file, {
    upsert: false, contentType: grant.mime_type,
  })
  if (result.error) throw new Error('No se confirmó la subida del adjunto. Conserva el identificador y revisa antes de repetir.')
  return { path: grant.path, expires_at: grant.expires_at }
}
