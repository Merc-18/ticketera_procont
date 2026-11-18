// Adaptador tipado del contrato de métricas de Codex (migración 20261118000700_business_metrics).
// RPC reales: metrics_time_averages, metrics_monthly_urgency y metrics_requester_urgency
// (SECURITY DEFINER; exigen perfil interno activo; nunca expuestas a anon).
// El frontend no calcula estas estadísticas: si la RPC no está publicada muestra «pendiente de
// integración»; si la respuesta no es coherente, la descarta.

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
/** Cycle Time: primera salida efectiva de Backlog → Terminado. Lead Time: solicitud → Terminado.
 *  Días transcurridos (calendario corrido) calculados por el servidor sobre trabajos terminados. */
export interface TimeAverages {
  completed_count: number
  avg_cycle_time_days: number | null
  avg_lead_time_days: number | null
  cycle_sample_size?: number
  lead_sample_size?: number
  /** Terminados excluidos de ambos promedios (sin inicio registrado o cronología inválida). */
  excluded_count?: number
  /** 'paired_complete': ambos promedios sobre la misma cohorte de tickets. */
  cohort?: 'paired_complete'
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
    && (v.cycle_sample_size === undefined || count(v.cycle_sample_size))
    && (v.lead_sample_size === undefined || count(v.lead_sample_size))
    && (v.excluded_count === undefined || count(v.excluded_count))
    && (v.cohort === undefined || (v.cohort === 'paired_complete' && v.cycle_sample_size === v.lead_sample_size))
    // Con cohorte común, el promedio de Lead (solicitud → fin) nunca puede ser menor que el de Cycle.
    && (v.cohort !== 'paired_complete' || v.avg_cycle_time_days === null || v.avg_lead_time_days === null
        || v.avg_lead_time_days + 1e-9 >= v.avg_cycle_time_days)
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
    /** null: la solicitud no aplica (sin estudio, no REQ o nombre no normalizable). */
    requesterUrgency: (requestId: string, month: string) =>
      call(client, METRICS_CONTRACT.requesterUrgency, { p_request_id: requestId, p_month: month },
        (v): v is UrgencyRow | null => v === null || isUrgencyRow(v)),
    monthlyUrgency: (month: string) =>
      call(client, METRICS_CONTRACT.monthlyUrgency, { p_month: month },
        (v): v is UrgencyRow[] => Array.isArray(v) && v.every(isUrgencyRow)),
    timeAverages: (filters: { periodDays: number | null; studioId: string | null }) =>
      call(client, METRICS_CONTRACT.timeAverages, { p_period_days: filters.periodDays, p_studio_id: filters.studioId }, isTimeAverages),
  }
}
export type MetricsAdapter = ReturnType<typeof createMetricsAdapter>
