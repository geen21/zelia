import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import supabase from '../../lib/supabase'
import apiClient, { usersAPI } from '../../lib/api'
import { XP_PER_LEVEL, levelUp } from '../../lib/progression'

const CONTRACT_TYPES = ['CDI', 'CDD', 'Alternance', 'Stage', 'Intérim', 'Saisonnier']
const QUICK_JOB_SUGGESTIONS = ['Droit', 'Marketing', 'Commerce', 'Histoire', 'Science', 'Physique']

function buildAvatarFromProfile(profile, seed = 'zelia') {
  try {
    if (profile?.avatar_url && typeof profile.avatar_url === 'string') return profile.avatar_url
    if (profile?.avatar && typeof profile.avatar === 'string') return profile.avatar
    if (profile?.avatar_json) {
      let conf = profile.avatar_json
      if (typeof conf === 'string') {
        try {
          conf = JSON.parse(conf)
        } catch {
          /* ignore */
        }
      }
      if (conf && typeof conf === 'object') {
        if (conf.url && typeof conf.url === 'string') {
          try {
            const u = new URL(conf.url)
            if (u.protocol.startsWith('http')) {
              if (!u.searchParams.has('seed')) u.searchParams.set('seed', String(seed))
              if (!u.searchParams.has('size')) u.searchParams.set('size', '300')
              return u.toString()
            }
          } catch {
            /* ignore */
          }
        }
        const params = new URLSearchParams()
        params.set('seed', String(seed))
        Object.entries(conf).forEach(([key, value]) => {
          if (value !== undefined && value !== null && value !== '') params.set(key, String(value))
        })
        if (!params.has('size')) params.set('size', '300')
        return `https://api.dicebear.com/9.x/lorelei/svg?${params.toString()}`
      }
    }
  } catch {
    /* ignore */
  }
  const fallback = new URLSearchParams({ seed: String(seed), size: '300', radius: '15' })
  return `https://api.dicebear.com/9.x/lorelei/svg?${fallback.toString()}`
}

function modifyDicebearUrl(urlStr, params = {}) {
  try {
    const url = new URL(urlStr)
    const isDicebear = /api\.dicebear\.com/.test(url.host) && /\/lorelei\/svg/.test(url.pathname)
    if (!isDicebear) return urlStr
    Object.entries(params).forEach(([key, value]) => {
      if (value === null || value === undefined || value === '') {
        url.searchParams.delete(key)
      } else {
        url.searchParams.set(key, String(value))
      }
    })
    if (!url.searchParams.has('size')) url.searchParams.set('size', '300')
    return url.toString()
  } catch {
    return urlStr
  }
}

function useTypewriter(message, durationMs) {
  const [text, setText] = useState('')
  const [done, setDone] = useState(false)
  const intervalRef = useRef(null)
  const timeoutRef = useRef(null)

  useEffect(() => {
    const full = message || ''
    setText('')
    setDone(false)
    let i = 0
    const step = Math.max(15, Math.floor((durationMs || 1500) / Math.max(1, full.length)))
    intervalRef.current = setInterval(() => {
      i += 1
      setText(full.slice(0, i))
      if (i >= full.length) clearInterval(intervalRef.current)
    }, step)
    timeoutRef.current = setTimeout(() => {
      clearInterval(intervalRef.current)
      setText(full)
      setDone(true)
    }, Math.max(durationMs || 1500, (full.length + 1) * step))

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [message, durationMs])

  const skip = () => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setText(message || '')
    setDone(true)
  }

  return { text, done, skip }
}

function normalizeJobs(payload) {
  if (!payload) return []
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.items)) return payload.items
  if (Array.isArray(payload?.data)) return payload.data
  if (Array.isArray(payload?.results)) return payload.results
  return []
}

function sanitizeValue(value) {
  if (value === null || value === undefined) return ''
  const text = String(value).trim()
  if (!text) return ''
  const lower = text.toLowerCase()
  if (lower === 'nan' || lower === 'null' || lower === 'undefined') return ''
  return text
}

