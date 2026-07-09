import React from 'react'
import './PersonaRevealCard.css'

// Shared persona reveal card, used by OrientationFlow (reveal phase) and
// Results (orientation tab). Designed to read like a shareable portrait
// image (centered, poster-style) rather than a page section.
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
  const domaines = (persona.domaines || []).slice(0, 3)
  const posterStyle = persona.avatar?.bg ? { '--persona-poster-bg': persona.avatar.bg } : undefined

  return (
    <div className="persona-card persona-card-poster" style={posterStyle}>
      <span className="persona-kicker">Ton profil Zélia</span>
      {avatarUrl && <img className="persona-avatar persona-avatar-poster" src={avatarUrl} alt={`Avatar ${persona.name}`} />}
      <h1 className="persona-name">{persona.name}</h1>
      <p className="persona-tagline">{persona.tagline}</p>

      {traits.length > 0 && (
        <div className="persona-section">
          <p className="persona-section-title">Compétences clés</p>
          <div className="persona-traits">
            {traits.map((trait, index) => (
              <span key={trait} className={`persona-trait tone-${index % 3}`}>{trait}</span>
            ))}
          </div>
        </div>
      )}

      {domaines.length > 0 && (
        <div className="persona-section">
          <p className="persona-section-title">Où tu peux exceller</p>
          <div className="persona-domain-list">
            {domaines.map((domaine) => (
              <span key={domaine} className="persona-domain-chip">
                <i className="ph ph-check-circle" aria-hidden="true" />
                {domaine}
              </span>
            ))}
          </div>
        </div>
      )}

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
            <button type="button" className="persona-icon-btn" onClick={onDownload || onShare} disabled={sharing} aria-label="Télécharger mon profil" title="Télécharger">
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


