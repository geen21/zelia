import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import supabase from '../../lib/supabase'
import { analysisAPI, usersAPI } from '../../lib/api'
import { XP_PER_LEVEL, levelUp } from '../../lib/progression'

const DIALOGUE_STEPS = [
  {
    id: 'intro-1',
    text: "J'espère que ça va toujours, te voici au niveau 7, tu avances super bien!",
    durationMs: 2400
  },
  {
    id: 'intro-2',
    text: 'Je commence à bien te connaitre, merci pour toutes ces infos !',
    durationMs: 2500
  },
  {
    id: 'intro-3',
    text: 'Ici le but est de rentrer dans une relation honnête pour avancer ensemble dans la bonne direction.',
    durationMs: 4000
  },
  {
    id: 'intro-4',
    text: 'Je ne connais pas encore tes notes mais je peux déjà te dire si un métier te correspond ou pas sur la base de ces infos.',
    durationMs: 4500
  },
  {
    id: 'job-prompt',
    text: 'Dis-moi un métier et je te dirai si oui ou non tu es fait pour ce métier',
    durationMs: 3200,
    requiresEvaluation: true
  },
  {
    id: 'closing',
    text: "Au niveau 14 tu auras la possibilité d'aller beaucoup plus loin, en m'indiquant tous les métiers que tu souhaites. Encore une fois je serai intransigeante et la plus honnête possible.",
    durationMs: 4200,
    closing: true
  }
]

const EVALUATION_STEP_INDEX = DIALOGUE_STEPS.findIndex((step) => step.requiresEvaluation)

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
            if (!u.searchParams.has('seed')) u.searchParams.set('seed', String(seed))
            if (!u.searchParams.has('size')) u.searchParams.set('size', '300')
            return u.toString()
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

function formatVerdictLabel(verdict) {
  if (!verdict) return ''
  const lower = verdict.toLowerCase()
  if (lower.startsWith('o')) return 'Oui'
  if (lower.startsWith('n')) return 'Non'
  return verdict
}

function clampExplanation(text, maxWords = 100) {
  if (!text) return ''
  const words = text.trim().split(/\s+/)
  if (words.length <= maxWords) return text.trim()
  return `${words.slice(0, maxWords).join(' ')}…`
}

