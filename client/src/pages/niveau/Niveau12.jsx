import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import supabase from '../../lib/supabase'
import apiClient, { usersAPI } from '../../lib/api'
import { buildAvatarFromProfile } from '../../lib/avatar'
import { XP_PER_LEVEL, levelUp } from '../../lib/progression'

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

function sanitizeAiLines(raw) {
  if (!raw) return []
  const cleaned = String(raw)
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\*\*/g, '')
    .replace(/#+\s*/g, '')
    .trim()
  const lines = cleaned
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-•*\d.\)\s]+/, '').trim())
    .filter(Boolean)
  return lines.length ? lines : cleaned ? [cleaned] : []
}

export default function Niveau12() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [profile, setProfile] = useState(null)
  const [avatarUrl, setAvatarUrl] = useState('')

  const [step, setStep] = useState(0)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')

  const [selectedJob, setSelectedJob] = useState('')
  const [studiesLines, setStudiesLines] = useState([])
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')

  const [showSuccess, setShowSuccess] = useState(false)
  const [finishing, setFinishing] = useState(false)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          navigate('/login')
          return
        }
        const pRes = await usersAPI.getProfile().catch(() => null)
        if (!mounted) return
        const prof = pRes?.data?.profile || pRes?.data || null
        setProfile(prof)
        setAvatarUrl(buildAvatarFromProfile(prof, user.id))
      } catch (e) {
        console.error('Niveau12 load error', e)
        if (!mounted) return
        setError('Erreur de chargement')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [navigate])

  const firstName = useMemo(() => {
    const raw = (profile?.first_name || profile?.prenom || '').trim()
    if (!raw) return ''
    return raw.split(/\s+/)[0]
  }, [profile])

  const greeting = firstName ? `Ok ${firstName},` : 'Ok,'

  const dialogue = useMemo(() => ([
    { text: `${greeting} tu peux choisir un métier en tapant dans la barre de recherche.`, durationMs: 1600 },
    { text: "On va faire en sorte de te donner les études éxactes pour aboutir à ce métier.", durationMs: 1600 },
    { text: "Il n'y a peut être pas ton métier de rêve dans cette liste, mais c'est une liste qui répertorie tous les métiers recherchés actuellement en france.", durationMs: 2000 }
  ]), [greeting])

  const current = dialogue[Math.min(step, dialogue.length - 1)]
  const { text: typed, done: typedDone, skip } = useTypewriter(
    current?.text || '',
    current?.durationMs || 1400
  )

  const started = step >= dialogue.length

  const onNext = () => {
    if (!typedDone) {
      skip()
      return
    }
    setStep((prev) => Math.min(prev + 1, dialogue.length))
  }

  useEffect(() => {
    const term = query.trim()
    if (term.length < 2 || selectedJob) {
      setResults([])
      setSearchError('')
      return
    }
    let cancelled = false
    const id = setTimeout(async () => {
      if (cancelled) return
      setSearching(true)
      setSearchError('')
      try {
        const { data } = await apiClient.get('/catalog/metiers/search', {
          params: { q: term, page: 1, page_size: 60 },
          timeout: 25000 // 25 secondes pour gérer les 230k entrées
        })
        const items = Array.isArray(data?.items) ? data.items : []
        const seen = new Set()
        const unique = []
        for (const item of items) {
          const titleRaw = (item?.intitule || '').trim()
          if (!titleRaw) continue
          const key = titleRaw.toLowerCase()
          if (seen.has(key)) continue
          seen.add(key)
          unique.push(titleRaw)
          if (unique.length >= 12) break
        }
        if (!cancelled) setResults(unique)
      } catch (e) {
        console.error('Niveau12 search error', e)
        if (!cancelled) setSearchError('Impossible de charger les métiers. Réessaie.')
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, 450)

    return () => {
      cancelled = true
      clearTimeout(id)
    }
  }, [query, selectedJob])

  const requestStudies = async (jobTitle) => {
    if (!jobTitle) return
    setAiError('')
    setAiLoading(true)
    setStudiesLines([])
    try {
      const message = `Donne uniquement la liste des études exactes pour réussir au métier suivant en France : "${jobTitle}".\n` +
        `Contraintes OBLIGATOIRES :\n` +
        `- Réponds uniquement par une liste, sans phrase d'introduction ni conclusion.\n` +
        `- Chaque ligne commence par "-".\n` +
        `- Indique les diplômes/études exacts (CAP, Bac, BTS, BUT, Licence, Master, etc.) et, si utile, les spécialités précises.\n` +
        `- Aucun autre texte.`

      const resp = await apiClient.post('/chat/ai', {
        mode: 'advisor',
        advisorType: 'etudes-metier',
        message,
        history: []
      })
      const reply = resp?.data?.reply || ''
      const lines = sanitizeAiLines(reply)
      if (!lines.length) throw new Error('Réponse IA vide')
      setStudiesLines(lines)
    } catch (e) {
      console.error('Niveau12 Gemini error', e)
      const message = e?.response?.data?.error || "Impossible de consulter Gemini pour ce métier. Réessaie dans un instant."
      setAiError(message)
    } finally {
      setAiLoading(false)
    }
  }

  const onSelectJob = async (title) => {
    if (!title) return
    setSelectedJob(title)
    setQuery(title)
    setResults([])
    await requestStudies(title)
  }

  const onReset = () => {
    setSelectedJob('')
    setStudiesLines([])
    setAiError('')
    setQuery('')
  }

  const onFinish = async () => {
    if (finishing) return
    setFinishing(true)
    try {
      // Sauvegarder les données du niveau 12
      if (selectedJob && studiesLines.length > 0) {
        await usersAPI.saveExtraInfo([
          {
            question_id: 'niveau12_selected_job',
            question_text: 'Métier exploré au niveau 12',
            answer_text: selectedJob
          },
          {
            question_id: 'niveau12_studies',
            question_text: 'Études pour ce métier',
            answer_text: studiesLines.slice(0, 5).join(' | ')
          }
        ])
      }
      await levelUp({ minLevel: 12, xpReward: XP_PER_LEVEL })
      setShowSuccess(true)
    } catch (e) {
      console.error('Niveau12 levelUp failed', e)
      setAiError('Impossible de valider le niveau pour le moment. Réessaie.')
    } finally {
      setFinishing(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 text-center">
        <div className="inline-block w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
        <p className="mt-2 text-text-secondary">Chargement…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-lg">{error}</div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-card">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
            <img
              src={avatarUrl}
              alt="Avatar"
              className="w-28 h-28 sm:w-36 sm:h-36 md:w-44 md:h-44 lg:w-52 lg:h-52 rounded-2xl border border-gray-100 shadow-sm object-contain bg-white mx-auto md:mx-0"
            />
            <div className="flex-1 w-full">
              <div className="relative bg-black text-white rounded-2xl p-4 md:p-5 w-full">
                <div className="text-base md:text-lg leading-relaxed whitespace-pre-wrap min-h-[3.5rem]">
                  {typed}
                </div>
                <div className="absolute -left-2 top-6 w-0 h-0 border-t-8 border-b-8 border-r-8 border-t-transparent border-b-transparent border-r-black" />
              </div>

              {!started && (
                <button
                  type="button"
                  onClick={onNext}
                  className="mt-4 px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200"
                >
                  {step < dialogue.length - 1 ? 'Suivant' : 'Commencer'}
                </button>
              )}

              {started && selectedJob && studiesLines.length > 0 && (
                <div className="mt-4 flex flex-col sm:flex-row gap-3">
                  <button
                    type="button"
                    onClick={onFinish}
                    disabled={finishing}
                    className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200 w-full sm:w-auto disabled:opacity-60"
                  >
                    Continuer
                  </button>
                  <button
                    type="button"
                    onClick={onReset}
                    className="px-4 py-2 rounded-lg bg-white text-gray-900 border border-gray-300 w-full sm:w-auto"
                  >
                    Sélectionner un autre métier
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-card">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center text-white">🔎</div>
          <h2 className="text-xl font-bold">Choisir un métier</h2>
        </div>

        {!started && (
          <div className="text-text-secondary">Lis le dialogue puis utilise la barre de recherche.</div>
        )}

        {started && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="metier-search" className="text-sm font-semibold text-gray-700">
                Barre de recherche
              </label>
              <input
                id="metier-search"
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  if (selectedJob) {
                    setSelectedJob('')
                    setStudiesLines([])
                  }
                }}
                placeholder="Ex: Data analyst, infirmier, UX designer…"
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base text-gray-900 shadow-sm focus:border-black focus:outline-none focus:ring-2 focus:ring-black/10"
              />
            </div>

            {searching && (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
                <span>Recherche en cours…</span>
              </div>
            )}

            {searchError && (
              <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-lg">{searchError}</div>
            )}

            {!selectedJob && query.trim().length >= 2 && !searching && !results.length && !searchError && (
              <div className="text-text-secondary">Aucun métier trouvé. Essaie un autre mot-clé.</div>
            )}

            {!selectedJob && results.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {results.map((title) => (
                  <button
                    key={title}
                    type="button"
                    onClick={() => onSelectJob(title)}
                    className="text-left px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 hover:bg-gray-100"
                  >
                    <div className="font-medium text-gray-900">{title}</div>
                    <div className="text-xs text-gray-500">Voir les études exactes</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        </div>

        {started && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-card lg:col-span-2">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center text-white">🎓</div>
            <h2 className="text-xl font-bold">Études exactes</h2>
          </div>

          {!selectedJob && (
            <div className="text-text-secondary">Sélectionne un métier pour afficher les études exactes.</div>
          )}

          {selectedJob && aiLoading && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
              <span>Génération des études…</span>
            </div>
          )}

          {selectedJob && aiError && (
            <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-lg">{aiError}</div>
          )}

          {selectedJob && !aiLoading && !aiError && studiesLines.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="text-sm text-gray-500 mb-2">Métier sélectionné : <span className="font-semibold text-gray-900">{selectedJob}</span></div>
              <ul className="list-disc pl-5 text-text-secondary space-y-1">
                {studiesLines.map((line, idx) => (
                  <li key={`${line}-${idx}`}>{line}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        )}
      </div>

      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="relative bg-white border border-gray-200 rounded-2xl p-8 shadow-2xl text-center max-w-md w-11/12">
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 w-10 h-10 bg-[#c1ff72] rounded-full flex items-center justify-center shadow-md animate-bounce">🏆</div>
            <h3 className="text-2xl font-extrabold mb-2">Niveau 12 réussi !</h3>
            <p className="text-text-secondary mb-4">Tu as complété ce niveau avec succès.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button onClick={() => navigate('/app/activites')} className="px-4 py-2 rounded-lg bg-white text-gray-900 border border-gray-200">Retour aux activités</button>
              <button onClick={() => navigate('/app/niveau/13')} className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200">Passer au niveau suivant</button>
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