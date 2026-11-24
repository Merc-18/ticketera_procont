/** Read every PostgREST page in stable order and fail closed if count changes or a page is incomplete. */
export const VERIFIED_PAGE_SIZE = 1000

export class VerifiedPaginationError extends Error {}

export interface VerifiedPage<T> { data: T[] | null; error: unknown; count: number | null }

export async function readVerifiedPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<VerifiedPage<T>>,
  pageSize = VERIFIED_PAGE_SIZE,
): Promise<T[]> {
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new RangeError('pageSize debe ser positivo')
  const rows: T[] = []
  const ids = new Set<unknown>()
  let expected: number | null = null
  for (let from = 0; ; from += pageSize) {
    const page = await fetchPage(from, from + pageSize - 1)
    if (page.error) throw new VerifiedPaginationError('No se pudo completar la consulta paginada.')
    if (page.count === null || !Number.isInteger(page.count) || page.count < 0)
      throw new VerifiedPaginationError('El servidor no devolvió un total verificable.')
    if (expected === null) expected = page.count
    else if (expected !== page.count)
      throw new VerifiedPaginationError('El total cambió durante la consulta; no se muestran resultados parciales.')
    const data = page.data
    if (!data) throw new VerifiedPaginationError('El servidor devolvió una página incompleta.')
    for (const row of data) {
      const id = row && typeof row === 'object' ? (row as { id?: unknown }).id : undefined
      if (id === undefined || id === null) throw new VerifiedPaginationError('La consulta no incluyó un identificador estable.')
      if (ids.has(id)) throw new VerifiedPaginationError('La consulta devolvió filas duplicadas.')
      ids.add(id)
      rows.push(row)
    }
    if (rows.length > expected) throw new VerifiedPaginationError('La consulta superó el total informado.')
    if (rows.length === expected) break
    if (data.length === 0 || data.length < pageSize)
      throw new VerifiedPaginationError('Faltan filas respecto del total informado; no se muestran resultados parciales.')
  }
  if (expected === null || rows.length !== expected)
    throw new VerifiedPaginationError('No se pudo verificar que la consulta esté completa.')
  return rows
}
