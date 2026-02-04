import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import apiClient, { usersAPI } from '../../lib/api'
import { buildAvatarFromProfile } from '../../lib/avatar'
import { XP_PER_LEVEL, levelUp } from '../../lib/progression'
import { supabase } from '../../lib/supabase'

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

function sanitizeText(raw) {
  if (!raw) return ''
  return String(raw)
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\*\*/g, '')
    .trim()
}

function parsePoints(raw) {
  const cleaned = sanitizeText(raw)
  const lines = cleaned
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)

  const neg = []
  const pos = []
  let section = ''

  for (const line of lines) {
    const lower = line.toLowerCase()
    if (lower.includes('negatif') || lower.includes('négatif')) {
      section = 'neg'
      continue
    }
    if (lower.includes('positif') || lower.includes('positive') || lower.includes('positifs') || lower.includes('positives')) {
      section = 'pos'
      continue
    }
    const item = line.replace(/^[-•*\d.)\s]+/, '').trim()
    if (!item) continue
    if (section === 'neg') neg.push(item)
    else if (section === 'pos') pos.push(item)
  }

  if (neg.length >= 3 && pos.length >= 3) {
    return { negatives: neg.slice(0, 3), positives: pos.slice(0, 3) }
  }

  const bulletItems = lines
    .filter(line => /^[-•*\d.)\s]+/.test(line))
    .map(line => line.replace(/^[-•*\d.)\s]+/, '').trim())
    .filter(Boolean)

  if (bulletItems.length >= 6) {
    return { negatives: bulletItems.slice(0, 3), positives: bulletItems.slice(3, 6) }
  }

  const fallback = lines.filter(l => !/negatif|négatif|positif|positifs|positive|positives/i.test(l))
  return {
    negatives: fallback.slice(0, 3),
    positives: fallback.slice(3, 6)
  }
}

