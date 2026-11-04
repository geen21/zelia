import React, { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ecolesAPI, orientationAPI, usersAPI } from '../lib/api'
import { BEST_MATCH_MIN_SCORE, buildFormationRelevanceProfile } from '../lib/formationRelevance'
import { buildExplorerProfile, filterExplorerCards, loadExplorerCatalog, mixExplorerCards, nationalExplorerCards, partnerExplorerCards, sortExplorerCards } from '../lib/formationExplorer'
import { SCHOOL_SHARING_NOTICE } from '../lib/schoolSharing'
import { withZeliaUtm } from '../lib/outboundUrl.js'
import { nationalSearchNotice, resolveNationalDepartment } from '../lib/nationalFormationMatching.js'
import './FormationsEcoles.css'

const EMPTY_RESOURCE = { data: null, loading: true, error: '' }
const PAGE_SIZE = 24

function requireList(value) {
  if (!Array.isArray(value)) throw new Error('Invalid formation catalogue response')
  return value
}

export default function FormationsEcoles() {
  const location = useLocation()
  const [resources, setResources] = useState({
    context: EMPTY_RESOURCE, partners: EMPTY_RESOURCE, matched: EMPTY_RESOURCE, submissions: EMPTY_RESOURCE
  })
  const [retry, setRetry] = useState(0)
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [city, setCity] = useState('')
  const [nationwide, setNationwide] = useState(false)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [catalog, setCatalog] = useState({ key: '', rows: [], loading: true, ready: false, error: '', nextQueries: [] })
  const [catalogRequest, setCatalogRequest] = useState({ key: '', queries: null })
  const [submitting, setSubmitting] = useState(new Set())
  const [submissionError, setSubmissionError] = useState('')

  useEffect(() => {
    let active = true
    const requests = [
      ['context', async () => {
        const [analysis, profile, extra] = await Promise.all([
          orientationAPI.getResults({ optional: true }), usersAPI.getProfile(), usersAPI.getExtraInfo()
        ])
        return { analysis: analysis.data.results, profile: buildExplorerProfile(requireList(extra.data.entries), profile.data.profile || {}) }
      }, 'Impossible de charger ton bilan et tes préférences.'],
      ['partners', async () => requireList((await ecolesAPI.partenaires()).data.formations), 'Impossible de charger le catalogue des partenaires.'],
      ['matched', async () => requireList((await ecolesAPI.matched()).data.matched), 'Impossible de calculer les correspondances des partenaires.'],
      ['submissions', async () => requireList((await ecolesAPI.mySubmissions()).data.submissions), 'Impossible de vérifier tes demandes déjà envoyées.']
    ]
    for (const [key, load, message] of requests) {
      setResources((prev) => ({ ...prev, [key]: { ...prev[key], loading: true, error: '' } }))
      load().then((data) => {
        if (active) setResources((prev) => ({ ...prev, [key]: { data, loading: false, error: '' } }))
      }, (error) => {
        console.error(message, error)
        if (active) setResources((prev) => ({ ...prev, [key]: { data: null, loading: false, error: message } }))
      })
    }
    return () => { active = false }
  }, [retry, location.key])

  useEffect(() => {
    const timer = setTimeout(() => setSearch(q.trim()), 350)
    return () => clearTimeout(timer)
  }, [q])

  const context = resources.context.data
  const profile = context?.profile
  const hasSignals = Boolean(context && buildFormationRelevanceProfile(context).groups.length)
  const nearHome = profile?.study_location === 'near_home' && !nationwide
  const department = nearHome
    ? resolveNationalDepartment(profile.department)
    : ''
  const missingLocation = nearHome && !department
  const catalogKey = JSON.stringify([context, search, department, missingLocation, retry, location.key])

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [search, city, nationwide, context])

  useEffect(() => {
    if (resources.context.loading) return
    let active = true
    const controller = new AbortController()
    if (missingLocation) {
      setCatalog({ key: catalogKey, rows: [], loading: false, ready: true, error: '', nextQueries: [] })
      return
    }
    const append = catalogRequest.key === catalogKey && catalogRequest.queries != null
    setCatalog((prev) => ({ ...prev, key: catalogKey, rows: append ? prev.rows : [], loading: true, ready: append && prev.ready, error: '', nextQueries: [] }))
    loadExplorerCatalog(orientationAPI.searchFormations, {
      context: context ? { ...context, profile: nationwide ? { ...profile, study_location: 'both' } : profile } : {},
      search, department, pageSize: PAGE_SIZE,
      queries: append ? catalogRequest.queries : undefined, signal: controller.signal, isCurrent: () => active
    }).then((result) => {
      if (!active || !result) return
      result.errors.forEach((error) => console.error('Formation catalog search failed', error))
      setCatalog((prev) => ({
        key: catalogKey,
        rows: [...(append ? prev.rows : []), ...result.rows],
        loading: false,
        ready: true,
        error: result.errors.length ? 'Certaines formations n’ont pas pu être chargées. Réessaie pour compléter les résultats.' : '',
        nextQueries: result.nextQueries
      }))
    }, (error) => {
      console.error('Formation catalog loading failed', error)
      if (active) setCatalog((prev) => ({ ...prev, loading: false, ready: true, error: 'Impossible de charger les formations nationales. Réessaie dans un instant.' }))
    })
    return () => { active = false; controller.abort() }
  }, [context, resources.context.loading, search, department, missingLocation, catalogKey, catalogRequest])

  const partners = useMemo(() => partnerExplorerCards(resources.partners.data || [], resources.matched.data || []), [resources.partners.data, resources.matched.data])
  const nationals = useMemo(() => {
    const cards = nationalExplorerCards(catalog.rows, {
      ...context, profile: nationwide ? { ...profile, study_location: 'both' } : profile
    })
    return search || !hasSignals ? cards : cards.filter((card) => card.score != null)
  }, [catalog.rows, context, profile, nationwide, search, hasSignals])
  const allCards = useMemo(() => sortExplorerCards([...nationals, ...partners]), [nationals, partners])
  const cities = [...new Set(allCards.map((card) => card.city).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'))
  const filtered = mixExplorerCards([
    ...filterExplorerCards(nationals, { city }),
    ...filterExplorerCards(partners, { q, city })
  ])
  const anchorId = location.hash.startsWith('#formation-') ? location.hash.slice(11) : ''
  const anchorIndex = filtered.findIndex((card) => card.source === 'partner' && String(card.id) === anchorId)
  const initialLoading = resources.context.loading || resources.partners.loading || resources.matched.loading
    || catalog.key !== catalogKey || !catalog.ready || search !== q.trim()
  const displayed = initialLoading ? [] : filtered.slice(0, Math.max(visibleCount, anchorIndex + 1))
  const submitted = new Set((resources.submissions.data || []).map((entry) => String(entry.formation_id)))
  const relevantCount = allCards.filter((card) => card.score != null).length
  const bestKey = allCards[0]?.score >= BEST_MATCH_MIN_SCORE ? allCards[0].key : null
  const busy = initialLoading || catalog.loading

  useEffect(() => {
    if (initialLoading || !anchorId || anchorIndex < 0) return
    document.getElementById(`formation-${anchorId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [anchorId, anchorIndex, initialLoading])

  const submit = async (id) => {
    const key = String(id)
    if (submitting.has(key) || submitted.has(key) || resources.submissions.loading || resources.submissions.error) return
    setSubmitting((prev) => new Set([...prev, key]))
    setSubmissionError('')
    try {
      await ecolesAPI.submit(id)
      setResources((prev) => ({ ...prev, submissions: { ...prev.submissions, data: [...(prev.submissions.data || []), { formation_id: id }] } }))
    } catch (error) {
      console.error('Partner information request failed', error)
      if (error.response?.status === 409) {
        setResources((prev) => ({ ...prev, submissions: { ...prev.submissions, data: [...(prev.submissions.data || []), { formation_id: id }] } }))
      } else {
        setSubmissionError(error.response?.data?.message || 'Impossible d’envoyer ta demande. Réessaie dans un instant.')
      }
    } finally {
      setSubmitting((prev) => { const next = new Set(prev); next.delete(key); return next })
    }
  }

  return <div className="formation-explorer">
    <header className="fe-intro">
      <h1>Les formations à explorer</h1>
      <div className="fe-legend">
        <span className="fe-legend-national">Formation du catalogue national</span>
        <span className="fe-legend-partner"><i className="ph ph-handshake" aria-hidden="true" /> École partenaire de Zélia</span>
      </div>
      <details className="fe-explanation">
        <summary>Comprendre les pourcentages</summary>
        <p>Ils mesurent la correspondance avec ton bilan et tes préférences, pas tes chances d’admission. Sans lien établi avec ton bilan, la formation est indiquée « À explorer ».</p>
      </details>
    </header>

    {Object.entries(resources).filter(([, value]) => value.error).map(([key, value]) => <div className="fe-error" role="alert" key={key}>{value.error} <button onClick={() => setRetry((prev) => prev + 1)}>Réessayer</button></div>)}
    {submissionError && <p className="fe-error" role="alert">{submissionError}</p>}
    {!resources.context.loading && !resources.context.error && !hasSignals && <div className="fe-notice">Fais ton test pour découvrir tes pourcentages de correspondance. Tu peux déjà explorer les formations et les écoles partenaires. <Link to="/orientation">Faire mon test</Link></div>}

    <section className="fe-filters" aria-label="Rechercher des formations et écoles">
      <label>Rechercher une formation ou une école<input type="search" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Informatique, design, nom d’école…" /></label>
      <label>Ville<select aria-label="Ville" value={city} onChange={(event) => setCity(event.target.value)}><option value="">Toutes les villes</option>{cities.map((value) => <option key={value}>{value}</option>)}</select></label>
      <button className="fe-secondary" onClick={() => { setQ(''); setSearch(''); setCity(''); setNationwide(false); setVisibleCount(PAGE_SIZE) }}>Réinitialiser les filtres</button>
      {profile?.study_location === 'near_home' && <label className="fe-location"><input type="checkbox" checked={nationwide} onChange={(event) => setNationwide(event.target.checked)} />Élargir la recherche nationale à toute la France</label>}
    </section>
    {nearHome && <p className="fe-explanation">{missingLocation ? 'Précise ta localisation dans ton profil ou élargis la recherche pour voir les formations nationales.' : `Formations nationales recherchées près de chez toi : ${department}. Toutes les écoles partenaires restent accessibles.`}</p>}
    {nationwide && <p className="fe-explanation">Recherche nationale élargie : vérifie la localisation avant de poursuivre.</p>}

    <div className="fe-summary" aria-live="polite">
      {!initialLoading && <p>{filtered.filter((card) => card.source === 'national').length} formations nationales · {filtered.filter((card) => card.source === 'partner').length} formations partenaires</p>}
      {displayed.length < filtered.length && <span>{displayed.length} sur {filtered.length} affichées</span>}
      {busy && <span role="status">Recherche de tes formations…</span>}
    </div>
    {catalog.error && <div role="alert" className="fe-error">{catalog.error} <button onClick={() => setRetry((prev) => prev + 1)}>Réessayer les formations</button></div>}
    {!busy && !catalog.error && nationalSearchNotice(profile, catalog.rows) && <p className="fe-notice">{nationalSearchNotice(profile, catalog.rows)}</p>}
    {!busy && !catalog.error && !catalog.nextQueries.length && !nationals.length && nearHome && !missingLocation && <p className="fe-notice">Aucune formation nationale trouvée près de chez toi. Coche « Élargir la recherche nationale à toute la France » pour explorer d’autres établissements.</p>}
    {!busy && !catalog.error && !catalog.nextQueries.length && hasSignals && !relevantCount && !search && <p className="fe-notice">Aucune correspondance trouvée pour le moment. Explore les partenaires ci-dessous ou essaie une recherche plus large.</p>}
    {!busy && catalog.nextQueries.length > 0 && !nationals.length && <p className="fe-notice">La recherche nationale se fait par petits lots. Continue pour découvrir d’autres formations.</p>}

    <p className="fe-sharing">{SCHOOL_SHARING_NOTICE} Explorer une fiche ne déclenche aucun partage.</p>
    <div className="fe-grid" aria-label="Formations et écoles">
      {displayed.map((card) => {
        const partner = card.source === 'partner'
        const sent = submitted.has(String(card.id))
        return <article key={card.key} id={partner ? `formation-${card.id}` : undefined} data-source={card.source} data-score={card.score ?? ''} className={`fe-card${partner ? ' fe-card-partner' : ''}${partner && card.raw.highlight_in_results !== false ? ' fe-card-highlight' : ''}${String(card.id) === anchorId ? ' fe-card-target' : ''}`}>
          <div className="fe-card-labels">
            <span className={partner ? 'fe-partner-label' : 'fe-source'}>{partner ? <><i className="ph ph-handshake" aria-hidden="true" /> Partenaire</> : 'Catalogue national'}</span>
            {card.key === bestKey && <span className="fe-best-match">Là où tu peux exceller</span>}
            <span className={card.score != null ? 'fe-score' : 'fe-explore'}>{card.score != null ? `${card.score} % de correspondance` : 'À explorer'}</span>
          </div>
          <h2>{card.title}</h2>
          {card.school && <p className="fe-school">{card.school}</p>}
          <div className="fe-meta">{card.level && <span>{card.level}</span>}{card.city && <span><i className="ph ph-map-pin" aria-hidden="true" /> {card.city}</span>}</div>
          {card.reason && <p className="fe-reason">En lien avec : {card.reason}</p>}
          <div className="fe-card-actions">
            <Link className="fe-primary" to={card.href}>Explorer la formation <i className="ph ph-arrow-up-right" aria-hidden="true" /></Link>
            {card.externalHref && <a className="fe-site" href={withZeliaUtm(card.externalHref)} target="_blank" rel="noopener noreferrer">Site de l’établissement</a>}
            {partner && <button className="fe-secondary" disabled={sent || submitting.has(String(card.id)) || resources.submissions.loading || Boolean(resources.submissions.error)} onClick={() => submit(card.id)}>{sent ? 'Demande envoyée' : submitting.has(String(card.id)) ? 'Envoi en cours…' : 'Demander des informations'}</button>}
          </div>
        </article>
      })}
    </div>
    {!busy && !filtered.length && <p className="fe-notice">Aucune formation affichée. Essaie un autre mot-clé ou réinitialise les filtres.</p>}
    <div className="fe-more">
      {displayed.length < filtered.length && <button className="fe-secondary" onClick={() => setVisibleCount((prev) => Math.max(prev, anchorIndex + 1) + PAGE_SIZE)}>Afficher plus de formations ({filtered.length - displayed.length})</button>}
      {!initialLoading && catalog.nextQueries.length > 0 && <button className="fe-secondary" disabled={catalog.loading} onClick={() => { setCatalogRequest({ key: catalogKey, queries: catalog.nextQueries }); setVisibleCount((prev) => prev + PAGE_SIZE) }}>Chercher d’autres formations nationales</button>}
    </div>
  </div>
}
