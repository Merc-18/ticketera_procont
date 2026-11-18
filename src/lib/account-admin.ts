import { supabase } from './supabase'
import type { User } from '../types/database.types'

export type AccountInput = { email: string; full_name: string; role: User['role'] }

/** Rechazos previos a cualquier reserva: es seguro corregir los datos y reintentar con otra solicitud. */
const NO_JOB_CREATED = new Set(['authentication_required', 'origin_denied', 'password_policy',
  'invalid_request', 'forbidden', 'json_required', 'request_too_large', 'method_not_allowed'])

const MESSAGES: Record<string, string> = {
  authentication_required: 'Tu sesión no es válida o expiró. Vuelve a iniciar sesión.',
  origin_denied: 'Este origen no está autorizado para administrar cuentas.',
  password_policy: 'La contraseña debe tener entre 12 y 128 caracteres.',
  invalid_request: 'Revisa el nombre, el correo y el rol.',
  forbidden: 'No tienes permiso para crear cuentas con ese rol.',
}

export class AccountAdminError extends Error {
  constructor(message: string, readonly code: string, readonly noJobCreated: boolean) { super(message) }
}

export async function administerAccount(input:
  | (AccountInput & { action: 'create'; password: string; request_id: string })
  | (AccountInput & { action: 'invite'; request_id: string })
  | { action: 'resume'; request_id: string }) {
  const { data, error } = await supabase.functions.invoke('admin-users', { body: input })
  if (error) {
    let code = 'operation_requires_review'
    try {
      const body = await (error as { context?: Response }).context?.json()
      if (typeof body?.error === 'string') code = body.error
    } catch { /* respuesta sin cuerpo JSON: se trata como resultado incierto */ }
    const message = MESSAGES[code] ?? `No se confirmó la cuenta (${code}). Solicitud ${input.request_id}: ` +
      'conservar para revisión y no repetir el alta con otro identificador.'
    throw new AccountAdminError(message, code, NO_JOB_CREATED.has(code))
  }
  if (!data?.id) throw new Error('El backend no confirmó la cuenta.')
  return data as { id: string; request_id: string }
}
