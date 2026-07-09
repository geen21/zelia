import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import SEO from '../components/SEO'
import BlogHeaderNav from './blog/BlogHeaderNav'
import { formationsAPI } from '../lib/api'
import { supabase } from '../lib/supabase'
import './FormationPublic.css'
import {
  getFormationTitle,
  getFormationSlug,
  parseFormationIdFromParam,
  getDiplomaFamily,
  getStatusLabel,
  cleanBraceNote,
  isApprentissage,
  getInitials,
  buildMapsSearchUrl
} from '../lib/formationDisplay'

const ORIGIN = 'https://zelia.io'
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function FormationMonogram({ formation, size = 76 }) {
  const initials = getInitials(formation?.etab_nom || getFormationTitle(formation))
  return (
    <div
      className="fp-monogram"
      style={{ width: size, height: size, fontSize: size * 0.34 }}
    >
      {initials}
    </div>
  )
}

function RelatedCard({ formation }) {
  const title = getFormationTitle(formation)
  return (
    <Link to={`/formations/${getFormationSlug(formation)}`} className="fp-mini-card">
      <div className="fp-mini-monogram">
        {getInitials(formation.etab_nom || title)}
      </div>
      <div className="fp-mini-title">{title}</div>
      <div className="fp-mini-meta">
        <i className="ph ph-map-pin" aria-hidden="true"></i>
        {[formation.etab_nom, formation.commune].filter(Boolean).join(' · ')}
      </div>
    </Link>
  )
}

function RequestInfoCard({ formationId }) {
  const [authChecked, setAuthChecked] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [status, setStatus] = useState('idle') // idle | loading | done | error
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setIsAuthenticated(Boolean(data?.session?.access_token))
      setAuthChecked(true)
    }).catch(() => { if (active) setAuthChecked(true) })
    return () => { active = false }
  }, [])

  async function submitRequest(payload) {
    setStatus('loading')
    setError('')
    try {
      await formationsAPI.requestInfo(formationId, payload)
      setStatus('done')
    } catch (requestError) {
      setError(requestError?.response?.data?.error || 'Échec de la demande, réessaie plus tard.')
      setStatus('error')
    }
  }

  function handleAuthenticatedClick() {
    submitRequest({})
  }

  function handleAnonymousSubmit(event) {
    event.preventDefault()
    if (!EMAIL_PATTERN.test(email)) {
      setError('Merci de renseigner un email valide.')
      setStatus('error')
      return
    }
    submitRequest({ email, firstName, lastName })
  }

  if (!authChecked) return null

  if (status === 'done') {
    return (
      <div className="fp-card">
        <h2><i className="ph ph-check-circle" aria-hidden="true"></i>Demande envoyée</h2>
        <p>L&apos;établissement recevra ta demande et pourra te recontacter.</p>
      </div>
    )
  }

  return (
    <div className="fp-card">
      <h2><i className="ph ph-paper-plane-tilt" aria-hidden="true"></i>Demander plus d&apos;informations</h2>
      <p>Envoie ta demande, l&apos;établissement pourra te recontacter directement.</p>

      {isAuthenticated && !showForm && (
        <button
          type="button"
          onClick={handleAuthenticatedClick}
          disabled={status === 'loading'}
          className="fp-btn fp-btn--primary"
          style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}
        >
          <i className="ph ph-paper-plane-tilt" aria-hidden="true"></i>
          {status === 'loading' ? 'Envoi...' : 'Demander plus d\'informations'}
        </button>
      )}

      {!isAuthenticated && !showForm && (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="fp-btn fp-btn--primary"
          style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}
        >
          <i className="ph ph-paper-plane-tilt" aria-hidden="true"></i>Demander plus d&apos;informations
        </button>
      )}

      {!isAuthenticated && showForm && (
        <form onSubmit={handleAnonymousSubmit} style={{ marginTop: 12, display: 'grid', gap: 8 }}>
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Ton email"
            className="fp-input"
          />
          <input
            type="text"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            placeholder="Prénom (optionnel)"
            className="fp-input"
          />
          <input
            type="text"
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            placeholder="Nom (optionnel)"
            className="fp-input"
          />
          <button type="submit" disabled={status === 'loading'} className="fp-btn fp-btn--primary" style={{ width: '100%', justifyContent: 'center' }}>
            {status === 'loading' ? 'Envoi...' : 'Envoyer ma demande'}
          </button>
        </form>
      )}

      {error && <p style={{ color: '#c0392b', marginTop: 8, fontSize: 13 }}>{error}</p>}
    </div>
  )
}

