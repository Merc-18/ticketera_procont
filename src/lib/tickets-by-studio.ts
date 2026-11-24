// Tickets por estudio (Dashboard, 24/11/2026). Un «ticket» es una SOLICITUD (`public.requests`): los proyectos
// operativos no se cuentan. La relación canónica es `requests.studio_id` (UUID → `studios`); no se usan textos
// antiguos ni el área. Lectura ya permitida por RLS al personal interno; sin RPC nuevas.
// PostgREST limita cada respuesta (max_rows = 1000): se pagina con un orden estable (`id`) y se exige que lo leído
// coincida con `count=exact`. Si no coincide, se informa el error en vez de mostrar un total parcial.

export interface TicketsByStudio { total: number; byStudio: Record<string, number>; withoutStudio: number }

type Row = { id: string; studio_id: string | null }
type Page = { data: Row[] | null; error: unknown; count: number | null }
interface Query extends PromiseLike<Page> {
  order(column: string, opts: { ascending: boolean }): Query
  range(from: number, to: number): Query
  gte(column: string, value: string): Query
  eq(column: string, value: string): Query
}
export interface TicketsClient { from(table: 'requests'): { select(columns: string, opts: { count: 'exact' }): Query } }

export class TicketsByStudioError extends Error {}

export const PAGE_SIZE = 1000

export async function countTicketsByStudio(client: TicketsClient, { since, studioId }: { since: string | null; studioId: string | null },
  pageSize = PAGE_SIZE): Promise<TicketsByStudio> {
  const seen = new Map<string, string | null>()
  let expected: number | null = null
  for (let from = 0; ; from += pageSize) {
    let query = client.from('requests').select('id, studio_id', { count: 'exact' }).order('id', { ascending: true })
    if (since) query = query.gte('created_at', since)
    if (studioId) query = query.eq('studio_id', studioId)
    const { data, error, count } = await query.range(from, from + pageSize - 1)
    if (error) throw new TicketsByStudioError('No se pudieron contar los tickets por estudio.')
    if (expected === null) expected = count
    for (const row of data ?? []) seen.set(row.id, row.studio_id)   // un id solo cuenta una vez
    if (!data || data.length < pageSize || (expected !== null && seen.size >= expected)) break
  }
  if (expected === null || seen.size !== expected) {
    throw new TicketsByStudioError('El total de tickets cambió durante la consulta o no se pudo verificar. Usa «Actualizar».')
  }
  const byStudio: Record<string, number> = {}
  let withoutStudio = 0
  for (const sid of seen.values()) {
    if (sid) byStudio[sid] = (byStudio[sid] ?? 0) + 1; else withoutStudio++
  }
  return { total: seen.size, byStudio, withoutStudio }
}

/** Filas para la gráfica: estudios de mayor a menor, «Sin estudio» al final; total intacto. */
export function ticketsByStudioRows(result: TicketsByStudio, nameOf: (id: string) => string | undefined) {
  const rows = Object.entries(result.byStudio)
    .map(([id, value]) => ({ id, label: nameOf(id) ?? 'Estudio no disponible', value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, 'es'))
  if (result.withoutStudio) rows.push({ id: 'none', label: 'Sin estudio asignado', value: result.withoutStudio })
  return rows
}
