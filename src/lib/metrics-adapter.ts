// Adaptador tipado para el contrato de métricas que implementa Codex (backend de reglas y métricas).
// DEPENDENCIA PENDIENTE: los nombres de RPC y las formas de respuesta de METRICS_CONTRACT son
// provisionales hasta recibir el contrato definitivo. Al integrarlo, ajustar SOLO este archivo.
// El frontend nunca calcula estas estadísticas por su cuenta: si el contrato no está disponible
// muestra «pendiente de integración»; si la respuesta no es coherente, la descarta.

export const METRICS_CONTRACT = {
  /** Historial mensual de urgencias de un solicitante y su estudio (vista del validador). */
  requesterUrgency: 'metrics_requester_urgency',
  /** Estadísticas mensuales de urgencias por solicitante y estudio (panel interno). */
  monthlyUrgency: 'metrics_monthly_urgency',
  /** Promedios de Cycle Time y Lead Time sobre trabajos terminados. */
  timeAverages: 'metrics_time_averages',
} as const

export interface UrgencyRow {
  requester_name: string
  studio_id: string | null
  studio_name: string | null
  month: string              // 'YYYY-MM' (America/Lima)
  total_requests: number
  urgent_requests: number
  urgent_pct: number | null  // 0–100 calculado por el servidor; null si total = 0
}
export interface TimeAverages {
  completed_count: number
  avg_cycle_time_days: number | null
  avg_lead_time_days: number | null
}

export type MetricResult<T> =
  | { state: 'ready'; data: T }
  | { state: 'pending_contract' }      // RPC aún no publicada por el backend
  | { state: 'error'; message: string }

interface RpcClient { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> }

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/
const count = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0
const days = (v: unknown) => v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0)

export function isUrgencyRow(v: any): v is UrgencyRow {
  return !!v && typeof v.requester_name === 'string' && (v.studio_id === null || typeof v.studio_id === 'string')
    && (v.studio_name === null || typeof v.studio_name === 'string') && typeof v.month === 'string' && MONTH.test(v.month)
    && count(v.total_requests) && count(v.urgent_requests) && v.urgent_requests <= v.total_requests
    && (v.urgent_pct === null ? v.total_requests === 0 : typeof v.urgent_pct === 'number' && v.urgent_pct >= 0 && v.urgent_pct <= 100)
}
export function isTimeAverages(v: any): v is TimeAverages {
  return !!v && count(v.completed_count) && days(v.avg_cycle_time_days) && days(v.avg_lead_time_days)
}

const notPublished = (error: any) => ['PGRST202', '42883'].includes(String(error?.code ?? ''))

async function call<T>(client: RpcClient, name: string, args: Record<string, unknown>, valid: (v: unknown) => v is T): Promise<MetricResult<T>> {
  try {
    const { data, error } = await client.rpc(name, args)
    if (error) return notPublished(error) ? { state: 'pending_contract' }
      : { state: 'error', message: 'No se pudieron obtener las métricas del servidor.' }
    return valid(data) ? { state: 'ready', data } : { state: 'error', message: 'El servidor devolvió métricas con un formato no esperado.' }
  } catch {
    return { state: 'error', message: 'No se pudieron obtener las métricas del servidor.' }
  }
}

/** Mes actual en Lima, 'YYYY-MM'. */
export const limaMonth = (date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit' }).format(date)

export function createMetricsAdapter(client: RpcClient) {
  return {
    requesterUrgency: (requestId: string, month: string) =>
      call(client, METRICS_CONTRACT.requesterUrgency, { p_request_id: requestId, p_month: month }, isUrgencyRow),
    monthlyUrgency: (month: string) =>
      call(client, METRICS_CONTRACT.monthlyUrgency, { p_month: month },
        (v): v is UrgencyRow[] => Array.isArray(v) && v.every(isUrgencyRow)),
    timeAverages: (filters: { periodDays: number | null; studioId: string | null }) =>
      call(client, METRICS_CONTRACT.timeAverages, { p_period_days: filters.periodDays, p_studio_id: filters.studioId }, isTimeAverages),
  }
}
export type MetricsAdapter = ReturnType<typeof createMetricsAdapter>
