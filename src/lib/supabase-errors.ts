export function errorMessage(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
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
