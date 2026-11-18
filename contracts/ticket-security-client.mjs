/** Prepared adapter; not imported into Claude's frontend until integration review.
 * uploadKey must be generated once and retained per file for network retries.
 * No privileged key. Tracking token is sent only to RPC, never in object paths.
 */
export const MAX_ATTACHMENT_FILES = 4
export const MAX_ATTACHMENT_TOTAL_BYTES = 2500000

function metadata(file, uploadKey) {
  const mimeByExtension = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
    gif: 'image/gif', pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel', doc: 'application/msword' }
  return { upload_key: uploadKey, file_name: file.name, size_bytes: file.size,
    mime_type: file.type || mimeByExtension[file.name.split('.').at(-1)?.toLowerCase()] || 'application/octet-stream' }
}

/** Call AFTER image compression. Document File/Blob objects pass through unchanged. */
export async function reserveTicketAttachments(client, requestId, trackingToken, files, uploadKeys) {
  if (files.length > MAX_ATTACHMENT_FILES || files.length !== uploadKeys.length ||
      files.some(file => !Number.isSafeInteger(file.size) || file.size < 0) ||
      files.reduce((sum, file) => sum + file.size, 0) > MAX_ATTACHMENT_TOTAL_BYTES) {
    throw new Error('Máximo 4 archivos y 2.500.000 bytes combinados después de comprimir las imágenes.')
  }
  if (!files.length) return []
  const { data, error } = await client.rpc('reserve_request_attachments', {
    p_request_id: requestId, p_tracking_token: trackingToken,
    p_files: files.map((file, index) => metadata(file, uploadKeys[index])),
  })
  if (error || !Array.isArray(data) || data.length !== files.length) {
    throw new Error('No se autorizó el lote de adjuntos. Conserva sus identificadores para revisión.')
  }
  return data
}

export async function uploadReservedTicketAttachment(client, grant, file) {
  if (file.size !== grant.size_bytes || metadata(file, '').mime_type !== grant.mime_type) {
    throw new Error('El archivo cambió después de reservarlo; no se subió.')
  }
  const result = await client.storage.from(grant.bucket).upload(grant.path, file, {
    upsert: false, contentType: grant.mime_type,
  })
  if (result.error) throw new Error('No se confirmó la subida del adjunto. Conserva el identificador y revisa antes de repetir.')
  return { path: grant.path, expires_at: grant.expires_at }
}

// Original single-file adapter stays compatible; PostgreSQL enforces total quota.
export async function uploadTicketAttachment(client, requestId, trackingToken, file, uploadKey) {
  const item = metadata(file, uploadKey)
  const { data: grant, error } = await client.rpc('reserve_request_attachment', {
    p_request_id: requestId, p_tracking_token: trackingToken, p_upload_key: uploadKey,
    p_file_name: item.file_name, p_size_bytes: item.size_bytes, p_mime_type: item.mime_type,
  })
  if (error || !grant) throw new Error('No se autorizó la reserva del adjunto. Conserva su identificador para revisión.')
  return uploadReservedTicketAttachment(client, grant, file)
}

// Shared MIME inference; documents remain the original File object.
export { metadata as attachmentMetadata }
