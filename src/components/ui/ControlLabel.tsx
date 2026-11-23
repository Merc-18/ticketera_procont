import Icon, { type IconName } from './Icon'

// Etiquetas de navegación y controles con glifo Lucide (Taste: un sistema de iconos, sin emojis en pantalla).
// Uso preferente: <ControlLabel icon="chart">Dashboard</ControlLabel>. Los prefijos emoji que aún lleguen
// como texto se convierten al glifo equivalente y nunca se muestran.
const prefixes: [string, IconName][] = [
  ['📈', 'chart'], ['📊', 'chart'], ['📬', 'inbox'], ['👥', 'team'], ['💻', 'code'], ['📋', 'tickets'],
  ['🔎', 'search'], ['🔍', 'search'], ['📝', 'edit'], ['✏️', 'edit'], ['👀', 'eye'], ['🧪', 'check'],
  ['🚀', 'arrow'], ['🎯', 'flag'], ['🔨', 'code'], ['✔️', 'check'], ['✅', 'check'], ['⬛', 'board'],
  ['☰', 'table'], ['📅', 'calendar'], ['🗓', 'calendar'], ['📦', 'archive'], ['📥', 'download'],
  ['🔑', 'key'], ['🗑', 'trash'], ['🗂', 'tickets'], ['📎', 'file'], ['💬', 'comments'], ['🕐', 'clock'],
  ['➕', 'plus'], ['⬇', 'download'], ['↺', 'refresh'], ['🌐', 'layers'], ['⏳', 'clock'], ['🏢', 'building'],
  ['👤', 'user'], ['🔒', 'lock'], ['🚫', 'block'], ['⚠️', 'alert'], ['⚠', 'alert'], ['🏷', 'tag'],
  ['🧩', 'package'], ['📍', 'pin'], ['⭐', 'star'], ['🔔', 'bell'],
]

export default function ControlLabel({ children, icon }: { children: string; icon?: IconName }) {
  const match = icon ? null : prefixes.find(([prefix]) => children.startsWith(prefix))
  const name = icon ?? match?.[1]
  if (!name) return <>{children}</>
  const text = match ? children.slice(match[0].length).replace(/^️/, '').trimStart() : children
  return <span className="control-label"><Icon name={name} size={18} /><span>{text}</span></span>
}
