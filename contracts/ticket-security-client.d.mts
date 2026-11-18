// Tipos del adaptador de Codex (ticket-security-client.mjs) para el frontend TypeScript.
export declare const MAX_ATTACHMENT_FILES: number
export declare const MAX_ATTACHMENT_TOTAL_BYTES: number
export interface AttachmentGrant { bucket: string; path: string; mime_type: string; size_bytes: number; expires_at: string }
export declare function reserveTicketAttachments(client: unknown, requestId: string, trackingToken: string,
  files: File[], uploadKeys: string[]): Promise<AttachmentGrant[]>
export declare function uploadReservedTicketAttachment(client: unknown, grant: AttachmentGrant, file: File):
  Promise<{ path: string; expires_at: string }>
export declare function uploadTicketAttachment(client: unknown, requestId: string, trackingToken: string,
  file: File, uploadKey: string): Promise<{ path: string; expires_at: string }>
