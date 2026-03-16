import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import supabase from '../../lib/supabase'
import { usersAPI } from '../../lib/api'
import { XP_PER_LEVEL, levelUp } from '../../lib/progression'
import { FaCheck, FaBullseye, FaTrophy } from 'react-icons/fa6'

const REGIONS = [
  'Île-de-France',
  'Auvergne-Rhône-Alpes',
  'Nouvelle-Aquitaine',
  'Occitanie',
  'Hauts-de-France',
  'Provence-Alpes-Côte d’Azur',
  'Grand Est',
  'Pays de la Loire',
  'Bretagne',
  'Normandie',
  'Centre-Val de Loire',
  'Bourgogne-Franche-Comté',
  'Corse',
  'Martinique',
  'Guadeloupe',
  'La Réunion'
]

const QUICK_SUGGESTIONS = ['Histoire', 'Philosophie', 'Math', 'Informatique', 'Politique', 'Droit']

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

function normalizeSearchText(value) {
  if (value === null || value === undefined) return ''
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}+/gu, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildSearchIndex(parts = []) {
  if (!Array.isArray(parts)) return normalizeSearchText(parts)
  return normalizeSearchText(parts.filter(Boolean).join(' '))
}

function normalizeFormations(payload) {
  if (!payload) return []
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.data)) return payload.data
  if (Array.isArray(payload?.formations)) return payload.formations
  if (Array.isArray(payload?.items)) return payload.items
  return []
}

function mapFormation(item, index) {
  const nameList = Array.isArray(item?.nm)
    ? item.nm.filter(Boolean)
    : typeof item?.nm === 'string'
      ? [item.nm]
      : []

  const tags = Array.isArray(item?.tf)
    ? item.tf.filter(Boolean)
    : []

  const locationParts = [item?.commune, item?.departement, item?.region].filter(Boolean)
  const primaryTitle = nameList[0] || item?.nmc || item?.etab_nom || 'Formation sans titre'
  const searchIndex = buildSearchIndex([
    nameList.join(' '),
    item?.nmc,
    item?.etab_nom,
    item?.tc,
    item?.typeformation,
    item?.type_formation,
    tags.join(' '),
    locationParts.join(' '),
    item?.description,
    item?.presentation
  ])

  return {
    id: item?.id ?? item?.gta ?? item?.gti ?? `formation-${index}`,
    title: primaryTitle,
    nm: primaryTitle,
    titleVariants: nameList,
    provider: item?.etab_nom || 'Organisme non renseigné',
    city: item?.commune || '',
    department: item?.departement || '',
    region: item?.region || '',
    type: item?.tc || '',
    year: item?.annee || '',
    fiche: item?.fiche || item?.dataviz || item?.etab_url || null,
    etabUrl: item?.etab_url || null,
    tags,
    locationSummary: locationParts.join(' · '),
    searchIndex
  }
}



