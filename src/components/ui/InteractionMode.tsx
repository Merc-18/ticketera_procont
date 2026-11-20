import { useEffect } from 'react'

/** Metadato visual únicamente: evita animar las interacciones de teclado (Emil). */
export default function InteractionMode() {
  useEffect(() => {
    const keyboard = () => { document.documentElement.dataset.input = 'keyboard' }
    const pointer = () => { document.documentElement.dataset.input = 'pointer' }
    keyboard()
    document.addEventListener('keydown', keyboard, true)
    document.addEventListener('pointerdown', pointer, true)
    return () => {
      document.removeEventListener('keydown', keyboard, true)
      document.removeEventListener('pointerdown', pointer, true)
      delete document.documentElement.dataset.input
    }
  }, [])
  return null
}
