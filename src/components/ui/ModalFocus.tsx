import { useEffect, useRef } from 'react'

/** Foco y Escape del modal visual; no realiza operaciones del producto. */
export default function ModalFocus({ onDismiss }: { onDismiss: () => void }) {
  const marker = useRef<HTMLSpanElement>(null)
  const dismiss = useRef(onDismiss)
  dismiss.current = onDismiss
  useEffect(() => {
    const panel = marker.current?.closest<HTMLElement>('.modal-panel')
    if (!panel) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const controls = () => Array.from(panel.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'))
      .filter(el => el.getClientRects().length > 0 && !el.closest('[hidden]'))
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); dismiss.current(); return }
      if (e.key !== 'Tab') return
      const list = controls(), first = list[0], last = list[list.length - 1]
      if (!first) { e.preventDefault(); panel.focus(); return }
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    panel.tabIndex = -1
    ;(controls()[0] ?? panel).focus()
    panel.addEventListener('keydown', onKey)
    return () => { panel.removeEventListener('keydown', onKey); if (previous?.isConnected) previous.focus() }
  }, [])
  return <span ref={marker} hidden />
}