export default function Niveau6() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [avatarUrl, setAvatarUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [phase, setPhase] = useState('intro')
  const [introIdx, setIntroIdx] = useState(0)
  const [mouthAlt, setMouthAlt] = useState(false)

  const [form, setForm] = useState({ keyword: '', region: '' })
  const [searching, setSearching] = useState(false)
  const [searchExecuted, setSearchExecuted] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [results, setResults] = useState([])
  const [selectedFormation, setSelectedFormation] = useState(null)
  const [jobSuggestions, setJobSuggestions] = useState(QUICK_SUGGESTIONS)

  const [completionSaving, setCompletionSaving] = useState(false)
  const [completionError, setCompletionError] = useState('')
  const [completed, setCompleted] = useState(false)

  const keywordInputRef = useRef(null)

  const firstName = useMemo(() => {
    const raw = profile?.first_name || profile?.prenom || profile?.firstName || ''
    if (!raw || typeof raw !== 'string') return ''
    const trimmed = raw.trim()
    if (!trimmed) return ''
    return trimmed.split(/\s+/)[0]
  }, [profile])

  const introMessages = useMemo(() => ([
    { text: 'Bravo, tu viens de débloquer le niveau Formations !', durationMs: 1200 },
    {
      text: "Je vais te montrer comment sélectionner les pistes d’études et formations dans les grandes familles de métiers.\nTu verras comme c’est riche et inspirant, ça te donnera déjà plein d’infos.",
      durationMs: 3200
    },
    { text: "On va faire ça ensemble : tu appliques chaque étape et je reste là si tu bloques.", durationMs: 2200 },
    { text: firstName ? `On y va ${firstName} ?` : 'On y va ?', durationMs: 200 }
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
        setProfile(prof)
        setAvatarUrl(buildAvatarFromProfile(prof, user.id))
      } catch (err) {
        console.error('Niveau6 profile load failed', err)
        if (!mounted) return
        setError('Impossible de charger ton profil pour le tutoriel formations.')
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
  const filtersDone = Boolean(form.region)
  const searchDone = searchExecuted
  const exploreDone = Boolean(selectedFormation)

  const steps = useMemo(() => ([
    {
      id: 'keyword',
      title: 'Choisir un mot-clé',
      description: 'Ex: design, commerce, santé…',
      done: keywordDone
    },
    {
      id: 'filters',
      title: 'Affiner avec un filtre',
  description: 'Sélectionne une région pour affiner ta recherche.',
      done: filtersDone
    },
    {
      id: 'search',
      title: 'Lancer la recherche',
      description: 'Clique sur “Rechercher” pour obtenir des résultats.',
      done: searchDone
    },
    {
      id: 'explore',
      title: 'Explorer une formation',
      description: 'Ouvre la fiche d’une formation qui t’inspire.',
      done: exploreDone
    }
  ]), [keywordDone, filtersDone, searchDone, exploreDone])

  const stepsCompleted = steps.filter((step) => step.done).length
  const progressPercent = Math.round((stepsCompleted / steps.length) * 100)
  const allStepsDone = steps.every((step) => step.done)

  const guideMessage = useMemo(() => {
    if (!keywordDone) return 'Commence par saisir un mot-clé. Pense à ce que tu veux apprendre ou au métier visé.'
  if (!filtersDone) return 'Super. Ajoute un filtre (région) pour affiner la recherche.'
    if (!searchDone) return 'Parfait ! Lance la recherche pour voir les formations qui correspondent.'
    if (!exploreDone) return 'Clique sur une formation pour ouvrir la fiche et note ce qui te plaît.'
    return 'Tu maîtrises la recherche de formations. Tu peux valider ce niveau quand tu es prêt·e.'
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
    setSelectedFormation(null)

    try {
      const rawKeywords = form.keyword
        ? form.keyword.split(/[^\p{L}\p{N}]+/u).map((part) => part.trim()).filter(Boolean)
        : []
      const keywords = rawKeywords.length > 0 ? rawKeywords.slice(0, 10) : null

      const { data, error } = await supabase.rpc('search_formations', {
        p_keywords: keywords,
        p_department: null,
        p_region: form.region || null,
        p_limit: 24
      })

      if (error) throw error

      const normalized = normalizeFormations(data)
      const mapped = normalized.map((item, index) => mapFormation(item, index))
      setResults(mapped)
      setSearchExecuted(true)
    } catch (err) {
      console.warn('Formation search failed', err)
      setResults([])
      setSearchExecuted(true)
      setSearchError('Impossible de récupérer les formations en ligne. Réessaie dans un instant.')
    } finally {
      setSearching(false)
    }
  }

  const openFormation = (formation) => {
    setSelectedFormation(formation)
    const targetUrl = formation?.fiche || formation?.etabUrl
    if (targetUrl) {
      window.open(targetUrl, '_blank', 'noopener,noreferrer')
    }
  }

  const displayJobSuggestions = useMemo(() => jobSuggestions.slice(0, 6), [jobSuggestions])

  const handleSuggestionClick = (value) => {
    updateForm('keyword', value)
    if (keywordInputRef.current) {
      keywordInputRef.current.focus()
      const len = value.length
      try {
        keywordInputRef.current.setSelectionRange(len, len)
      } catch {
        /* ignore selection errors */
      }
    }
  }

  const handleFinishLevel = async () => {
    if (!allStepsDone) return
    setCompletionSaving(true)
    setCompletionError('')
    try {
  await levelUp({ minLevel: 6, xpReward: XP_PER_LEVEL })
      setCompleted(true)
    } catch (err) {
      console.error('Niveau6 levelUp failed', err)
      setCompletionError('Impossible de valider le niveau pour le moment. Réessaie dans un instant.')
    } finally {
      setCompletionSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 text-center">
        <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-black border-t-transparent" />
        <p className="mt-2 text-text-secondary">Chargement du tutoriel formations…</p>
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
    <div className="p-2 md:p-6">
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
                          {step.done ? <FaCheck className="w-3 h-3" /> : index + 1}
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
                  <h2 className="text-xl font-bold text-gray-900">Rechercher une formation</h2>
                  <p className="text-sm text-gray-500">Complète les champs, puis lance la recherche.</p>
                </div>
                <span className="hidden rounded-full bg-[#c1ff72] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-black md:inline-flex">
                  Tutoriel
                </span>
              </div>

              <form className="space-y-4" onSubmit={handleSearch}>
                {displayJobSuggestions.length > 0 && (
                  <div>
                    <p className="mb-2 text-sm font-medium text-gray-700">Suggestions de formations</p>
                    <div className="flex flex-wrap gap-2">
                      {displayJobSuggestions.map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          onClick={() => handleSuggestionClick(suggestion)}
                          className="rounded-full border border-gray-200 bg-gray-100 px-3 py-1 text-sm text-gray-700 transition hover:border-black hover:bg-gray-200"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Mot-clé</label>
                  <input
                    type="text"
                    ref={keywordInputRef}
                    value={form.keyword}
                    onChange={(event) => updateForm('keyword', event.target.value)}
                    placeholder="Ex: design, communication, data…"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Région</label>
                  <select
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black"
                    value={form.region}
                    onChange={(event) => updateForm('region', event.target.value)}
                  >
                    <option value="">Aucune préférence</option>
                    {REGIONS.map((region) => (
                      <option key={region} value={region}>
                        {region}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={searching}
                  className="inline-flex w-full items-center justify-center rounded-lg border border-gray-200 bg-black px-4 py-2 text-base font-semibold text-white transition hover:bg-gray-900 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {searching ? 'Recherche en cours…' : 'Rechercher'}
                </button>
              </form>

              {searchError && (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">{searchError}</div>
              )}

              <div className="mt-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">Résultats</h3>
                  {searchExecuted && (
                    <span className="text-sm text-gray-500">{results.length} formation(s) trouvée(s)</span>
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
                    {QUICK_SUGGESTIONS.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Suggestions rapides</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {QUICK_SUGGESTIONS.map((suggestion) => (
                            <button
                              key={`suggestion-${suggestion}`}
                              type="button"
                              onClick={() => handleSuggestionClick(suggestion)}
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
                    {results.map((formation, index) => (
                      <button
                        key={formation.id || index}
                        type="button"
                        onClick={() => openFormation(formation)}
                        className={`w-full rounded-2xl border px-4 py-4 text-left transition hover:border-black hover:bg-gray-50 ${
                          selectedFormation?.id === formation.id ? 'border-black bg-gray-50' : 'border-gray-200 bg-white'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h4 className="text-lg font-semibold text-gray-900">{formation.nm || formation.title}</h4>
                            <p className="text-sm text-gray-600">{formation.provider}</p>
                          </div>
                          {formation.type && (
                            <span className="rounded-full bg-[#f68fff]/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#6a3a87]">
                              {formation.type}
                            </span>
                          )}
                        </div>
                        <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-gray-600 md:grid-cols-3">
                          {formation.locationSummary && (
                            <div>
                              <span className="font-medium text-gray-800">Lieu :</span>{' '}
                              {formation.locationSummary}
                            </div>
                          )}
                          {formation.type && (
                            <div>
                              <span className="font-medium text-gray-800">Type :</span> {formation.type}
                            </div>
                          )}
                          {formation.year && (
                            <div>
                              <span className="font-medium text-gray-800">Année :</span> {formation.year}
                            </div>
                          )}
                        </div>
                        {Array.isArray(formation.tags) && formation.tags.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {formation.tags.slice(0, 4).map((tag, tagIndex) => (
                              <span key={tagIndex} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700">
                                #{tag}
                              </span>
                            ))}
                          </div>
                        )}
                        {(formation.fiche || formation.etabUrl) && (
                          <p className="mt-3 text-sm text-gray-500 underline">Consulter la fiche officielle</p>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {selectedFormation && (
                  <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                    <h4 className="text-base font-semibold text-gray-900">Ce que tu peux noter :</h4>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-600">
                      <li>Les spécialisations proposées par la formation (thématiques officielles).</li>
                      <li>L'établissement d'accueil et son type (public, privé...).</li>
                      <li>La localisation précise (commune, département, région).</li>
                      <li>Le lien Parcoursup pour connaître les modalités d'inscription.</li>
                    </ul>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex h-full min-h-[420px] flex-col items-center justify-center text-center text-gray-600">
              <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#c1ff72] text-2xl"><FaBullseye className="w-6 h-6" /></span>
              <h3 className="text-lg font-semibold text-gray-900">Lance le tutoriel pour accéder à la recherche</h3>
              <p className="mt-2 max-w-sm text-sm text-gray-500">
                Clique sur « Commencer le tutoriel » à gauche. Les filtres et les formations officielles apparaîtront juste ici pour t'accompagner étape par étape.
              </p>
            </div>
          )}
        </div>
      </div>

      {completed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="relative bg-white border border-gray-200 rounded-2xl p-8 shadow-2xl text-center max-w-md w-11/12">
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 w-10 h-10 bg-[#c1ff72] rounded-full flex items-center justify-center shadow-md animate-bounce"><FaTrophy className="w-5 h-5 text-yellow-600" /></div>
            <h3 className="text-2xl font-extrabold mb-2">Niveau 6 réussi !</h3>
            <p className="text-text-secondary mb-4">Tu sais maintenant rechercher et comparer les formations qui t'intéressent.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button onClick={() => navigate('/app/activites')} className="px-4 py-2 rounded-lg bg-white text-gray-900 border border-gray-200">Retour aux activités</button>
              <button onClick={() => navigate('/app/niveau/7')} className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200">Passer au niveau suivant</button>
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