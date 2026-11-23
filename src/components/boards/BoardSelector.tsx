import ControlLabel from '../ui/ControlLabel'
interface Props {
  currentBoard: 'development' | 'administrative'
  onChange: (board: 'development' | 'administrative') => void
}

export default function BoardSelector({ currentBoard, onChange }: Props) {
  return (
    <div className="flex gap-2 bg-gray-100 p-1 rounded-lg inline-flex">
      <button
        onClick={() => onChange('development')}
        className={`px-4 py-2 rounded-md font-medium text-sm transition ${
          currentBoard === 'development'
            ? 'bg-brand-100 text-brand-700'
            : 'text-gray-600 hover:text-gray-900'
        }`}
      >
        <ControlLabel icon="code">Development</ControlLabel>
      </button>
      <button
        onClick={() => onChange('administrative')}
        className={`px-4 py-2 rounded-md font-medium text-sm transition ${
          currentBoard === 'administrative'
            ? 'bg-brand-100 text-brand-700'
            : 'text-gray-600 hover:text-gray-900'
        }`}
      >
        <ControlLabel icon="tickets">Histórico Admin.</ControlLabel>
      </button>
    </div>
  )
}