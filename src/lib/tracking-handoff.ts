// Traspaso volátil dentro de la SPA: solo el número REQ (el token técnico nunca se muestra ni se traspasa).
let pending: string | null = null
export function handoffTracking(requestNumber: string) { pending = requestNumber }
export function peekTrackingNumber() { return pending }
export function clearTrackingNumber() { pending = null }
