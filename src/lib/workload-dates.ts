/** Fecha civil de Lima para comparar fechas objetivo tipo DATE sin desplazamiento UTC. */
export function limaToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

/** Un vencimiento es pasado solo cuando su DATE ISO antecede al día civil de Lima. */
export function isOverdueDate(dueDate: string | null | undefined, today: string): boolean {
  return !!dueDate && /^\d{4}-\d{2}-\d{2}$/.test(dueDate) && dueDate < today
}
