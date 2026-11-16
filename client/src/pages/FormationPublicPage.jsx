import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import SEO from '../components/SEO'
import BlogHeaderNav from './blog/BlogHeaderNav'
import { normalizeExternalHttpUrl, withZeliaUtm } from '../lib/outboundUrl.js'
import { trackSiteEvent } from '../lib/analytics.js'
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
  buildMapsSearchUrl,
  buildFormationEditorialSummary
} from '../lib/formationDisplay'

const ORIGIN = 'https://zelia.io'
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function resolvePublicApiBaseUrl() {
  const sameOrigin = typeof window !== 'undefined' && window.location?.origin
    ? `${window.location.origin.replace(/\/$/, '')}/api`
    : '/api'
  const raw = (import.meta.env.VITE_API_URL || '').trim()
  if (!raw) return sameOrigin
  try {
    const parsed = new URL(raw)
    if (
      typeof window !== 'undefined' &&
      parsed.origin === ORIGIN &&
      (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost')
    ) {
      return sameOrigin
    }
    return parsed.toString().replace(/\/$/, '')
  } catch {
    return sameOrigin
  }
}

async function fetchPublicApiJson(pathname, params = null) {
  const base = resolvePublicApiBaseUrl()
  const url = new URL(`${base}${pathname}`, typeof window !== 'undefined' ? window.location.origin : ORIGIN)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v))
    }
  }
  const response = await fetch(url.toString(), { headers: { Accept: 'application/json' } })
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}`)
    error.status = response.status
    throw error
  }
  return response.json()
}

function readInitialFormationBootstrap(expectedId) {
  if (typeof document === 'undefined' || !expectedId) return null
  try {
    const el = document.getElementById('zelia-formation-data')
    if (!el?.textContent) return null
    const parsed = JSON.parse(el.textContent)
    if (String(parsed?.formation?.id) !== String(expectedId)) return null
    return parsed
  } catch {
    return null
  }
}

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

export default function FormationPublicPage() {
  const { slug } = useParams()
  const id = useMemo(() => parseFormationIdFromParam(slug), [slug])
  const bootstrap = useMemo(() => readInitialFormationBootstrap(id), [id])

  const [formation, setFormation] = useState(() => bootstrap?.formation || null)
  const [loading, setLoading] = useState(() => Boolean(id) && !bootstrap?.formation)
  const [notFound, setNotFound] = useState(() => !id)
  const [loadError, setLoadError] = useState(false)
  const [retryToken, setRetryToken] = useState(0)
  const [related, setRelated] = useState(() => (Array.isArray(bootstrap?.related) ? bootstrap.related : []))

  useEffect(() => {
    let mounted = true

    if (!id) {
      setFormation(null)
      setNotFound(true)
      setLoadError(false)
      setLoading(false)
      return undefined
    }

    if (bootstrap?.formation && retryToken === 0) {
      setFormation(bootstrap.formation)
      setRelated(Array.isArray(bootstrap.related) ? bootstrap.related : [])
      setNotFound(false)
      setLoadError(false)
      setLoading(false)
      trackSiteEvent('formation_detail_viewed', { formation_source: 'national' })
      return undefined
    }

    setLoading(true)
    setNotFound(false)
    setLoadError(false)
    setFormation(null)

    fetchPublicApiJson(`/formations/${encodeURIComponent(id)}`)
      .then((data) => {
        if (!mounted) return
        if (!data?.formation) {
          setNotFound(true)
        } else {
          setFormation(data.formation)
          trackSiteEvent('formation_detail_viewed', { formation_source: 'national' })
        }
      })
      .catch((err) => {
        if (!mounted) return
        if (err?.status === 404) {
          setNotFound(true)
        } else {
          setLoadError(true)
        }
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    return () => { mounted = false }
  }, [id, bootstrap, retryToken])

  useEffect(() => {
    if (!formation?.etab_nom) return undefined
    if (bootstrap?.formation && String(bootstrap.formation.id) === String(formation.id) && Array.isArray(bootstrap.related)) {
      return undefined
    }
    let mounted = true
    fetchPublicApiJson('/formations', { etab_nom: formation.etab_nom, limit: 7 })
      .then((data) => {
        if (!mounted) return
        const items = (data?.formations || [])
          .filter((item) => String(item.id) !== String(formation.id))
          .slice(0, 6)
        setRelated(items)
      })
      .catch(() => {})
    return () => { mounted = false }
  }, [formation?.etab_nom, formation?.id, bootstrap])

  if (loading) {
    return (
      <div className="fp-page" style={{ minHeight: '100vh' }}>
        <BlogHeaderNav />
        <div className="fp-skeleton-page" style={{ minHeight: '100vh' }}><div className="fp-spinner" /></div>
      </div>
    )
  }

  if (loadError && !formation) {
    return (
      <div className="fp-page" style={{ minHeight: '100vh' }}>
        <BlogHeaderNav />
        <div className="fp-empty" style={{ maxWidth: 520, margin: '0 auto', padding: '120px 24px', textAlign: 'center' }}>
          <h1>Chargement temporairement indisponible</h1>
          <p>Les informations de cette formation n&apos;ont pas pu être chargées pour le moment. Réessaie dans quelques instants.</p>
          <button type="button" onClick={() => setRetryToken((n) => n + 1)} className="fp-btn fp-btn--primary">
            Réessayer
          </button>
        </div>
      </div>
    )
  }

  if (notFound || !formation) {
    return (
      <div className="fp-page" style={{ minHeight: '100vh' }}>
        <SEO
          title="Formation introuvable - Zelia"
          description="Cette formation n'est plus disponible sur Zelia."
          url=""
          noindex
        />
        <BlogHeaderNav />
        <div className="fp-empty" style={{ maxWidth: 520, margin: '0 auto', padding: '120px 24px', textAlign: 'center' }}>
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
  const summaryParagraphs = buildFormationEditorialSummary(formation)
  const mapsUrl = buildMapsSearchUrl(formation)
  const etabUrl = normalizeExternalHttpUrl(formation.etab_url)
  const ficheUrl = normalizeExternalHttpUrl(formation.fiche)
  const datavizUrl = normalizeExternalHttpUrl(formation.dataviz)
  const facebookUrl = normalizeExternalHttpUrl(formation.facebook)
  const linkedinUrl = normalizeExternalHttpUrl(formation.linkedin)
  const youtubeUrl = normalizeExternalHttpUrl(formation.youtube)
  const imageUrl = normalizeExternalHttpUrl(formation.image)
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
          ...(etabUrl ? { sameAs: etabUrl } : {})
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
    imageUrl || formation.telephone || validEmail || facebookUrl || linkedinUrl || youtubeUrl
  )

  return (
    <div className="fp-page">
      <SEO
        title={`${title} - ${formation.etab_nom || 'Zelia'}`}
        description={description || `Découvre ${title} sur Zelia.`}
        url={canonicalUrl}
        type="article"
        image={imageUrl || undefined}
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
            {ficheUrl && (
              <a href={withZeliaUtm(ficheUrl)} target="_blank" rel="noopener noreferrer" className="fp-btn fp-btn--primary" onClick={() => trackSiteEvent('formation_outbound_clicked', { formation_source: 'national', action: 'parcoursup' })}>
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
                <h2><i className="ph ph-book-open-text" aria-hidden="true"></i>Présentation de la formation</h2>
                {summaryParagraphs.map((paragraph, idx) => (
                  <p key={idx} style={{ marginTop: idx === 0 ? 0 : 12 }}>{paragraph}</p>
                ))}
              </section>

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
                  {etabUrl && (
                    <a href={withZeliaUtm(etabUrl)} target="_blank" rel="noopener noreferrer" className="fp-link-row" onClick={() => trackSiteEvent('formation_outbound_clicked', { formation_source: 'national', action: 'school_website' })}>
                      <i className="ph ph-globe" aria-hidden="true"></i>Site de l&apos;établissement<i className="ph ph-arrow-up-right ext" aria-hidden="true"></i>
                    </a>
                  )}
                  {ficheUrl && (
                    <a href={withZeliaUtm(ficheUrl)} target="_blank" rel="noopener noreferrer" className="fp-link-row" onClick={() => trackSiteEvent('formation_outbound_clicked', { formation_source: 'national', action: 'parcoursup' })}>
                      <i className="ph ph-file-text" aria-hidden="true"></i>Fiche officielle Parcoursup<i className="ph ph-arrow-up-right ext" aria-hidden="true"></i>
                    </a>
                  )}
                  {datavizUrl && (
                    <a href={withZeliaUtm(datavizUrl)} target="_blank" rel="noopener noreferrer" className="fp-link-row">
                      <i className="ph ph-chart-bar" aria-hidden="true"></i>Statistiques d&apos;admission<i className="ph ph-arrow-up-right ext" aria-hidden="true"></i>
                    </a>
                  )}
                  {mapsUrl && (
                    <a href={withZeliaUtm(mapsUrl)} target="_blank" rel="noopener noreferrer" className="fp-link-row">
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
                  {imageUrl && (
                    <div className="fp-contact-logo">
                      <img
                        src={imageUrl}
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
                  {(facebookUrl || linkedinUrl || youtubeUrl) && (
                    <div className="fp-social-row">
                      {facebookUrl && (
                        <a href={withZeliaUtm(facebookUrl)} target="_blank" rel="noopener noreferrer" className="fp-social-btn" aria-label="Facebook">
                          <i className="ph ph-facebook-logo" aria-hidden="true"></i>
                        </a>
                      )}
                      {linkedinUrl && (
                        <a href={withZeliaUtm(linkedinUrl)} target="_blank" rel="noopener noreferrer" className="fp-social-btn" aria-label="LinkedIn">
                          <i className="ph ph-linkedin-logo" aria-hidden="true"></i>
                        </a>
                      )}
                      {youtubeUrl && (
                        <a href={withZeliaUtm(youtubeUrl)} target="_blank" rel="noopener noreferrer" className="fp-social-btn" aria-label="YouTube">
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
                  <a href={withZeliaUtm(mapsUrl)} target="_blank" rel="noopener noreferrer" className="fp-btn fp-btn--ghost" style={{ width: '100%', justifyContent: 'center' }}>
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
