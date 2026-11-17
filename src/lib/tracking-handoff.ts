import type { SubmissionReceipt } from './operations'

// Volatile handoff inside the SPA. No tokens in URLs, history state or storage.
let pending: SubmissionReceipt | null = null
export function handoffTracking(receipt: SubmissionReceipt) { pending = receipt }
export function peekTrackingReceipt() { return pending }
export function clearTrackingReceipt() { pending = null }
