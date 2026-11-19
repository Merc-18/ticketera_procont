// Exportación de tickets terminados con métricas POR TICKET del servidor (get_ticket_performance, M11).
//
// Algoritmo (sin cargar todos los estados ni confiar en una sola respuesta):
// 1. La RPC devuelve TABLE, así que PostgREST admite filtros, orden y rango sobre su resultado:
//    general_status=eq.done se aplica EN EL SERVIDOR antes del límite de filas (max_rows).
// 2. Orden determinista por request_id (clave única: una fila por solicitud) y paginación por
//    offset/limit. Se pide count=exact para conocer el total filtrado.
// 3. Se avanza por las filas realmente recibidas (si el servidor recorta la página a menos de lo
//    pedido, se sigue pidiendo) hasta reunir exactamente el total.
// 4. Falla —sin producir un CSV parcial— si una página da error, si el total cambia entre páginas,
//    si una página llega vacía antes de completar, si hay duplicados o una fila no terminada.
// 5. Los datos de proyecto se leen por lotes acotados de ids (nunca una única consulta sujeta al
//    mismo límite de filas).
import type { TicketPerformance } from '../../contracts/ticket-metrics-client.d.mts'

export const PERFORMANCE_PAGE_SIZE = 1000
export const PROJECT_CHUNK_SIZE = 100

type Result<T> = { data: T | null; error: unknown; count?: number | null }
interface PerformanceQuery extends PromiseLike<Result<unknown[]>> {
  eq(column: string, value: string): PerformanceQuery
  order(column: string, options: { ascending: boolean }): PerformanceQuery
  range(from: number, to: number): PerformanceQuery
}
interface ProjectQuery extends PromiseLike<Result<unknown[]>> {
  in(column: string, values: string[]): ProjectQuery
}
export interface ExportClient {
  rpc(name: string, args: Record<string, unknown>, options: { count: 'exact' }): unknown
  from(table: string): { select(columns: string): unknown }
}

export class ExportError extends Error {}

/** Todos los tickets terminados, paginados de forma completa y verificada. */
export async function fetchDonePerformance(client: ExportClient, pageSize = PERFORMANCE_PAGE_SIZE): Promise<TicketPerformance[]> {
  const rows: TicketPerformance[] = []
  const seen = new Set<string>()
  let total: number | null = null
  let page = 0
  while (total === null || rows.length < total) {
    page++
    const query = (client.rpc('get_ticket_performance', { p_studio_id: null }, { count: 'exact' }) as PerformanceQuery)
      .eq('general_status', 'done')
      .order('request_id', { ascending: true })
      .range(rows.length, rows.length + pageSize - 1)
    let result: Result<unknown[]>
    try { result = await query } catch { throw new ExportError(`No se pudo leer la página ${page} de métricas. No se descargó ningún archivo.`) }
    if (result.error) throw new ExportError(`No se pudo leer la página ${page} de métricas. No se descargó ningún archivo.`)
    if (!Array.isArray(result.data) || typeof result.count !== 'number') {
      throw new ExportError('El servidor no confirmó el total de tickets terminados. No se descargó ningún archivo.')
    }
    if (total === null) total = result.count
    else if (result.count !== total) {
      throw new ExportError('Los tickets cambiaron durante la exportación. Vuelve a exportar para obtener datos consistentes.')
    }
    if (rows.length < total && result.data.length === 0) {
      throw new ExportError('La exportación quedó incompleta (página vacía). No se descargó ningún archivo.')
    }
    for (const raw of result.data as TicketPerformance[]) {
      if (raw?.general_status !== 'done' || typeof raw.request_id !== 'string' || seen.has(raw.request_id)) {
        throw new ExportError('Se recibieron filas inconsistentes durante la paginación. Vuelve a exportar.')
      }
      seen.add(raw.request_id)
      rows.push(raw)
    }
    if (rows.length > total) throw new ExportError('Se recibieron más filas que el total informado. Vuelve a exportar.')
  }
  return rows
}

export interface ProjectInfo { id: string; title: string; priority: string; project_type: string; requests?: { requester_area?: string | null } | null }

/** Datos descriptivos de los proyectos por lotes acotados (cada lote < límite de filas). */
export async function fetchProjects(client: ExportClient, ids: string[], chunkSize = PROJECT_CHUNK_SIZE) {
  const unique = [...new Set(ids)]
  const byId = new Map<string, ProjectInfo>()
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize)
    const result = await (client.from('projects').select('id, title, priority, project_type, requests(requester_area)') as ProjectQuery)
      .in('id', chunk)
    if (result.error || !Array.isArray(result.data) || result.data.length > chunk.length) {
      throw new ExportError('No se pudieron cargar los datos de los proyectos. No se descargó ningún archivo.')
    }
    for (const p of result.data as ProjectInfo[]) byId.set(p.id, p)
  }
  return byId
}

const PRIORITY_ES: Record<string, string> = { urgent: 'Urgente', high: 'Alta', medium: 'Media', low: 'Baja' }
const TYPE_ES: Record<string, string> = { development: 'Desarrollo', administrative: 'Administrativo (histórico)', dual: 'Dual (histórico)' }
const METRIC_STATUS_ES: Record<TicketPerformance['metric_status'], string> = {
  complete: 'Completa',
  missing_start: 'Sin inicio de trabajo registrado',
  missing_completion: 'Sin finalización registrada',
  invalid_timeline: 'Cronología inválida (excluida de promedios)',
  not_completed: 'No terminado',
}
const days = (seconds: number | null) => seconds == null ? '' : (Number(seconds) / 86400).toFixed(1)
const limaDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Lima' }) : ''

export const COMPLETED_HEADERS = ['Número', 'Proyecto', 'Área', 'Prioridad', 'Tipo', 'Inicio de trabajo', 'Finalización',
  'Cycle Time (d)', 'Lead Time (d)', 'Estado de la métrica']

/** Filas del CSV: valores desconocidos quedan vacíos y su motivo en «Estado de la métrica». */
export function completedRows(done: TicketPerformance[], projects: Map<string, ProjectInfo>) {
  return [...done]
    .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? '') || a.request_id.localeCompare(b.request_id))
    .map(t => {
      const p = t.project_id ? projects.get(t.project_id) : undefined
      return [
        t.request_number,
        p?.title ?? '',
        p?.requests?.requester_area ?? '',
        p ? PRIORITY_ES[p.priority] ?? p.priority : '',
        p ? TYPE_ES[p.project_type] ?? p.project_type : '',
        limaDate(t.first_started_at),
        limaDate(t.completed_at),
        days(t.cycle_time_seconds),
        days(t.lead_time_seconds),
        METRIC_STATUS_ES[t.metric_status] ?? t.metric_status,
      ]
    })
}

/** Exportación completa o error: nunca filas parciales. */
export async function buildCompletedExport(client: ExportClient) {
  const done = await fetchDonePerformance(client)
  if (done.length === 0) return null
  const projects = await fetchProjects(client, done.map(t => t.project_id).filter((id): id is string => !!id))
  return { headers: COMPLETED_HEADERS, rows: completedRows(done, projects) }
}