export default function Niveau15() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [profile, setProfile] = useState(null)
  const [avatarUrl, setAvatarUrl] = useState('')
  const [jobFromResults, setJobFromResults] = useState('')

  const [step, setStep] = useState(0)
  const [choice, setChoice] = useState(null) // 'yes' | 'no'
  const [jobInput, setJobInput] = useState('')

  const [negatives, setNegatives] = useState([])
  const [positives, setPositives] = useState([])
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState('')
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

        // Fetch results to pick a recommended job if profile.home_preference is empty
        try {
          const anal = await apiClient.get('/analysis/my-results', { headers: { 'Cache-Control': 'no-cache' }, params: { _: Date.now() } })
          const r = anal?.data?.results || {}
          const list = r.jobRecommendations || r.job_recommandations || []
          if (Array.isArray(list) && list.length > 0) {
            const title = list[0]?.title || list[0]?.intitule || (typeof list[0] === 'string' ? list[0] : '')
            setJobFromResults(title || '')
          }
        } catch {
          try {
            const latest = await apiClient.get('/results/latest', { headers: { 'Cache-Control': 'no-cache' }, params: { _: Date.now() } })
            const simple = latest?.data?.results?.analysis || latest?.data?.results || {}
            const list = simple.jobRecommendations || simple.job_recommandations || simple.career_matches || []
            if (Array.isArray(list) && list.length > 0) {
              const title = list[0]?.title || list[0]?.intitule || (typeof list[0] === 'string' ? list[0] : '')
              setJobFromResults(title || '')
            }
          } catch {}
        }
      } catch (e) {
        console.error('Niveau15 load error', e)
        if (!mounted) return
        setError('Erreur de chargement')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [navigate])

  const suggestedJob = useMemo(() => {
    const pref = (profile?.home_preference || '').trim()
    if (pref && pref.toLowerCase() !== 'questionnaire') return pref
    return (jobFromResults || '').trim()
  }, [profile, jobFromResults])

  const dialogue = useMemo(() => ([
    { type: 'text', text: "Ça n'est jamais tout blanc ou tout noir, il y a des points positifs et négatifs dans chaque métier", durationMs: 2600 },
    { type: 'text', text: "On a toujours tendance à entendre le positif alors je te propose qu'on voit ensemble les bons et les mauvais côtés pour un métier donné", durationMs: 3000 },
    { type: 'text', text: "Je vais te lister les 3 points les plus négatifs et les 3 points les plus positifs pour chaque métier", durationMs: 2600 },
    { type: 'question', text: `Tu veux le faire pour ce métier ${suggestedJob || 'ce métier'} ?`, durationMs: 1800 }
  ]), [suggestedJob])

  const current = dialogue[Math.min(step, dialogue.length - 1)]
  const { text: typed, done: typedDone, skip } = useTypewriter(current?.text || '', current?.durationMs || 1500)
  const isQuestionStep = current?.type === 'question'

  const onNext = () => {
    if (!typedDone) {
      skip()
      return
    }
    setStep((prev) => Math.min(prev + 1, dialogue.length - 1))
  }

  const onChooseYes = () => {
    if (!typedDone) return
    if (!suggestedJob) {
      setChoice('no')
      return
    }
    setChoice('yes')
    setJobInput('')
  }

  const onChooseNo = () => {
    if (!typedDone) return
    setChoice('no')
  }

  const effectiveJob = choice === 'yes' && suggestedJob ? suggestedJob : jobInput.trim()

  const generatePoints = async () => {
    const jobTitle = effectiveJob
    if (!jobTitle) return
    setGenerating(true)
    setGenerateError('')
    setNegatives([])
    setPositives([])
    try {
      const message =
        `Pour le métier suivant : "${jobTitle}", donne uniquement :\n` +
        `NEGATIFS:\n- ... (3 points négatifs, courts)\n` +
        `POSITIFS:\n- ... (3 points positifs, courts)\n` +
        `Contraintes STRICTES :\n` +
        `- Réponds uniquement avec ces deux sections et des listes à puces.\n` +
        `- 3 points maximum par section.\n` +
        `- Aucune phrase d'introduction ou conclusion.`

      const resp = await apiClient.post('/chat/ai', {
        mode: 'advisor',
        advisorType: 'points-metier',
        message,
        history: []
      })

      const reply = sanitizeText(resp?.data?.reply || '')
      if (!reply) throw new Error('Réponse IA vide')
      const parsed = parsePoints(reply)
      setNegatives(parsed.negatives || [])
      setPositives(parsed.positives || [])
    } catch (e) {
      console.error('Niveau15 generation error', e)
      const msg = e?.response?.data?.error || 'Impossible de générer les points. Réessaie.'
      setGenerateError(msg)
    } finally {
      setGenerating(false)
    }
  }

  const finishLevel = async () => {
    if (finishing) return
    setFinishing(true)
    try {
      // Sauvegarder les points positifs et négatifs
      if (positives.length > 0 || negatives.length > 0) {
        await usersAPI.saveExtraInfo([
          {
            question_id: 'niveau15_positives',
            question_text: 'Points positifs identifiés',
            answer_text: positives.slice(0, 5).join(' | ') || 'Aucun'
          },
          {
            question_id: 'niveau15_negatives',
            question_text: 'Points à améliorer identifiés',
            answer_text: negatives.slice(0, 5).join(' | ') || 'Aucun'
          }
        ])
      }
      await levelUp({ minLevel: 15, xpReward: XP_PER_LEVEL })
      setShowSuccess(true)
    } catch (e) {
      console.warn('Progression update failed (non-blocking):', e)
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
        {/* Left: Avatar + Dialogue */}
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

              {!isQuestionStep && (
                <button
                  type="button"
                  onClick={onNext}
                  className="mt-4 px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200"
                >
                  {step < dialogue.length - 1 ? (typedDone ? 'Suivant' : 'Passer') : 'Suivant'}
                </button>
              )}

              {isQuestionStep && typedDone && (
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={onChooseYes}
                    className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200"
                  >
                    Oui
                  </button>
                  <button
                    type="button"
                    onClick={onChooseNo}
                    className="px-4 py-2 rounded-lg bg-white text-gray-900 border border-gray-300"
                  >
                    Non
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Results */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-card">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center text-white">⚖️</div>
            <h2 className="text-xl font-bold">Points positifs / négatifs</h2>
          </div>

          {isQuestionStep && typedDone && (
            <div className="mb-4">
              {choice === null && (
                <div className="text-text-secondary">Réponds à la question à gauche pour continuer.</div>
              )}

              {choice === 'yes' && suggestedJob && (
                <div className="space-y-3">
                  <div className="text-sm text-text-secondary">Métier sélectionné</div>
                  <div className="font-semibold">{suggestedJob}</div>
                </div>
              )}

              {(choice === 'no' || (choice === 'yes' && !suggestedJob)) && (
                <div className="space-y-2">
                  <label className="text-sm text-text-secondary">Métier souhaité</label>
                  <input
                    type="text"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none"
                    placeholder="Ex: Développeur web"
                    value={jobInput}
                    onChange={(e) => setJobInput(e.target.value)}
                  />
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-3 items-center mb-4">
            <button
              type="button"
              onClick={generatePoints}
              disabled={generating || !effectiveJob}
              className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200 disabled:opacity-50"
            >
              {generating ? 'Génération...' : 'Afficher les points'}
            </button>
            {negatives.length > 0 && positives.length > 0 && (
              <button
                type="button"
                onClick={finishLevel}
                disabled={finishing}
                className="px-4 py-2 rounded-lg bg-black text-white border border-black disabled:opacity-50"
              >
                {finishing ? 'Validation...' : 'Continuer'}
              </button>
            )}
          </div>

          {generateError && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-800 p-3 rounded-lg">{generateError}</div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <div className="font-semibold text-red-800 mb-2">Points négatifs</div>
              {negatives.length ? (
                <ul className="list-disc pl-5 space-y-1 text-sm text-red-900">
                  {negatives.map((item, idx) => (
                    <li key={`neg-${idx}`}>{item}</li>
                  ))}
                </ul>
              ) : (
                <div className="text-sm text-red-700">Aucun point négatif affiché.</div>
              )}
            </div>
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <div className="font-semibold text-green-800 mb-2">Points positifs</div>
              {positives.length ? (
                <ul className="list-disc pl-5 space-y-1 text-sm text-green-900">
                  {positives.map((item, idx) => (
                    <li key={`pos-${idx}`}>{item}</li>
                  ))}
                </ul>
              ) : (
                <div className="text-sm text-green-700">Aucun point positif affiché.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="relative bg-white border border-gray-200 rounded-2xl p-8 shadow-2xl text-center max-w-md w-11/12">
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 w-10 h-10 bg-[#c1ff72] rounded-full flex items-center justify-center shadow-md animate-bounce">🏆</div>
            <h3 className="text-2xl font-extrabold mb-2">Niveau 15 réussi !</h3>
            <p className="text-text-secondary mb-4">Tu as identifié les bons et mauvais côtés du métier.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button onClick={() => navigate('/app/activites')} className="px-4 py-2 rounded-lg bg-white text-gray-900 border border-gray-200">Retour aux activités</button>
              <button onClick={() => navigate('/app/niveau/16')} className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200">Passer au niveau suivant</button>
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