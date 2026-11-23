import { GENERAL_STATUS, type GeneralStatus } from '../../lib/request-status'
import Icon, { type IconName } from '../ui/Icon'

const icons: Record<GeneralStatus, IconName> = {
  received: 'inbox', in_review: 'search', approved_backlog: 'tickets',
  in_progress: 'code', blocked: 'block', done: 'check', rejected: 'close',
}

export default function ClientTicketStatus({ status }: { status: GeneralStatus }) {
  const item = GENERAL_STATUS[status]
  return <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${item.tone}`}>
    <Icon name={icons[status]} size={16} className="shrink-0" />{item.label}
  </span>
}