function mapJob(item, index) {
  const title = sanitizeValue(item?.intitule)
  const company = sanitizeValue(item?.entreprise_nom || item?.entreprise)
  const contract = sanitizeValue(item?.typecontrat || item?.type_contrat)
  const location = sanitizeValue(item?.lieutravail_libelle || item?.lieu_travail_libelle || item?.lieu)
  const rome = sanitizeValue(item?.romecode || item?.rome_code)
  const updatedAt = sanitizeValue(item?.dateactualisation || item?.date_actualisation)
  const applyUrl = sanitizeValue(item?.origineoffre_urlorigine || item?.origine_offre_url_origine)
  const contactUrl = sanitizeValue(item?.contact_urlpostulation || item?.contact_url_postulation)
  const logo = sanitizeValue(item?.entreprise_logo)

  const latRaw = sanitizeValue(item?.lieutravail_latitude || item?.lieu_travail_latitude)
  const lonRaw = sanitizeValue(item?.lieutravail_longitude || item?.lieu_travail_longitude)
  const latitude = latRaw ? Number.parseFloat(latRaw) : null
  const longitude = lonRaw ? Number.parseFloat(lonRaw) : null

  return {
    id: item?.id || `emploi-${index}`,
    title: title || 'Intitulé non renseigné',
    company: company || 'Entreprise non indiquée',
    contract,
    location,
    rome,
    updatedAt,
    applyUrl,
    contactUrl,
    logo,
    coordinates: Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null
  }
}

function formatUpdatedAt(value) {
  if (!value) return ''
  try {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
  } catch {
    return ''
  }
}

