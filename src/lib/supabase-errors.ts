/**
 * Rechazos de validación conocidos del servidor (M8–M12) → mensaje claro. Lista cerrada: cualquier
 * otro texto del servidor se sigue sustituyendo por el mensaje genérico de su código.
 */
const SERVER_VALIDATION: Record<string, string> = {
  'Principal assignee required': 'Selecciona el responsable principal antes de aceptar.',
  'New Development ticket requires a principal assignee and Backlog': 'Selecciona el responsable principal antes de aceptar.',
  'Public rejection message required; notes must be bounded': 'Indica el motivo del rechazo para el solicitante (máximo 5000 caracteres).',
  'Asignar el código interno del estudio antes de aceptar o rechazar': 'Asigna el código interno del estudio antes de aceptar o rechazar.',
  'Área requerida para aceptar solicitudes de este estudio': 'Selecciona el área: es obligatoria para aceptar solicitudes de este estudio.',
  'Subproyecto requerido para aceptar': 'Selecciona el subproyecto antes de aceptar.',
  'Solicitud pendiente con estudio requerida': 'La solicitud ya no está pendiente o no tiene estudio asignado. Actualiza la bandeja.',
  'El código no corresponde al estudio de la solicitud': 'El código interno elegido no corresponde al estudio de la solicitud.',
  'Subproyecto inválido para el proyecto': 'El subproyecto elegido no corresponde al producto de la solicitud.',
  'Área inválida': 'El área elegida no es válida para este estudio.',
  'Subárea inválida': 'La subárea elegida no corresponde al área seleccionada.',
  'Área no aplicable a este estudio': 'Este estudio no usa áreas: deja el área en blanco.',
  'La clasificación se fija con la decisión': 'La clasificación ya quedó fijada con la decisión anterior. Actualiza la bandeja.',
}

export function errorMessage(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
  const serverText = error && typeof error === 'object' && 'message' in error ? String(error.message) : ''
  if ((code === '22023' || code === '23514') && SERVER_VALIDATION[serverText]) return SERVER_VALIDATION[serverText]
  if (code === '42501') return 'No tienes permiso para realizar esta operación. Comprueba tu perfil activo y rol.'
  if (code === '23505') return 'El registro ya existe. Actualiza la vista antes de reintentar.'
  if (code === 'PGRST202') return 'La operación requerida no está disponible. Comprueba las migraciones del proyecto independiente.'
  if (code === '23514') return 'La operación no cumple las condiciones del registro. Actualiza la vista y revisa los datos.'
  if (code === '22023') return 'Revisa los datos de la operación y vuelve a intentarlo.'
  if (error instanceof Error) return error.message
  // Do not display/log raw Supabase detail fields, payloads or tracking tokens.
  return 'No se pudo completar la operación. Comprueba la conexión y vuelve a intentarlo.'
}

export function requireData<T>(result: { data: T | null; error: unknown }, context: string): T {
  if (result.error) throw new Error(errorMessage(result.error))
  if (result.data == null || (Array.isArray(result.data) && result.data.length === 0)) {
    throw new Error(`${context}: no se confirmó ningún registro. Actualiza la vista y comprueba tus permisos.`)
  }
  return result.data
}

export function requireSuccess(result: { error: unknown }) {
  if (result.error) throw new Error(errorMessage(result.error))
}

export class CommittedWriteError extends Error {}
