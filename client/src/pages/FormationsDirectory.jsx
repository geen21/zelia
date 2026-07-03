import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import SEO from '../components/SEO'
import BlogHeaderNav from './blog/BlogHeaderNav'
import { formationsAPI } from '../lib/api'
import './FormationPublic.css'
import {
  getFormationTitle,
  getFormationSlug,
  getDiplomaFamily,
  getStatusLabel,
  getInitials
} from '../lib/formationDisplay'

const ORIGIN = 'https://zelia.io'
const PAGE_SIZE = 24

function FormationCard({ formation }) {
  const title = getFormationTitle(formation)
  const statusLabel = getStatusLabel(formation.tc)
  const diplomaFamily = getDiplomaFamily(formation)
  const location = [formation.commune, formation.departement].filter(Boolean).join(', ')

  return (
    <Link to={`/formations/${getFormationSlug(formation)}`} className="fp-result-card">
      <div className="fp-result-top">
        <div className="fp-result-monogram">
          {getInitials(formation.etab_nom || title)}
        </div>
        <div className="fp-result-badges">
          {diplomaFamily && <span className="fp-tag fp-tag--dark">{diplomaFamily}</span>}
          {statusLabel && <span className="fp-tag">{statusLabel}</span>}
        </div>
      </div>
      <h3 className="fp-result-title">{title}</h3>
      <p className="fp-result-school">{formation.etab_nom || 'Établissement à préciser'}</p>
      {location && (
        <p className="fp-result-location"><i className="ph ph-map-pin" aria-hidden="true"></i>{location}</p>
      )}
      <span className="fp-result-cta">Voir la formation <i className="ph ph-arrow-right" aria-hidden="true"></i></span>
    </Link>
  )
}

export default function FormationsDirectory() {
  const [q, setQ] = useState('')
  const [region, setRegion] = useState('')
  const [department, setDepartment] = useState('')
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(null)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const requestId = useRef(0)

  const runSearch = useCallback((nextOffset = 0, append = false) => {
    const currentRequest = ++requestId.current
    if (append) setLoadingMore(true)
    else setLoading(true)
    setError('')

    formationsAPI.getAll({
      q: q || undefined,
      region: region || undefined,
      department: department || undefined,
      limit: PAGE_SIZE,
      offset: nextOffset
    })
      .then(({ data }) => {
        if (currentRequest !== requestId.current) return
        const newItems = data?.formations || []
        setItems((prev) => (append ? [...prev, ...newItems] : newItems))
        setTotal(typeof data?.total === 'number' ? data.total : null)
        setOffset(nextOffset + newItems.length)
      })
      .catch(() => {
        if (currentRequest !== requestId.current) return
        setError("La recherche n'a pas abouti. Réessaie avec d'autres critères.")
        if (!append) setItems([])
      })
      .finally(() => {
        if (currentRequest !== requestId.current) return
        setLoading(false)
        setLoadingMore(false)
      })
  }, [q, region, department])

  useEffect(() => {
    const timer = setTimeout(() => runSearch(0, false), 450)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, region, department])

  const hasMore = total != null && offset < total

  return (
    <div className="fp-page">
      <SEO
        title="Formations en France - Toutes les formations post-bac | Zelia"
        description="Explore des dizaines de milliers de formations en France : BTS, BUT, licences, écoles d'ingénieurs et plus. Trouve la formation qui te correspond avec Zelia."
        url={`${ORIGIN}/formations`}
      />
      <BlogHeaderNav />

      <header className="fp-hero fp-directory-hero">
        <div className="container">
          <nav className="fp-breadcrumb" aria-label="Fil d'Ariane">
            <Link to="/">Accueil</Link>
            <span className="sep">/</span>
            <span className="current">Formations</span>
          </nav>
          <h1>{total != null ? `${total.toLocaleString('fr-FR')} formations` : 'Des formations'} en France</h1>
          <p>BTS, BUT, licences, écoles d&apos;ingénieurs, CPGE... Explore le catalogue complet des formations post-bac et trouve celle qui te correspond.</p>

          <div className="fp-search-bar">
            <input
              type="text"
              placeholder="Nom, école, code formation..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Rechercher une formation"
            />
            <input
              type="text"
              placeholder="Région"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              aria-label="Région"
            />
            <input
              type="text"
              placeholder="Département"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              aria-label="Département"
            />
            <button type="button" onClick={() => runSearch(0, false)} disabled={loading}>
              {loading ? <i className="ph ph-circle-notch fp-spin" aria-hidden="true"></i> : 'Rechercher'}
            </button>
          </div>
        </div>
      </header>

      <main className="fp-directory-body">
        <div className="container">
          {error && (
            <div className="fp-note" style={{ marginBottom: 24 }}>
              <i className="ph ph-warning" aria-hidden="true"></i>{error}
            </div>
          )}

          {loading ? (
            <div className="fp-skeleton-page" style={{ minHeight: '30vh' }}><div className="fp-spinner" /></div>
          ) : items.length === 0 ? (
            <div className="fp-empty" style={{ margin: '40px auto' }}>
              <h1>Aucune formation trouvée</h1>
              <p>Essaie d&apos;élargir ta recherche ou de modifier tes filtres.</p>
            </div>
          ) : (
            <>
              {total != null && <p className="fp-directory-count">{total.toLocaleString('fr-FR')} résultats</p>}
              <div className="fp-directory-grid">
                {items.map((item) => <FormationCard key={item.id} formation={item} />)}
              </div>
              {hasMore && (
                <div className="fp-load-more">
                  <button type="button" onClick={() => runSearch(offset, true)} disabled={loadingMore}>
                    {loadingMore ? 'Chargement...' : 'Charger plus de formations'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}
