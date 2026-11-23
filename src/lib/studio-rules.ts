// Regla de negocio: las áreas solo aplican al estudio PROCONT (D-041).
// El estudio se identifica por su código interno canónico `PROCONT` (studio_codes.code, coincidencia exacta),
// nunca por comparaciones parciales del nombre visible. Hoy ese código pertenece al estudio
// «BUSINESS ACCOMPANYING SAC», el mismo al que el catálogo y el servidor asocian las áreas
// (supabase/migrations/20261118000300_ticket_catalogs.sql; request_intake exige área a ese estudio).
export const PROCONT_STUDIO_CODE = 'PROCONT'

type CodeRow = { studio_id: string; code: string; is_active?: boolean }

/** Id del estudio dueño del código canónico PROCONT; null si el catálogo aún no lo trae. */
export function procontStudioId(codes: CodeRow[]): string | null {
  return codes.find(c => c.code === PROCONT_STUDIO_CODE && c.is_active !== false)?.studio_id ?? null
}

/** ¿Aplica la clasificación por área a este estudio? Solo al estudio PROCONT. */
export function areasApply(studioId: string | null | undefined, codes: CodeRow[]): boolean {
  const procont = procontStudioId(codes)
  return !!studioId && !!procont && studioId === procont
}
