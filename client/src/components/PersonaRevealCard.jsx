import React from 'react'
import { PORTRAIT_LABELS } from '../lib/personas.js'
import './PersonaRevealCard.css'

// Shared persona reveal card (portrait-chinois style), used by
// OrientationFlow (reveal phase) and Results (orientation tab).
export default function PersonaRevealCard({
  persona,
  avatarUrl,
  extraTraits = [],
  onShare,
  sharing = false,
  onDownload,
  onContinue,
  continueLabel = 'On continue !'
}) {
  if (!persona) return null
  const traits = [...(persona.traits || []), ...extraTraits].slice(0, 4)

  return (
    <div className="persona-card">
      <div className="persona-card-head">
        <div>
          <span className="persona-kicker">Ton portrait chinois</span>
          <h1 className="persona-name">{persona.name}</h1>
        </div>
        {avatarUrl && <img className="persona-avatar" src={avatarUrl} alt={`Avatar ${persona.name}`} />}
      </div>

      <div className="persona-traits">
        {traits.map((trait, index) => (
          <span key={trait} className={`persona-trait tone-${index % 3}`}>{trait}</span>
        ))}
      </div>

      <p className="persona-tagline">{persona.tagline}</p>

      <div className="persona-portrait-grid">
        {Object.entries(persona.portrait || {}).map(([key, item]) => (
          <div key={key} className="persona-portrait-tile">
            <small>{PORTRAIT_LABELS[key] || key}</small>
            <span className="persona-portrait-emoji" aria-hidden="true">{item.emoji}</span>
            <strong>{item.label}</strong>
          </div>
        ))}
      </div>

      {(onShare || onContinue) && (
        <div className="persona-actions">
          {onShare && (
            <button type="button" className="persona-icon-btn" onClick={onShare} disabled={sharing} aria-label="Partager sur Instagram" title="Partager">
              <i className="ph ph-instagram-logo" aria-hidden="true" />
            </button>
          )}
          {onShare && (
            <button type="button" className="persona-icon-btn" onClick={onShare} disabled={sharing} aria-label="Partager sur TikTok" title="Partager">
              <i className="ph ph-tiktok-logo" aria-hidden="true" />
            </button>
          )}
          {(onDownload || onShare) && (
            <button type="button" className="persona-icon-btn" onClick={onDownload || onShare} disabled={sharing} aria-label="Télécharger mon portrait" title="Télécharger">
              <i className="ph ph-download-simple" aria-hidden="true" />
            </button>
          )}
          {onContinue && (
            <button type="button" className="persona-continue" onClick={onContinue}>
              {sharing ? 'Préparation...' : continueLabel}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

