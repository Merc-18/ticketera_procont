const canonical = (value: unknown): string => JSON.stringify(value, (_key, item) =>
  item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item)

// One instance per form/row/approval intent. No payloads or keys are persisted.
export function createRpcAttempt(uuid = () => crypto.randomUUID()) {
  const entries = new Map<string, { key: string; pending?: Promise<unknown>; result?: unknown; done: boolean }>()
  let date: Date | undefined
  return {
    get startedAt() { return date ??= new Date() },
    async run<T>(name: string, args: Record<string, unknown>, send: (args: Record<string, unknown>) => Promise<T>): Promise<T> {
      const fingerprint = canonical({ name, args })
      let entry = entries.get(fingerprint)
      if (!entry) { entry = { key: uuid(), done: false }; entries.set(fingerprint, entry) }
      if (entry.done) return entry.result as T
      if (entry.pending) return entry.pending as Promise<T>
      const current = entry
      current.pending = send({ ...args, p_idempotency_key: current.key })
        .then(result => { current.result = result; current.done = true; return result })
        .finally(() => { current.pending = undefined })
      return current.pending as Promise<T>
    },
  }
}
export type RpcAttempt = ReturnType<typeof createRpcAttempt>
