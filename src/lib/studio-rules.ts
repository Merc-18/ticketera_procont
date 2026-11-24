// Regla de negocio: áreas solo para el código canónico exacto `PROCONT`, nunca para todo el estudio.
// El servidor vuelve a resolver este código en studio_codes; estos helpers solo controlan presentación.
export const PROCONT_STUDIO_CODE = 'PROCONT'

type CodeRow = { id: string; studio_id: string; code: string; is_active?: boolean }

/** Id del estudio dueño del código canónico PROCONT; null si el catálogo aún no lo trae. */
export function procontStudioId(codes: CodeRow[]): string | null {
  return codes.find(c => c.code === PROCONT_STUDIO_CODE && c.is_active !== false)?.studio_id ?? null
}

/** UUID del código canónico; el RLS de catálogo ya limita las filas visibles. */
export function procontCodeId(codes: CodeRow[]): string | null {
  return codes.find(c => c.code === PROCONT_STUDIO_CODE && c.is_active !== false)?.id ?? null
}

/** Áreas aplican a una solicitud únicamente si su código seleccionado es exactamente PROCONT. */
export function areasApply(studioCodeId: string | null | undefined, codes: CodeRow[]): boolean {
  const canonicalId = procontCodeId(codes)
  return !!studioCodeId && !!canonicalId && studioCodeId === canonicalId
}

/** Permite mostrar un filtro que solo opera sobre PROCONT dentro del estudio que posee el código. */
export function studyHasProcontCode(studioId: string | null | undefined, codes: CodeRow[]): boolean {
  return !!studioId && codes.some(c => c.code === PROCONT_STUDIO_CODE && c.is_active !== false && c.studio_id === studioId)
}
