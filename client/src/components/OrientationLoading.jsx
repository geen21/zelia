import React, { useEffect, useState } from 'react'

const MESSAGES = ['Gimgembre', 'Ça charbonne', 'On connecte les neurones', 'Ton futur prend forme']

export default function OrientationLoading({ label, playful = true }) {
  const [messageIndex, setMessageIndex] = useState(0)

  useEffect(() => {
    if (!playful) return
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    let interval
    const update = () => {
      window.clearInterval(interval)
      setMessageIndex(0)
      if (!preference.matches) {
        interval = window.setInterval(() => setMessageIndex((index) => (index + 1) % MESSAGES.length), 2800)
      }
    }
    update()
    preference.addEventListener('change', update)
    return () => {
      window.clearInterval(interval)
      preference.removeEventListener('change', update)
    }
  }, [playful])

  return (
    <div className="orientation-loading" aria-busy="true">
      {playful && (
        <div className="loading-scene" aria-hidden="true">
          <svg className="loading-brain" viewBox="0 0 120 100" fill="none">
            <path d="M60 20C51 8 32 11 27 24C12 25 8 42 17 52C9 65 20 82 34 81C41 95 57 88 60 79C63 88 79 95 86 81C100 82 111 65 103 52C112 42 108 25 93 24C88 11 69 8 60 20Z" fill="currentColor" stroke="#111827" strokeWidth="3" strokeLinejoin="round" />
            <path d="M60 21V78M28 26C24 39 35 43 40 38M18 52C31 45 42 52 39 63M34 81C30 68 40 68 48 71M92 26C96 39 85 43 80 38M102 52C89 45 78 52 81 63M86 81C90 68 80 68 72 71" stroke="#111827" strokeWidth="3" strokeLinecap="round" />
            <circle cx="47" cy="51" r="3" fill="#111827" />
            <circle cx="73" cy="51" r="3" fill="#111827" />
            <path d="M50 61Q60 70 70 61" stroke="#111827" strokeWidth="3" strokeLinecap="round" />
          </svg>
          <span key={messageIndex} className="loading-message">{MESSAGES[messageIndex]}</span>
        </div>
      )}
      <p className="loading-label" role="status">{label}</p>
      <div className="loading-track" role="progressbar" aria-label={label}>
        <span />
      </div>
    </div>
  )
}