export default function FormationPublicPage() {
  const { slug } = useParams()
  const id = useMemo(() => parseFormationIdFromParam(slug), [slug])

  const [formation, setFormation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [related, setRelated] = useState([])

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setNotFound(false)
    setFormation(null)

    if (!id) {
      setNotFound(true)
      setLoading(false)
      return undefined
    }

    formationsAPI.getById(id)
      .then(({ data }) => {
        if (!mounted) return
        if (!data?.formation) {
          setNotFound(true)
        } else {
          setFormation(data.formation)
        }
      })
      .catch(() => {
        if (mounted) setNotFound(true)
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    return () => { mounted = false }
  }, [id])

  useEffect(() => {
    if (!formation?.etab_nom) return undefined
    let mounted = true
    formationsAPI.getAll({ etab_nom: formation.etab_nom, limit: 7 })
      .then(({ data }) => {
        if (!mounted) return
        const items = (data?.formations || [])
          .filter((item) => String(item.id) !== String(formation.id))
          .slice(0, 6)
        setRelated(items)
      })
      .catch(() => {})
    return () => { mounted = false }
  }, [formation?.etab_nom, formation?.id])

  if (loading) {
    return (
      <div className="fp-page">
        <BlogHeaderNav />
        <div className="fp-skeleton-page"><div className="fp-spinner" /></div>
      </div>
    )
  }

  if (notFound || !formation) {
    return (
      <div className="fp-page">
        <SEO
          title="Formation introuvable - Zelia"
          description="Cette formation n'est plus disponible sur Zelia."
          url=""
          noindex
        />
        <BlogHeaderNav />
        <div className="fp-empty">
          <h1>Formation introuvable</h1>
          <p>Cette formation n&apos;existe pas ou a été retirée. Explore les autres formations disponibles.</p>
          <Link to="/formations" className="fp-btn fp-btn--primary">Voir toutes les formations</Link>
        </div>
      </div>
    )
  }

  const title = getFormationTitle(formation)
  const slugUrl = getFormationSlug(formation)
  const canonicalUrl = `${ORIGIN}/formations/${slugUrl}`
  const statusLabel = getStatusLabel(formation.tc)
  const diplomaFamily = getDiplomaFamily(formation)
  const location = [formation.commune, formation.departement].filter(Boolean).join(', ')
  const apprentissage = isApprentissage(formation.app)
  const internat = cleanBraceNote(formation.int)
  const selection = cleanBraceNote(formation.aut)
  const filiere = Array.isArray(formation.fl) ? formation.fl.find(Boolean) : ''
  const modalites = Array.isArray(formation.tf) ? formation.tf.filter(Boolean) : []
  const mapsUrl = buildMapsSearchUrl(formation)
  const validEmail = formation.email && EMAIL_PATTERN.test(formation.email) ? formation.email : ''

  const description = [
    title,
    formation.etab_nom ? `proposé par ${formation.etab_nom}` : '',
    location ? `à ${location}` : ''
  ].filter(Boolean).join(' ').slice(0, 155)

  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Course',
        name: title,
        description: description || title,
        url: canonicalUrl,
        provider: {
          '@type': 'EducationalOrganization',
          name: formation.etab_nom || 'Établissement',
          ...(formation.etab_url ? { sameAs: formation.etab_url } : {})
        }
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Accueil', item: `${ORIGIN}/` },
          { '@type': 'ListItem', position: 2, name: 'Formations', item: `${ORIGIN}/formations` },
          { '@type': 'ListItem', position: 3, name: title, item: canonicalUrl }
        ]
      }
    ]
  }

  const hasContactCard = Boolean(
    formation.image || formation.telephone || validEmail || formation.facebook || formation.linkedin || formation.youtube
  )

  return (
    <div className="fp-page">
      <SEO
        title={`${title} - ${formation.etab_nom || 'Zelia'}`}
        description={description || `Découvre ${title} sur Zelia.`}
        url={canonicalUrl}
        type="article"
        image={formation.image}
        schema={schema}
      />
      <BlogHeaderNav />

      <header className="fp-hero">
        <div className="container">
          <nav className="fp-breadcrumb" aria-label="Fil d'Ariane">
            <Link to="/">Accueil</Link>
            <span className="sep">/</span>
            <Link to="/formations">Formations</Link>
            <span className="sep">/</span>
            <span className="current">{title}</span>
          </nav>

          <div className="fp-hero-top">
            <FormationMonogram formation={formation} />
            <div className="fp-hero-badges">
              {statusLabel && <span className="fp-badge"><i className="ph ph-bank" aria-hidden="true"></i>{statusLabel}</span>}
              {diplomaFamily && <span className="fp-badge fp-badge--dark"><i className="ph ph-graduation-cap" aria-hidden="true"></i>{diplomaFamily}</span>}
              {apprentissage && <span className="fp-badge"><i className="ph ph-handshake" aria-hidden="true"></i>Alternance possible</span>}
              {formation.commune && <span className="fp-badge"><i className="ph ph-map-pin" aria-hidden="true"></i>{formation.commune}</span>}
            </div>
          </div>

          <h1>{title}</h1>
          <p className="fp-hero-school">
            <i className="ph ph-buildings" aria-hidden="true"></i>
            {formation.etab_nom || 'Établissement à préciser'}
            {location && <><span className="dot">·</span>{location}</>}
          </p>

          <div className="fp-hero-actions">
            {formation.fiche && (
              <a href={formation.fiche} target="_blank" rel="noopener noreferrer" className="fp-btn fp-btn--primary">
                <i className="ph ph-file-text" aria-hidden="true"></i>Voir la fiche Parcoursup
              </a>
            )}
            <Link to="/orientation" className="fp-btn fp-btn--ghost">
              <i className="ph ph-magic-wand" aria-hidden="true"></i>Est-ce fait pour moi ?
            </Link>
          </div>
        </div>
      </header>

      <main className="fp-body">
        <div className="container">
          <div className="fp-grid">
            <div className="fp-main">
              <section className="fp-card">
                <h2><i className="ph ph-info" aria-hidden="true"></i>Informations clés</h2>
                <div className="fp-kv-grid">
                  {statusLabel && (
                    <div className="fp-kv">
                      <div className="fp-kv-label"><i className="ph ph-bank" aria-hidden="true"></i>Statut</div>
                      <div className="fp-kv-value">{statusLabel}</div>
                    </div>
                  )}
                  {filiere && (
                    <div className="fp-kv">
                      <div className="fp-kv-label"><i className="ph ph-stack" aria-hidden="true"></i>Filière</div>
                      <div className="fp-kv-value">{filiere}</div>
                    </div>
                  )}
                  <div className="fp-kv">
                    <div className="fp-kv-label"><i className="ph ph-handshake" aria-hidden="true"></i>Alternance</div>
                    <div className="fp-kv-value">{apprentissage ? 'Possible' : 'Non renseignée'}</div>
                  </div>
                  {formation.code_formation && (
                    <div className="fp-kv">
                      <div className="fp-kv-label"><i className="ph ph-hash" aria-hidden="true"></i>Code formation</div>
                      <div className="fp-kv-value">{formation.code_formation}</div>
                    </div>
                  )}
                  {formation.annee && (
                    <div className="fp-kv">
                      <div className="fp-kv-label"><i className="ph ph-calendar" aria-hidden="true"></i>Données</div>
                      <div className="fp-kv-value">Rentrée {formation.annee}</div>
                    </div>
                  )}
                </div>

                {modalites.length > 0 && (
                  <div className="fp-tag-row">
                    {modalites.map((tag) => <span key={tag} className="fp-tag">{tag}</span>)}
                  </div>
                )}

                {internat && (
                  <div className="fp-note" style={{ marginTop: 16 }}>
                    <i className="ph ph-moon-stars" aria-hidden="true"></i>
                    <span>{internat}</span>
                  </div>
                )}
                {selection && (
                  <div className="fp-note" style={{ marginTop: internat ? 12 : 16 }}>
                    <i className="ph ph-seal-warning" aria-hidden="true"></i>
                    <span>{selection}</span>
                  </div>
                )}
              </section>

              <section className="fp-card">
                <h2><i className="ph ph-buildings" aria-hidden="true"></i>Établissement</h2>
                <p>
                  <strong>{formation.etab_nom || 'Établissement à préciser'}</strong>
                  {location ? ` — ${location}${formation.region ? `, ${formation.region}` : ''}` : ''}
                </p>
                <div className="fp-links-list">
                  {formation.etab_url && (
                    <a href={formation.etab_url} target="_blank" rel="noopener noreferrer" className="fp-link-row">
                      <i className="ph ph-globe" aria-hidden="true"></i>Site de l&apos;établissement<i className="ph ph-arrow-up-right ext" aria-hidden="true"></i>
                    </a>
                  )}
                  {formation.fiche && (
                    <a href={formation.fiche} target="_blank" rel="noopener noreferrer" className="fp-link-row">
                      <i className="ph ph-file-text" aria-hidden="true"></i>Fiche officielle Parcoursup<i className="ph ph-arrow-up-right ext" aria-hidden="true"></i>
                    </a>
                  )}
                  {formation.dataviz && (
                    <a href={formation.dataviz} target="_blank" rel="noopener noreferrer" className="fp-link-row">
                      <i className="ph ph-chart-bar" aria-hidden="true"></i>Statistiques d&apos;admission<i className="ph ph-arrow-up-right ext" aria-hidden="true"></i>
                    </a>
                  )}
                  {mapsUrl && (
                    <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="fp-link-row">
                      <i className="ph ph-map-trifold" aria-hidden="true"></i>Voir sur la carte<i className="ph ph-arrow-up-right ext" aria-hidden="true"></i>
                    </a>
                  )}
                </div>
              </section>
            </div>

            <aside className="fp-aside">
              <div className="fp-card fp-cta-card">
                <h3>Pas sûr(e) que ce soit fait pour toi ?</h3>
                <p>Fais le test d&apos;orientation gratuit de Zélia et découvre les formations qui te correspondent vraiment.</p>
                <Link to="/orientation" className="fp-btn fp-btn--primary">
                  <i className="ph ph-sparkle" aria-hidden="true"></i>Lancer le test gratuit
                </Link>
              </div>

              {hasContactCard && (
                <div className="fp-card">
                  <h2><i className="ph ph-address-book" aria-hidden="true"></i>Contact</h2>
                  {formation.image && (
                    <div className="fp-contact-logo">
                      <img
                        src={formation.image}
                        alt={formation.etab_nom || 'Logo établissement'}
                        loading="lazy"
                        onError={(e) => { e.currentTarget.parentElement.style.display = 'none' }}
                      />
                    </div>
                  )}
                  <div className="fp-links-list">
                    {formation.telephone && (
                      <a href={`tel:${formation.telephone}`} className="fp-link-row">
                        <i className="ph ph-phone" aria-hidden="true"></i>{formation.telephone}
                      </a>
                    )}
                    {validEmail && (
                      <a href={`mailto:${validEmail}`} className="fp-link-row">
                        <i className="ph ph-envelope" aria-hidden="true"></i>Contacter par email
                      </a>
                    )}
                  </div>
                  {(formation.facebook || formation.linkedin || formation.youtube) && (
                    <div className="fp-social-row">
                      {formation.facebook && (
                        <a href={formation.facebook} target="_blank" rel="noopener noreferrer" className="fp-social-btn" aria-label="Facebook">
                          <i className="ph ph-facebook-logo" aria-hidden="true"></i>
                        </a>
                      )}
                      {formation.linkedin && (
                        <a href={formation.linkedin} target="_blank" rel="noopener noreferrer" className="fp-social-btn" aria-label="LinkedIn">
                          <i className="ph ph-linkedin-logo" aria-hidden="true"></i>
                        </a>
                      )}
                      {formation.youtube && (
                        <a href={formation.youtube} target="_blank" rel="noopener noreferrer" className="fp-social-btn" aria-label="YouTube">
                          <i className="ph ph-youtube-logo" aria-hidden="true"></i>
                        </a>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="fp-card">
                <h2><i className="ph ph-map-pin" aria-hidden="true"></i>Localisation</h2>
                <p>{[formation.commune, formation.departement, formation.region].filter(Boolean).join(' · ')}</p>
                {mapsUrl && (
                  <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="fp-btn fp-btn--ghost" style={{ width: '100%', justifyContent: 'center' }}>
                    <i className="ph ph-map-trifold" aria-hidden="true"></i>Ouvrir dans Maps
                  </a>
                )}
              </div>
            </aside>
          </div>

          {related.length > 0 && (
            <section className="fp-related">
              <h2>Autres formations à {formation.etab_nom}</h2>
              <div className="fp-related-grid">
                {related.map((item) => <RelatedCard key={item.id} formation={item} />)}
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  )
}
