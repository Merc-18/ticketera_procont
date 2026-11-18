export type MetricStatus = 'not_completed' | 'missing_completion' | 'missing_start' | 'invalid_timeline' | 'complete'
export interface TicketPerformance {
  request_id: string; request_number: string; project_id: string | null; studio_id: string | null
  general_status: 'received' | 'in_review' | 'approved_backlog' | 'in_progress' | 'blocked' | 'done' | 'rejected'
  first_started_at: string | null; completed_at: string | null
  cycle_time_seconds: number | null; lead_time_seconds: number | null; metric_status: MetricStatus
}
export interface PerformanceSummary {
  unit: 'seconds'; calendar: 'elapsed'; total_tickets: number; completed_tickets: number
  cycle_sample_size: number; lead_sample_size: number
  avg_cycle_time_seconds: number | null; avg_lead_time_seconds: number | null
  incomplete_completed_tickets: number
}
export interface RequesterUrgency {
  studio_id: string; requester_key: string; requester_name: string
  total_requests: number; urgent_requests: number; urgent_percentage: number
}
export interface MonthlyUrgency {
  month: string; timezone: 'America/Lima'; total_requests: number; urgent_requests: number
  urgent_percentage: number | null; unattributed_requests: number; requesters: RequesterUrgency[]
}
export interface MetricsClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>
}
export function createTicketMetrics(client: MetricsClient): {
  performance(studioId?: string | null): Promise<TicketPerformance[]>
  summary(studioId?: string | null): Promise<PerformanceSummary>
  requesterUrgencyMonth(month?: string | null, studioId?: string | null): Promise<MonthlyUrgency>
}
