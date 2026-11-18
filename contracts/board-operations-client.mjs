/** M12 backend contract. Normal authenticated session only; retain one UUID per user action. */
export const DEVELOPMENT_PHASES = Object.freeze(['backlog','analysis','design','dev','code_review','testing','deploy','done'])
export function createBoardOperations(client) {
  async function read(name, args) {
    const { data, error } = await client.rpc(name, args)
    if (error || data == null) throw new Error('No se confirmó la operación del tablero. Revisa permisos, bloqueo y confirmación vigente.')
    return data
  }
  const operate = (id, action, payload, key) => read('operate_board_ticket', {
    p_project_id: id, p_action: action, p_payload: payload, p_idempotency_key: key,
  })
  const selectFlow = flowId => flowId ? { flow_id: flowId } : {}
  return {
    getTicket: id => read('get_board_ticket', { p_project_id: id }),
    createInternal: (data, key) => read('create_internal_project', { p_payload: {
      title: data.title, description: data.description, project_type: 'development',
      priority: data.priority ?? 'medium', assigned_dev: data.assigneeId,
    }, p_idempotency_key: key }),
    approve: (requestId, data, key) => read('approve_request', { p_request_id: requestId, p_payload: {
      title: data.title, project_type: 'development', priority: data.priority ?? 'medium', assigned_dev: data.assigneeId,
    }, p_idempotency_key: key }),
    movePhase: (id, phase, key, options = {}) => operate(id, 'move_phase', {
      ...selectFlow(options.flowId), to_phase: phase,
      ...(options.confirmPending ? { confirm_pending: true, pending_fingerprint: options.pendingFingerprint } : {}),
    }, key),
    reopen: (id, phase, reason, key, flowId) => operate(id, 'reopen', { ...selectFlow(flowId), to_phase: phase, reason }, key),
    assign: (id, assigneeId, key, flowId) => operate(id, 'assign', { ...selectFlow(flowId), assignee_id: assigneeId }, key),
    setPriority: (id, priority, key) => operate(id, 'set_priority', { priority }, key),
    block: (id, reason, key) => operate(id, 'block', { reason }, key),
    unblock: (id, key) => operate(id, 'unblock', {}, key),
    archive: (id, key) => operate(id, 'archive', {}, key),
    restore: (id, key) => operate(id, 'restore', {}, key),
    bulk: (ids, action, payload, key) => read('operate_board_tickets', {
      p_project_ids: ids, p_action: action, p_payload: payload, p_idempotency_key: key,
    }),
    reserveEvidence: (id, file, uploadKey) => read('reserve_board_evidence', {
      p_project_id: id, p_upload_key: uploadKey, p_file_name: file.name,
      p_size_bytes: file.size, p_mime_type: file.type,
    }),
  }
}
