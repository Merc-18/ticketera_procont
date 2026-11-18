export type Priority = 'low' | 'medium' | 'high' | 'urgent'
export type DevelopmentPhase = 'backlog' | 'analysis' | 'design' | 'dev' | 'code_review' | 'testing' | 'deploy' | 'done'
export type LegacyPhase = 'ready_to_start' | 'discovery' | 'build' | 'uat_validation' | 'deployed'
export type Phase = DevelopmentPhase | LegacyPhase
export const DEVELOPMENT_PHASES: readonly DevelopmentPhase[]
export interface PendingItem { id: string; flow_id: string; phase: Phase; description: string }
export interface BoardFlow {
  id: string; flow_type: 'development' | 'administrative'; phase: Phase
  phase_index: number; phase_count: number; phase_progress_percent: number
  assignee_id: string | null; checklist_total: number; checklist_completed: number
  checklist_progress_percent: number | null
}
export interface BoardTicket {
  project_id: string; request_id: string; request_number: string; workflow_version: 2 | null
  project_status: 'active' | 'completed' | 'archived' | 'deleted'
  general_status: 'received' | 'in_review' | 'approved_backlog' | 'in_progress' | 'blocked' | 'done' | 'rejected'
  priority: Priority; is_blocked: boolean; blocked_reason: string | null
  flows: BoardFlow[]; pending_items: PendingItem[]; pending_fingerprint: string
}
export interface BoardRpcClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>
}
export interface EvidenceGrant { bucket: string; path: string; mime_type: string; size_bytes: number; expires_at: string }
export interface MoveOptions { flowId?: string; confirmPending?: boolean; pendingFingerprint?: string }
export interface NewProject { title: string; description: string; assigneeId: string; priority?: Priority }
export function createBoardOperations(client: BoardRpcClient): {
  getTicket(id: string): Promise<BoardTicket>
  createInternal(data: NewProject, key: string): Promise<Record<string, unknown>>
  approve(requestId: string, data: Omit<NewProject, 'description'>, key: string): Promise<Record<string, unknown>>
  movePhase(id: string, phase: Phase, key: string, options?: MoveOptions): Promise<BoardTicket>
  reopen(id: string, phase: Phase, reason: string, key: string, flowId?: string): Promise<BoardTicket>
  assign(id: string, assigneeId: string | null, key: string, flowId?: string): Promise<BoardTicket>
  setPriority(id: string, priority: Priority, key: string): Promise<BoardTicket>
  block(id: string, reason: string, key: string): Promise<BoardTicket>
  unblock(id: string, key: string): Promise<BoardTicket>
  archive(id: string, key: string): Promise<BoardTicket>
  restore(id: string, key: string): Promise<BoardTicket>
  bulk(ids: string[], action: 'set_priority' | 'archive', payload: { priority: Priority } | Record<string, never>, key: string): Promise<BoardTicket[]>
  reserveEvidence(id: string, file: { name: string; size: number; type: string }, uploadKey: string): Promise<EvidenceGrant>
}