export default function Niveau7() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [mouthAlt, setMouthAlt] = useState(false)
  const [dialogStep, setDialogStep] = useState(0)
  const [jobInput, setJobInput] = useState('')
  const [analysisResult, setAnalysisResult] = useState(null)
  const [evaluationError, setEvaluationError] = useState('')
  const [evaluating, setEvaluating] = useState(false)
  const [completionSaving, setCompletionSaving] = useState(false)
  const [completed, setCompleted] = useState(false)
  const jobInputRef = useRef(null)

  const focusJobInput = () => {
    jobInputRef.current?.focus()
  }

  useEffect(() => {
    let cancelled = false

    const loadProfile = async () => {
      try {
        const { data } = await supabase.auth.getUser()
        const user = data?.user
        if (!user) {
          navigate('/login', { replace: true })
          return
        }

        const response = await usersAPI.getProfile().catch(() => null)
        if (cancelled) return

        const profile = response?.data?.profile ?? response?.data ?? null
        setAvatarUrl(buildAvatarFromProfile(profile, user.id || 'zelia'))
      } catch (err) {
        console.error('Niveau7 profile load failed', err)
        if (!cancelled) {
          setError("Impossible de charger ce niveau pour le moment. Réessaie plus tard.")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadProfile()

    return () => {
      cancelled = true
    }
  }, [navigate])

  const currentStep = DIALOGUE_STEPS[Math.min(dialogStep, DIALOGUE_STEPS.length - 1)]
  const { text: dialogueText, done: textDone, skip } = useTypewriter(currentStep?.text || '', currentStep?.durationMs || 1500)

  const evaluationUnlocked = dialogStep >= (EVALUATION_STEP_INDEX === -1 ? Number.POSITIVE_INFINITY : EVALUATION_STEP_INDEX)
  const needsEvaluation = Boolean(currentStep?.requiresEvaluation)
  const isLastStep = dialogStep >= DIALOGUE_STEPS.length - 1
  const advanceDisabled = !textDone || (needsEvaluation && !analysisResult) || evaluating

  useEffect(() => {
    if (!currentStep || textDone) {
      setMouthAlt(false)
      return undefined
    }
    const interval = setInterval(() => setMouthAlt((value) => !value), 200)
    return () => clearInterval(interval)
  }, [currentStep, textDone])

  const isClosingStep = Boolean(currentStep?.closing)

  const displayedAvatarUrl = useMemo(() => {
    if (!avatarUrl) return ''

    let url = avatarUrl
    try {
      const parsed = new URL(url)
      const isDicebear = /api\.dicebear\.com/.test(parsed.host) && /\/lorelei\/svg/.test(parsed.pathname)
      if (!isDicebear) return url
    } catch {
      return url
    }

    const params = {
      mouth: !textDone ? (mouthAlt ? 'happy08' : 'happy01') : null,
      eyes: isClosingStep ? 'variant16' : null
    }

    return modifyDicebearUrl(url, params)
  }, [avatarUrl, mouthAlt, textDone, isClosingStep])

  useEffect(() => {
    if (evaluationError && jobInput.trim().length >= 3) {
      setEvaluationError('')
    }
  }, [jobInput, evaluationError])

  useEffect(() => {
    if (evaluationUnlocked && dialogStep === EVALUATION_STEP_INDEX && textDone) {
      focusJobInput()
    }
  }, [evaluationUnlocked, dialogStep, textDone])

  const handleAdvance = () => {
    if (!textDone) {
      skip()
      return
    }

    if (needsEvaluation && !analysisResult) {
      setEvaluationError("Indique un métier et lance l'analyse avant de continuer.")
      focusJobInput()
      return
    }

    setEvaluationError('')
    setDialogStep((step) => Math.min(step + 1, DIALOGUE_STEPS.length - 1))
  }

  const handleEvaluate = async (event) => {
    event.preventDefault()
    if (evaluating) return

    const job = jobInput.trim()
    if (job.length < 3) {
      setEvaluationError('Indique un métier valide (3 caractères minimum).')
      focusJobInput()
      return
    }

    setEvaluationError('')
    setEvaluating(true)

    try {
      const { data } = await analysisAPI.evaluateJob({
        job,
        context: 'user_results.job_recommandations'
      })
      const verdict = formatVerdictLabel(data?.verdict)
      const explanation = clampExplanation(data?.explanation)

      if (!verdict || !explanation) {
        throw new Error('Réponse IA invalide')
      }

      setAnalysisResult({ verdict, explanation })
    } catch (err) {
      console.error('Level 7 evaluation failed', err)
      const message = err?.response?.data?.error || "Impossible de consulter Gemini pour ce métier. Réessaie dans un instant."
      setEvaluationError(message)
      setAnalysisResult(null)
    } finally {
      setEvaluating(false)
    }
  }

  const handleFinishLevel = async () => {
    if (!isLastStep || !textDone) {
      if (!textDone) skip()
      return
    }
    if (completionSaving) return

    setCompletionSaving(true)
    setError('')
    try {
  await levelUp({ minLevel: 7, xpReward: XP_PER_LEVEL })
      setCompleted(true)
    } catch (err) {
      console.error('Niveau7 levelUp failed', err)
      setError("Impossible de valider le niveau pour le moment. Réessaie dans un instant.")
    } finally {
      setCompletionSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 text-center">
        <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-black border-t-transparent" />
        <p className="mt-2 text-text-secondary">Chargement du niveau 7…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      </div>
    )
  }

  const renderEvaluationForm = (options = {}) => {
    const { locked = false, emptyFallback } = options

    return (
      <>
  <form onSubmit={handleEvaluate} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="job-input" className="text-sm font-semibold text-gray-700">
              Ton métier cible
            </label>
            <input
              id="job-input"
              ref={jobInputRef}
              type="text"
              value={jobInput}
              onChange={(event) => setJobInput(event.target.value)}
              placeholder="Ex: architecte d'intérieur, ingénieur en cybersécurité…"
              disabled={locked || evaluating}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base text-gray-900 shadow-sm focus:border-black focus:outline-none focus:ring-2 focus:ring-black/10 disabled:cursor-not-allowed disabled:bg-gray-100"
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="submit"
              disabled={locked || evaluating}
              className="inline-flex items-center justify-center rounded-xl bg-[#c1ff72] px-5 py-3 text-base font-semibold text-black transition hover:bg-[#b3ff5d] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {evaluating ? 'Analyse en cours…' : 'Demander à Zélia'}
            </button>
            <button
              type="button"
              onClick={() => {
                setJobInput('')
                setAnalysisResult(null)
                setEvaluationError('')
              }}
              disabled={locked || evaluating || (!jobInput && !analysisResult)}
              className="inline-flex items-center justify-center rounded-xl border border-gray-200 px-5 py-3 text-base font-semibold text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Effacer
            </button>
          </div>

          {evaluating && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
              <span>Chargement… Merci de patienter quelques secondes.</span>
            </div>
          )}

          {!locked && evaluationError && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{evaluationError}</div>
          )}

        </form>

  <div className="mt-6 rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
          {analysisResult ? (
            <div
              className={`rounded-2xl border px-5 py-4 text-base font-medium shadow-inner ${analysisResult.verdict === 'Oui' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}
            >
              <span className="font-semibold">{analysisResult.verdict}</span>
              <span className="ml-2 text-gray-900">— {analysisResult.explanation}</span>
            </div>
          ) : emptyFallback ? (
            <p>{emptyFallback}</p>
          ) : null}
        </div>
      </>
    )
  }

  return (
    <div className="p-4 md:p-6">
      <div className="mx-auto w-full max-w-none">
  <div className="grid w-full grid-cols-1 items-stretch gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-card md:p-8">
            <div className="mt-6 flex flex-col items-center gap-6 md:flex-row md:items-start">
              <img
                src={displayedAvatarUrl}
                alt="Avatar"
                className="mx-auto h-28 w-28 rounded-2xl border border-gray-100 bg-white object-contain shadow-sm sm:h-36 sm:w-36 md:h-44 md:w-44 md:mx-0 lg:h-52 lg:w-52 xl:h-60 xl:w-60 2xl:h-64 2xl:w-64"
              />

              <div className="w-full flex-1">
                <div className="relative w-full rounded-2xl bg-black p-5 text-white">
                  <div className="min-h-[3.5rem] whitespace-pre-wrap text-base leading-relaxed md:text-lg">
                    {dialogueText}
                  </div>
                  <div className="absolute -left-2 top-6 h-0 w-0 border-b-8 border-r-8 border-t-8 border-b-transparent border-r-black border-t-transparent" />
                </div>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                  {!isLastStep && (
                    <button
                      type="button"
                      onClick={handleAdvance}
                      disabled={advanceDisabled}
                      className="inline-flex items-center justify-center rounded-xl bg-black px-5 py-3 text-base font-semibold text-white transition hover:bg-black/90 disabled:cursor-not-allowed disabled:bg-gray-300"
                    >
                      Suivant
                    </button>
                  )}

                  {isLastStep && (
                    <button
                      type="button"
                      onClick={handleFinishLevel}
                      disabled={completionSaving}
                      className="inline-flex items-center justify-center rounded-xl bg-[#c1ff72] px-5 py-3 text-base font-semibold text-black transition hover:bg-[#b3ff5d] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {completionSaving ? 'Validation…' : 'Valider le niveau 7'}
                    </button>
                  )}

                </div>
              </div>
            </div>
          </div>

          <aside className="flex h-full flex-col rounded-3xl border border-gray-200 bg-white p-6 shadow-card md:p-8">
            {renderEvaluationForm({
              locked: !evaluationUnlocked,
              emptyFallback: evaluationUnlocked ? '' : "Termine d'abord le dialogue pour débloquer cette étape."
            })}
          </aside>
        </div>
      </div>

      {completed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="relative w-full max-w-md rounded-3xl border border-gray-200 bg-white p-8 text-center shadow-2xl">
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 flex h-12 w-12 items-center justify-center rounded-full bg-[#c1ff72] text-2xl shadow-lg">
              🎯
            </div>
            <h3 className="mt-4 text-2xl font-extrabold text-gray-900">Niveau 7 validé !</h3>
            <p className="mt-2 text-gray-500">Tu as affronté le verdict de Zélia. Direction le prochain niveau pour continuer ta progression.</p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={() => navigate('/app/activites')}
                className="inline-flex items-center justify-center rounded-xl border border-gray-200 px-5 py-3 text-base font-semibold text-gray-700 transition hover:bg-gray-100"
              >
                Retour aux activités
              </button>
              <button
                type="button"
                onClick={() => navigate('/app/niveau/8')}
                className="inline-flex items-center justify-center rounded-xl bg-[#c1ff72] px-5 py-3 text-base font-semibold text-black transition hover:bg-[#b3ff5d]"
              >
                Passer au niveau suivant
              </button>
              <button
                type="button"
                onClick={() => setCompleted(false)}
                className="inline-flex items-center justify-center rounded-xl border border-gray-200 px-5 py-3 text-base font-semibold text-gray-700 transition hover:bg-gray-100"
              >
                Rester sur la page
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}