import Icon, { type IconName } from './Icon'

// Solo etiquetas de navegación y controles. Los badges de estado no usan este componente.
const prefixes: [string, IconName][] = [
  ['📈', 'chart'], ['📊', 'chart'], ['📬', 'inbox'], ['👥', 'team'],
  ['💻', 'code'], ['📋', 'tickets'], ['🔎', 'search'], ['📝', 'edit'],
  ['👀', 'eye'], ['🧪', 'check'], ['🚀', 'arrow'], ['🎯', 'check'],
  ['🔍', 'search'], ['🔨', 'code'], ['✔️', 'check'], ['✅', 'check'],
  ['⬛', 'board'], ['☰', 'table'], ['📅', 'calendar'], ['🗓', 'calendar'],
  ['📦', 'archive'], ['📥', 'download'], ['🔑', 'lock'], ['🗑', 'archive'],
  ['🗂', 'tickets'], ['📎', 'file'], ['💬', 'comments'], ['🕐', 'clock'],
  ['✏️', 'edit'], ['➕', 'plus'], ['⬇', 'download'], ['↺', 'refresh'],
  ['🌐', 'board'], ['⏳', 'clock'], ['🏢', 'building'], ['👤', 'user'],
]

export default function ControlLabel({ children }: { children: string }) {
  const match = prefixes.find(([prefix]) => children.startsWith(prefix))
  if (!match) return <>{children}</>
  return <span className="control-label"><Icon name={match[1]} size={18} /><span>{children.slice(match[0].length).trimStart()}</span></span>
}
