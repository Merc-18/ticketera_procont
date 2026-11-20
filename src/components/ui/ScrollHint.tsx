import Icon from './Icon'

/** Pista visual estática: no cambia el scroll ni los datos de la región. */
export default function ScrollHint({ children }: { children: string }) {
  return <p className="scroll-hint"><Icon name="arrow" size={16} /><span>{children}</span></p>
}
