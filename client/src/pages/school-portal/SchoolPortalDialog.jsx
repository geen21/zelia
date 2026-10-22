import React, { useEffect, useId, useRef } from 'react'
import { PiX } from 'react-icons/pi'

export default function SchoolPortalDialog({ title, onClose, children, className = '', busy = false }) {
  const ref = useRef(null)
  const titleId = useId()

  useEffect(() => {
    const opener = document.activeElement
    const dialog = ref.current
    const overflow = document.body.style.overflow
    dialog.showModal()
    document.body.style.overflow = 'hidden'
    return () => {
      dialog.close()
      document.body.style.overflow = overflow
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
    }
  }, [])

  return <dialog ref={ref} className={`sp-dialog ${className}`} aria-labelledby={titleId} tabIndex={-1}
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose() }}
    onClick={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}
    onKeyDown={(event) => {
      if (event.key !== 'Tab') return
      const controls = Array.from(event.currentTarget.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'))
        .filter((element) => element instanceof HTMLElement && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden')
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (!first) { event.preventDefault(); event.currentTarget.focus() }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }}>
    <header className="sp-dialog-head">
      <h2 id={titleId}>{title}</h2>
      <button type="button" className="sp-icon-btn" aria-label="Fermer" disabled={busy} onClick={onClose}><PiX aria-hidden="true" /></button>
    </header>
    <div className="sp-dialog-body">{children}</div>
  </dialog>
}
