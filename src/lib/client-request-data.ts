/** Valores de presentación del handoff; urgencia y prioridad solicitada son independientes. */
export const REQUESTED_PRIORITIES = { low: 'Bajo', medium: 'Medio', high: 'Alto', urgent: 'Urgente' } as const
export type RequestedPriorityValue = keyof typeof REQUESTED_PRIORITIES
