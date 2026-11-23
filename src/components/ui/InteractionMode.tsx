import { useEffect } from 'react'

/**
 * Metadato visual únicamente (no cambia comportamiento del producto).
 * - Emil: las acciones de teclado no se animan → `data-input="keyboard"` anula transiciones.
 *   Sin modo inicial: el hover del ratón anima desde el primer movimiento (antes de cualquier clic).
 * - Emil/Taste: el modal sale más rápido de lo que entra. React desmonta el modal de inmediato; aquí se
 *   deja un clon inerte (sin ids ni rol accesible) que se desvanece en 120 ms y luego se retira.
 *   Con teclado (Escape) no hay animación de salida.
 */
export default function InteractionMode() {
  useEffect(() => {
    const root = document.documentElement
    const set = (mode: 'keyboard' | 'pointer') => { if (root.dataset.input !== mode) root.dataset.input = mode }
    const keyboard = () => set('keyboard')
    const pointer = () => set('pointer')
    document.addEventListener('keydown', keyboard, true)
    document.addEventListener('pointerdown', pointer, true)
    document.addEventListener('pointermove', pointer, { capture: true, passive: true })

    const leave = (backdrop: HTMLElement) => {
      if (root.dataset.input === 'keyboard') return
      const ghost = backdrop.cloneNode(true) as HTMLElement
      ghost.setAttribute('aria-hidden', 'true')
      ghost.setAttribute('inert', '')
      for (const el of [ghost, ...ghost.querySelectorAll<HTMLElement>('[id], [data-testid], [role]')]) {
        el.removeAttribute('id'); el.removeAttribute('data-testid'); if (el !== ghost) el.removeAttribute('role')
      }
      // Sin la entrada de @starting-style: el clon aparece ya visible y solo se desvanece.
      ghost.style.transition = 'none'
      ghost.querySelectorAll<HTMLElement>('.modal-panel').forEach(panel => { panel.style.transition = 'none' })
      document.body.appendChild(ghost)
      void ghost.offsetWidth
      ghost.style.transition = ''
      ghost.classList.add('is-leaving')
      const done = () => ghost.remove()
      ghost.addEventListener('transitionend', done, { once: true })
      window.setTimeout(done, 200)
    }
    const observer = new MutationObserver(records => {
      for (const record of records) for (const node of record.removedNodes) {
        if (!(node instanceof HTMLElement) || node.classList.contains('is-leaving')) continue
        const backdrop = node.matches('.modal-backdrop') ? node : node.querySelector<HTMLElement>('.modal-backdrop')
        if (backdrop) leave(backdrop)
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
    return () => {
      document.removeEventListener('keydown', keyboard, true)
      document.removeEventListener('pointerdown', pointer, true)
      document.removeEventListener('pointermove', pointer, true)
      observer.disconnect()
      delete root.dataset.input
    }
  }, [])
  return null
}
