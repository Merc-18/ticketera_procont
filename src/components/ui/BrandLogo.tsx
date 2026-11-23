import { BRAND } from '../../theme/brand'

interface Props {
  /** Tamaño del isotipo en px. */
  size?: number
  /** Mostrar nombre de la aplicación junto al logotipo. */
  showName?: boolean
  /** `light` para fondos azules (texto blanco), `dark` para fondos claros. */
  tone?: 'light' | 'dark'
  className?: string
}

/** Logotipo oficial de Procont Business + nombre de la aplicación. */
export default function BrandLogo({ size = 40, showName = true, tone = 'dark', className = '' }: Props) {
  const title = tone === 'light' ? 'text-white' : 'text-brand-700'
  const sub   = tone === 'light' ? 'text-accent-300' : 'text-gray-500'
  return (
    <div className={`flex items-center gap-3 min-w-0 ${className}`}>
      <img
        src={BRAND.logoSrc}
        alt={`Logotipo de ${BRAND.company}`}
        width={size}
        height={size}
        className="brand-logo-img rounded-lg shrink-0"
        style={{ width: size, height: size }}
      />
      {showName && (
        <div className="brand-name leading-tight min-w-0">
          <p className={`font-medium tracking-tight whitespace-nowrap ${title}`}>{BRAND.appName}</p>
          <p className={`text-xs font-medium whitespace-nowrap ${sub}`}>{BRAND.company}</p>
        </div>
      )}
    </div>
  )
}