export default function Niveau9() {
  const navigate = useNavigate()
  const [avatarUrl, setAvatarUrl] = useState('')
  const [firstName, setFirstName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [phase, setPhase] = useState('intro')
  const [introIdx, setIntroIdx] = useState(0)
  const [mouthAlt, setMouthAlt] = useState(false)

  const [form, setForm] = useState({ keyword: '', contract: '' })
  const [searching, setSearching] = useState(false)
  const [searchExecuted, setSearchExecuted] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [results, setResults] = useState([])
  const [selectedJob, setSelectedJob] = useState(null)

  const [completionSaving, setCompletionSaving] = useState(false)
  const [completionError, setCompletionError] = useState('')
  const [completed, setCompleted] = useState(false)

  const introMessages = useMemo(() => ([
    { text: 'Te voilà au niveau Métiers ! On va apprendre à trouver des offres de jobs en un clin d’œil.', durationMs: 3200 },
    { text: 'Je vais te guider pour utiliser la page Emplois et repérer les opportunités qui collent à ton profil.', durationMs: 3800 },
    { text: `Prépare un mot-clé, un contrat et suis-moi étape par étape. On y va ${firstName}?`, durationMs: 2800 }
  ]), [firstName])

  const currentIntro = introMessages[introIdx] || { text: '', durationMs: 2000 }
  const { text: introText, done: introDone, skip: skipIntro } = useTypewriter(currentIntro.text, currentIntro.durationMs)

  const shouldAnimateMouth = phase === 'intro' && !introDone

  useEffect(() => {
    if (!shouldAnimateMouth) return undefined
    const id = setInterval(() => setMouthAlt((v) => !v), 200)
    return () => clearInterval(id)
  }, [shouldAnimateMouth])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const { data: { user } = {} } = await supabase.auth.getUser()
        if (!user) {
          navigate('/login')
          return
        }
        const profileRes = await usersAPI.getProfile().catch(() => null)
        if (!mounted) return
        const prof = profileRes?.data?.profile || profileRes?.data || {}
        setAvatarUrl(buildAvatarFromProfile(prof, user.id))
        const rawName = (prof?.first_name || prof?.prenom || '').trim()
        if (rawName) setFirstName(rawName.split(/\s+/)[0])
      } catch (err) {
        console.error('Niveau9 profile load failed', err)
        if (!mounted) return
        setError('Impossible de charger ton profil pour le tutoriel métiers.')
      } finally {
        if (mounted) setLoading(false)
      }
    })()

    return () => {
      mounted = false
    }
  }, [navigate])

  const displayedAvatarUrl = useMemo(() => {
    if (!avatarUrl) return avatarUrl
    try {
      const url = new URL(avatarUrl)
      const isDicebear = /api\.dicebear\.com/.test(url.host) && /\/lorelei\/svg/.test(url.pathname)
      if (!isDicebear) return avatarUrl
      if (shouldAnimateMouth) {
        return modifyDicebearUrl(avatarUrl, { mouth: mouthAlt ? 'happy08' : 'happy01' })
      }
      return modifyDicebearUrl(avatarUrl, { mouth: null })
    } catch {
      return avatarUrl
    }
  }, [avatarUrl, shouldAnimateMouth, mouthAlt])

  const keywordDone = form.keyword.trim().length >= 2
  const filtersDone = Boolean(form.contract)
  const searchDone = searchExecuted
  const exploreDone = Boolean(selectedJob)

  const steps = useMemo(() => ([
    {
      id: 'keyword',
      title: 'Choisir un mot-clé',
      description: 'Ex: développeur, vente, marketing…',
      done: keywordDone
    },
    {
      id: 'filters',
      title: 'Sélectionner un filtre',
  description: 'Choisis un type de contrat pour cibler les offres.',
      done: filtersDone
    },
    {
      id: 'search',
      title: 'Lancer la recherche',
      description: 'Clique sur “Rechercher” pour afficher les offres.',
      done: searchDone
    },
    {
      id: 'explore',
      title: 'Explorer une offre',
      description: 'Ouvre la fiche ou note les infos clés.',
      done: exploreDone
    }
  ]), [keywordDone, filtersDone, searchDone, exploreDone])

  const stepsCompleted = steps.filter((step) => step.done).length
  const progressPercent = Math.round((stepsCompleted / steps.length) * 100)
  const allStepsDone = steps.every((step) => step.done)

  const guideMessage = useMemo(() => {
  if (!keywordDone) return 'Commence par saisir un mot-clé. Pense au métier ou au secteur que tu vises.'
  if (!filtersDone) return 'Top ! Choisis un type de contrat pour cibler les offres.'
    if (!searchDone) return 'Parfait, lance la recherche pour voir les offres disponibles.'
    if (!exploreDone) return 'Clique sur une offre et observe le contrat, la localisation et la date.'
    return 'Tu maîtrises maintenant la recherche de jobs. Tu peux valider ce niveau quand tu veux.'
  }, [keywordDone, filtersDone, searchDone, exploreDone])

  const handleIntroNext = () => {
    if (!introDone) {
      skipIntro()
      return
    }
    if (introIdx + 1 < introMessages.length) {
      setIntroIdx((idx) => idx + 1)
    } else {
      setPhase('guide')
    }
  }

  const updateForm = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSearch = async (event) => {
    event?.preventDefault()
    setSearchError('')
    setSearching(true)
    setSelectedJob(null)

    try {
      const params = { page: 1, page_size: 24 }
      if (form.keyword.trim()) params.q = form.keyword.trim()
      if (form.contract) params.typecontrat = form.contract

      const { data } = await apiClient.get('/catalog/metiers/search', {
        params,
        timeout: 25000
      })

      const items = Array.isArray(data?.items) ? data.items : []
      const normalized = normalizeJobs(items)
      const mapped = normalized.map((item, index) => mapJob(item, index))
      setResults(mapped)
      setSearchExecuted(true)
    } catch (err) {
      console.warn('Job search failed', err)
      setResults([])
      setSearchExecuted(true)
      setSearchError('Impossible de récupérer les offres. Réessaie dans un instant.')
    } finally {
      setSearching(false)
    }
  }

  const openJob = (job) => {
    setSelectedJob(job)
    const targetUrl = job?.applyUrl || job?.contactUrl
    if (targetUrl) {
      window.open(targetUrl, '_blank', 'noopener,noreferrer')
    }
  }

  const handleFinishLevel = async () => {
    if (!allStepsDone) return
    setCompletionSaving(true)
    setCompletionError('')
    try {
  await levelUp({ minLevel: 9, xpReward: XP_PER_LEVEL })
      setCompleted(true)
    } catch (err) {
      console.error('Niveau9 levelUp failed', err)
      setCompletionError('Impossible de valider le niveau pour le moment. Réessaie dans un instant.')
    } finally {
      setCompletionSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 text-center">
        <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-black border-t-transparent" />
        <p className="mt-2 text-text-secondary">Chargement du tutoriel métiers…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6">
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
          <div className="flex flex-col items-center gap-6 md:flex-row md:items-start">
            <img
              src={displayedAvatarUrl}
              alt="Avatar"
              className="mx-auto h-28 w-28 rounded-2xl border border-gray-100 bg-white object-contain shadow-sm sm:h-36 sm:w-36 md:h-44 md:w-44 md:mx-0 lg:h-52 lg:w-52 xl:h-60 xl:w-60 2xl:h-64 2xl:w-64"
            />
            <div className="w-full flex-1">
              <div className="relative w-full rounded-2xl bg-black p-4 text-white md:p-5">
                <div className="min-h-[3.5rem] whitespace-pre-wrap text-base leading-relaxed md:text-lg">
                  {phase === 'intro' ? introText : guideMessage}
                </div>
                <div className="absolute -left-2 top-6 h-0 w-0 border-b-8 border-r-8 border-t-8 border-b-transparent border-r-black border-t-transparent" />
              </div>

              {phase === 'intro' ? (
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={handleIntroNext}
                    className="w-full rounded-lg border border-gray-200 bg-[#c1ff72] px-4 py-2 text-black font-medium sm:w-auto"
                  >
                    {introIdx === introMessages.length - 1 ? 'Commencer le tutoriel' : 'Suivant'}
                  </button>
                </div>
              ) : (
                <div className="mt-5 space-y-4">
                  <div>
                    <div className="mb-1 flex items-center justify-between text-sm text-text-secondary">
                      <span>Progression du tutoriel</span>
                      <span>{progressPercent}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-200">
                      <div className="h-2 rounded-full bg-black" style={{ width: `${progressPercent}%` }} />
                    </div>
                  </div>

                  <div className="space-y-2">
                    {steps.map((step, index) => (
                      <div
                        key={step.id}
                        className={`flex items-start gap-3 rounded-xl border px-3 py-3 ${step.done ? 'border-emerald-200 bg-emerald-50' : 'border-gray-100 bg-gray-50'}`}
                      >
                        <span
                          className={`mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${step.done ? 'bg-black text-white' : 'border border-gray-300 bg-white text-gray-400'}`}
                        >
                          {step.done ? '✓' : index + 1}
                        </span>
                        <div>
                          <p className="font-medium text-gray-900">{step.title}</p>
                          <p className="text-sm text-gray-500">{step.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {completionError && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{completionError}</div>
                  )}

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <button
                      type="button"
                      onClick={handleFinishLevel}
                      disabled={!allStepsDone || completionSaving}
                      className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-[#c1ff72] px-4 py-2 text-base font-semibold text-black transition disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {completionSaving ? 'Validation…' : 'Valider le niveau'}
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('/app/activites')}
                      className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-base font-semibold text-gray-900"
                    >
                      Quitter
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
          {phase !== 'intro' ? (
            <>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Rechercher un emploi</h2>
                  <p className="text-sm text-gray-500">Complète les filtres, puis lance la recherche.</p>
                </div>
                <span className="hidden rounded-full bg-[#c1ff72] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-black md:inline-flex">
                  Tutoriel
                </span>
              </div>

              <form className="space-y-4" onSubmit={handleSearch}>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Mot-clé</label>
                  <input
                    type="text"
                    value={form.keyword}
                    onChange={(event) => updateForm('keyword', event.target.value)}
                    placeholder="Ex: développeur, vendeur, marketing…"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black"
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label className="mb-1 block text-sm font-medium text-gray-700">Type de contrat</label>
                    <select
                      className="w-full rounded-lg border border-gray-300 px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-black"
                      value={form.contract}
                      onChange={(event) => updateForm('contract', event.target.value)}
                    >
                      <option value="">Tous</option>
                      {CONTRACT_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={searching}
                  className="inline-flex w-full items-center justify-center rounded-lg border border-gray-200 bg-black px-4 py-2 text-base font-semibold text-white transition hover:bg-gray-900 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {searching ? (
                    <>
                      <svg className="mr-2 h-5 w-5 animate-spin text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Recherche en cours…
                    </>
                  ) : (
                    'Rechercher'
                  )}
                </button>
              </form>

              {searchError && (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">{searchError}</div>
              )}

              <div className="mt-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">Résultats</h3>
                  {searchExecuted && (
                    <span className="text-sm text-gray-500">{results.length} offre(s) trouvée(s)</span>
                  )}
                </div>

                {!searchExecuted && (
                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                    Utilise le formulaire ci-dessus pour lancer ta première recherche.
                  </div>
                )}

                {searchExecuted && results.length === 0 && (
                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4 text-sm text-gray-600">
                    <p>Aucun résultat pour ces critères. Essaie un autre mot-clé ou élargis les filtres.</p>
                    {QUICK_JOB_SUGGESTIONS.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Suggestions rapides</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {QUICK_JOB_SUGGESTIONS.map((suggestion) => (
                            <button
                              key={`job-suggestion-${suggestion}`}
                              type="button"
                              onClick={() => updateForm('keyword', suggestion)}
                              className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700 transition hover:border-black"
                            >
                              {suggestion}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {results.length > 0 && (
                  <div className="grid grid-cols-1 gap-4">
                    {results.map((job, index) => (
                      <button
                        key={job.id || index}
                        type="button"
                        onClick={() => openJob(job)}
                        className={`w-full rounded-2xl border px-4 py-4 text-left transition hover:border-black hover:bg-gray-50 ${
                          selectedJob?.id === job.id ? 'border-black bg-gray-50' : 'border-gray-200 bg-white'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h4 className="text-lg font-semibold text-gray-900">{job.title}</h4>
                            <p className="text-sm text-gray-600">{job.company}</p>
                          </div>
                          {job.contract && (
                            <span className="rounded-full bg-[#f68fff]/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#6a3a87]">
                              {job.contract}
                            </span>
                          )}
                        </div>
                        <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-gray-600 md:grid-cols-3">
                          {job.location && (
                            <div>
                              <span className="font-medium text-gray-800">Lieu :</span> {job.location}
                            </div>
                          )}
                          {job.rome && (
                            <div>
                              <span className="font-medium text-gray-800">Code ROME :</span> {job.rome}
                            </div>
                          )}
                          {job.updatedAt && (
                            <div>
                              <span className="font-medium text-gray-800">Mise à jour :</span>{' '}
                              {formatUpdatedAt(job.updatedAt) || job.updatedAt}
                            </div>
                          )}
                        </div>
                        {job.applyUrl && (
                          <p className="mt-3 text-sm text-gray-500 underline">Voir l’offre officielle</p>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {selectedJob && (
                  <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                    <h4 className="text-base font-semibold text-gray-900">Ce que tu peux noter :</h4>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-600">
                      <li>Le type de contrat et la localisation précise.</li>
                      <li>La localisation exacte et la date de mise à jour.</li>
                      <li>Le code ROME pour approfondir le métier.</li>
                      <li>Les liens pour postuler ou contacter l’entreprise.</li>
                    </ul>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex h-full min-h-[420px] flex-col items-center justify-center text-center text-gray-600">
              <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#c1ff72] text-2xl">💼</span>
              <h3 className="text-lg font-semibold text-gray-900">Lance le tutoriel pour accéder à la recherche</h3>
              <p className="mt-2 max-w-sm text-sm text-gray-500">
                Clique sur « Commencer le tutoriel » à gauche. Les filtres et les offres apparaîtront juste ici pour t'accompagner étape par étape.
              </p>
            </div>
          )}
        </div>
      </div>

      {completed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="relative bg-white border border-gray-200 rounded-2xl p-8 shadow-2xl text-center max-w-md w-11/12">
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 w-10 h-10 bg-[#c1ff72] rounded-full flex items-center justify-center shadow-md animate-bounce">🏆</div>
            <h3 className="text-2xl font-extrabold mb-2">Niveau 9 réussi !</h3>
            <p className="text-text-secondary mb-4">Tu sais maintenant filtrer et analyser les offres d'emploi.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button onClick={() => navigate('/app/activites')} className="px-4 py-2 rounded-lg bg-white text-gray-900 border border-gray-200">Retour aux activités</button>
              <button onClick={() => navigate('/app/niveau/10')} className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200">Passer au niveau suivant</button>
            </div>
            {/* Subtle confetti dots */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="absolute w-2 h-2 bg-pink-400 rounded-full left-6 top-8 animate-ping" />
              <div className="absolute w-2 h-2 bg-yellow-400 rounded-full right-8 top-10 animate-ping" />
              <div className="absolute w-2 h-2 bg-blue-400 rounded-full left-10 bottom-8 animate-ping" />
              <div className="absolute w-2 h-2 bg-green-400 rounded-full right-6 bottom-10 animate-ping" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}