import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import apiClient, { analysisAPI, usersAPI } from '../../lib/api'
import { buildAvatarFromProfile } from '../../lib/avatar'
import { XP_PER_LEVEL, levelUp } from '../../lib/progression'
import { supabase } from '../../lib/supabase'
import { FaBrain, FaTrophy } from 'react-icons/fa6'

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
    .replace(/```(?:\w+)?\s*([\s\S]*?)```/g, '$1')
    .replace(/\*\*/g, '')
    .trim()
}

function parseList(raw) {
  const cleaned = sanitizeText(raw)
  const lines = cleaned
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-•*\d.)\s]+/, '').trim())
    .filter(Boolean)
    // Filtrer les lignes d'introduction/conclusion (contenant "voici", ":", etc.)
    .filter((line) => {
      const lower = line.toLowerCase()
      // Exclure les lignes qui ressemblent à des introductions
      if (lower.startsWith('voici')) return false
      if (lower.includes("points d'amélioration") && lower.includes(':')) return false
      if (lower.match(/^\d+\s*points?\s*(d['']amélioration)?/i)) return false
      // Exclure les lignes trop courtes (< 10 caractères) qui ne sont probablement pas des points
      if (line.length < 10) return false
      return true
    })
  return Array.from(new Set(lines))
}

function formatProfileContext(profile) {
  if (!profile) return ''
  const rows = []
  const add = (label, value) => {
    if (value == null || value === '') return
    rows.push(`${label}: ${value}`)
  }
  add('Prénom', profile.first_name || profile.prenom)
  add('Nom', profile.last_name || profile.nom)
  add('Âge', profile.age)
  add('Genre', profile.gender || profile.genre)
  add('Département', profile.department || profile.departement)
  add('École/Formation', profile.school || profile.ecole)
  return rows.join('\n')
}

function LegacyNiveau19() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [profile, setProfile] = useState(null)
  const [avatarUrl, setAvatarUrl] = useState('')
  const [analysis, setAnalysis] = useState(null)
  const [responses, setResponses] = useState([])

  const [step, setStep] = useState(4)
  const [improvements, setImprovements] = useState([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [answers, setAnswers] = useState([])
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState('')
  const [saving, setSaving] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)

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

        try {
          const results = await analysisAPI.getMyResults()
          const payload = results?.data?.results || null
          if (mounted) setAnalysis(payload)
        } catch {}

        try {
          const { data } = await supabase
            .from('user_responses')
            .select('questionnaire_type, question_id, response, created_at')
            .eq('user_id', user.id)
            .order('created_at', { ascending: true })
          if (!mounted) return
          const list = Array.isArray(data) ? data : []
          const filtered = list.filter((row) => {
            const type = (row?.questionnaire_type || '').toLowerCase()
            return ['mbti', 'personality', 'zelia', 'zelia_personality'].includes(type)
          })
          setResponses(filtered.length ? filtered : list)
        } catch (e) {
          console.warn('Niveau19 responses fetch error', e)
        }
      } catch (e) {
        console.error('Niveau19 load error', e)
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

  const dialogue = useMemo(() => ([
    { text: 'Ok l\u00e0 je vais \u00eatre honn\u00eate avec toi, c\'est pas toujours facile \u00e0 entendre...', durationMs: 1800 },
    { text: 'Mais c\'est justement ce qui va te faire progresser le plus !', durationMs: 1600 },
    { text: 'Je vais te proposer 5 axes d\'am\u00e9lioration que j\'ai d\u00e9tect\u00e9s chez toi', durationMs: 2000 },
    { text: `Allez on y va${firstName ? ` ${firstName}` : ''} ? Dis-moi si tu valides ou pas :)`, durationMs: 1800 }
  ]), [firstName])

  const currentDialogue = dialogue[Math.min(step, dialogue.length - 1)]
  const { text: typed, done: typedDone, skip } = useTypewriter(currentDialogue?.text || '', currentDialogue?.durationMs || 1500)
  const started = step >= dialogue.length

  const buildContext = () => {
    const profileBlock = formatProfileContext(profile)
    const responseBlock = (responses || [])
      .map((r) => `- [${r.questionnaire_type || 'questionnaire'} #${r.question_id}] ${r.response || '—'}`)
      .join('\n')
    const personalityBlock = analysis
      ? [
        analysis.personalityType ? `Type: ${analysis.personalityType}` : '',
        analysis.personalityAnalysis ? `Analyse: ${analysis.personalityAnalysis}` : '',
        analysis.skillsAssessment ? `Compétences: ${analysis.skillsAssessment}` : ''
      ].filter(Boolean).join('\n')
      : ''

    return [
      profileBlock ? `Profil:\n${profileBlock}` : 'Profil: (inconnu)',
      responseBlock ? `\nRéponses du module:\n${responseBlock}` : '\nRéponses du module: (aucune)',
      personalityBlock ? `\nRésultats personnalité:\n${personalityBlock}` : '\nRésultats personnalité: (aucun)'
    ].join('\n')
  }

  const generateImprovements = async () => {
    if (generating) return
    setGenerating(true)
    setGenerateError('')
    try {
      const context = buildContext()
      const message =
        `Tu es un coach d'orientation qui s'adresse à un jeune de moins de 40 ans. Tutoie-le, sois direct, bienveillant et naturel (pas de ton corporate ou scolaire).\n` +
        `À partir du contexte suivant, propose 5 points d'amélioration concrets liés à sa personnalité.\n` +
        `${context}\n\n` +
        `Contraintes STRICTES :\n` +
        `- Réponds uniquement par une liste de 5 points, un par ligne.\n` +
        `- Utilise un ton direct, encourageant et adapté à un public jeune (pas de jargon RH).\n` +
        `- Formule chaque point comme un conseil concret, pas un défaut brut.\n` +
        `- Pas d'introduction ni de conclusion.`

      const resp = await apiClient.post('/chat/ai', {
        mode: 'advisor',
        advisorType: 'improvement-points',
        message,
        history: []
      })

      const list = parseList(resp?.data?.reply || '').slice(0, 5)
      if (list.length < 5) {
        throw new Error('Points insuffisants')
      }
      setImprovements(list)
      setCurrentIdx(0)
      setAnswers(new Array(5).fill(''))
    } catch (e) {
      console.error('Niveau19 generation error', e)
      setGenerateError('Impossible de générer les points. Réessaie.')
    } finally {
      setGenerating(false)
    }
  }

  useEffect(() => {
    if (!started) return
    if (improvements.length === 0 && !generating && !generateError) {
      generateImprovements()
    }
  }, [started, improvements.length, generating, generateError])

  const onNext = () => {
    if (!typedDone) {
      skip()
      return
    }
    setStep((prev) => Math.min(prev + 1, dialogue.length))
  }

  const handleAnswer = async (answer) => {
    if (saving || !improvements.length) return
    const nextAnswers = [...answers]
    nextAnswers[currentIdx] = answer
    setAnswers(nextAnswers)

    if (currentIdx < improvements.length - 1) {
      setCurrentIdx((prev) => prev + 1)
      return
    }

    setSaving(true)
    try {
      const entries = improvements.map((text, idx) => ({
        question_id: `niveau_19_${idx + 1}`,
        question_text: text,
        answer_text: nextAnswers[idx] || '—'
      }))
      await usersAPI.saveExtraInfo(entries)
      await levelUp({ minLevel: 19, xpReward: XP_PER_LEVEL })
      setShowSuccess(true)
    } catch (e) {
      console.error('Niveau19 save error', e)
    } finally {
      setSaving(false)
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

  const currentPoint = improvements[currentIdx]

  return (
    <div className="p-2 md:p-6">
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
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-card">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center text-white"><FaBrain className="w-5 h-5" /></div>
            <h2 className="text-xl font-bold">Points d'amélioration</h2>
          </div>

          {!started && (
            <div className="text-text-secondary">Lis le dialogue puis découvre les points d'amélioration.</div>
          )}

          {started && (
            <div className="space-y-4">
              {generating && (
                <div className="text-text-secondary">Génération des points…</div>
              )}

              {generateError && (
                <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded-lg">{generateError}</div>
              )}

              {!generating && !generateError && currentPoint && (
                <>
                  <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                    <div className="text-sm text-text-secondary mb-1">Point {currentIdx + 1} / {improvements.length}</div>
                    <div className="text-base font-semibold">{currentPoint}</div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      type="button"
                      onClick={() => handleAnswer("Je suis d'accord")}
                      className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200"
                      disabled={saving}
                    >
                      Je suis d'accord
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAnswer("Pas d'accord")}
                      className="px-4 py-2 rounded-lg bg-white text-gray-900 border border-gray-300"
                      disabled={saving}
                    >
                      Pas d'accord
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {showSuccess && !pathname.includes('/outils') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="relative bg-white border border-gray-200 rounded-2xl p-8 shadow-2xl text-center max-w-md w-11/12">
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 w-10 h-10 bg-[#c1ff72] rounded-full flex items-center justify-center shadow-md animate-bounce"><FaTrophy className="w-5 h-5 text-yellow-600" /></div>
            <h3 className="text-2xl font-extrabold mb-2">Module terminé !</h3>
            <p className="text-text-secondary mb-4">Tes réponses sont enregistrées.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button onClick={() => navigate('/app/activites')} className="px-4 py-2 rounded-lg bg-white text-gray-900 border border-gray-200">Retour aux activités</button>
              <button onClick={() => navigate('/app/niveau/20')} className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200">Continuer</button>
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

const IMPROVEMENT_AXES = [
  {
    id: 'priorities',
    icon: 'ph-list-checks',
    title: 'Clarifier tes priorités',
    description: 'Faire moins, mais avancer sur ce qui compte vraiment pour toi.',
    example: 'Je bloque 20 minutes dimanche pour choisir mes 3 priorités de la semaine.'
  },
  {
    id: 'confidence',
    icon: 'ph-rocket-launch',
    title: 'Prendre confiance dans tes choix',
    description: 'Tester une piste avant de la juger et accepter de ne pas tout savoir tout de suite.',
    example: "Je me renseigne sur une formation qui m'intrigue avant de dire que ce n'est pas pour moi."
  },
  {
    id: 'communication',
    icon: 'ph-chats-circle',
    title: 'Mieux exprimer ce que tu veux',
    description: 'Mettre des mots sur tes envies, tes doutes et ce dont tu as besoin.',
    example: "Je parle de mes idées d'orientation avec une personne de confiance cette semaine."
  },
  {
    id: 'action',
    icon: 'ph-lightning',
    title: "Passer davantage à l'action",
    description: 'Transformer une envie en une petite action réalisable, sans attendre le moment parfait.',
    example: "Je fais une recherche de 15 minutes sur un métier qui m'attire."
  },
  {
    id: 'balance',
    icon: 'ph-heart',
    title: 'Trouver un rythme qui te convient',
    description: 'Avancer régulièrement tout en gardant du temps pour souffler et prendre du recul.',
    example: 'Je prévois un créneau sans écran pour faire le point sur ma semaine.'
  }
]

function getFirstName(profile) {
  const name = String(profile?.first_name || profile?.prenom || '').trim()
  return name ? name.split(/\s+/)[0] : ''
}

function getPersonalityLabel(analysis) {
  const value = analysis?.personalityType || analysis?.personality_type || analysis?.personaName
  return typeof value === 'string' ? value.trim() : ''
}

export default function Niveau19() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [profile, setProfile] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [avatarUrl, setAvatarUrl] = useState('')
  const [selectedAxisIds, setSelectedAxisIds] = useState([])
  const [commitments, setCommitments] = useState({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let active = true

    const load = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          navigate('/login', { replace: true })
          return
        }

        const profileResponse = await usersAPI.getProfile().catch(() => null)
        if (!active) return
        const nextProfile = profileResponse?.data?.profile || profileResponse?.data || null
        setProfile(nextProfile)
        setAvatarUrl(buildAvatarFromProfile(nextProfile, user.id))

        const resultsResponse = await analysisAPI.getMyResults().catch(() => null)
        if (active) setAnalysis(resultsResponse?.data?.results || null)
      } catch (error) {
        console.error('Niveau19 load error', error)
        if (active) setLoadError('Impossible de charger ton espace pour le moment.')
      } finally {
        if (active) setLoading(false)
      }
    }

    load()
    return () => { active = false }
  }, [navigate])

  const firstName = useMemo(() => getFirstName(profile), [profile])
  const personalityLabel = useMemo(() => getPersonalityLabel(analysis), [analysis])
  const selectedAxes = useMemo(
    () => IMPROVEMENT_AXES.filter((axis) => selectedAxisIds.includes(axis.id)),
    [selectedAxisIds]
  )
  const selectionLimitReached = selectedAxisIds.length >= 3

  const toggleAxis = (axisId) => {
    setSaveError('')
    setSaved(false)
    setSelectedAxisIds((current) => {
      if (current.includes(axisId)) return current.filter((id) => id !== axisId)
      if (current.length >= 3) return current
      return [...current, axisId]
    })
  }

  const updateCommitment = (axisId, value) => {
    setCommitments((current) => ({ ...current, [axisId]: value }))
    setSaveError('')
    setSaved(false)
  }

  const savePlan = async () => {
    if (!selectedAxes.length || saving) return

    setSaving(true)
    setSaveError('')
    try {
      const entries = selectedAxes.map((axis) => ({
        question_id: `niveau19_axis_${axis.id}`,
        question_text: `Axe de progression : ${axis.title}`,
        answer_text: commitments[axis.id]?.trim() || axis.example
      }))
      entries.push({
        question_id: 'niveau19_progression_plan_completed',
        question_text: 'Plan de progression personnel',
        answer_text: selectedAxes.map((axis) => axis.title).join(' | ')
      })

      await usersAPI.saveExtraInfo(entries)
      setSaved(true)
    } catch (error) {
      console.error('Niveau19 save error', error)
      setSaveError("Ton plan n'a pas pu être enregistré. Vérifie ta connexion puis réessaie.")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 text-center">
        <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-black border-t-transparent" />
        <p className="mt-2 text-text-secondary">Chargement de ton plan...</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-xl p-2 md:p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800 shadow-card">
          <h1 className="text-xl font-bold">On n'a pas pu ouvrir cet outil</h1>
          <p className="mt-2">{loadError}</p>
          <button type="button" onClick={() => window.location.reload()} className="mt-4 rounded-lg border border-red-300 bg-white px-4 py-2 font-semibold text-red-800">
            Réessayer
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-2 md:p-6">
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-card">
        <div className="h-1.5 bg-[#c1ff72]" />
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center md:p-7">
          <img
            src={avatarUrl || '/static/images/logo-dark.png'}
            alt="Ton avatar"
            className="h-20 w-20 rounded-2xl border border-gray-100 bg-[#f2fbe4] object-contain p-1 shadow-sm"
          />
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-sm font-bold uppercase tracking-normal text-gray-500">Ton plan de progression</p>
            <h1 className="text-2xl font-extrabold text-black md:text-3xl">
              {firstName ? `À toi de jouer, ${firstName}.` : 'À toi de jouer.'}
            </h1>
            <p className="mt-2 max-w-2xl text-text-secondary">
              Pas de note ni de bonne réponse ici. Choisis les sujets que tu veux travailler maintenant, puis donne-toi un premier pas concret.
            </p>
          </div>
          {personalityLabel && (
            <span className="inline-flex w-fit items-center gap-2 rounded-full bg-[#f2fbe4] px-3 py-2 text-sm font-semibold text-gray-800">
              <i className="ph ph-sparkle" aria-hidden="true" />
              {personalityLabel}
            </span>
          )}
        </div>
      </section>

      <section aria-labelledby="axes-heading">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-normal text-gray-500">Étape 1</p>
            <h2 id="axes-heading" className="text-2xl font-extrabold text-black">Choisis tes axes de progression</h2>
          </div>
          <p className="text-sm font-semibold text-gray-600">{selectedAxisIds.length} / 3 choisis</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {IMPROVEMENT_AXES.map((axis) => {
            const selected = selectedAxisIds.includes(axis.id)
            const disabled = !selected && selectionLimitReached
            return (
              <button
                key={axis.id}
                type="button"
                onClick={() => toggleAxis(axis.id)}
                disabled={disabled}
                aria-pressed={selected}
                className={`min-h-[190px] rounded-2xl border p-5 text-left transition ${
                  selected
                    ? 'border-black bg-[#f2fbe4] shadow-sm'
                    : disabled
                      ? 'cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400 opacity-70'
                      : 'border-gray-200 bg-white hover:-translate-y-0.5 hover:border-black hover:shadow-sm'
                }`}
              >
                <span className="mb-5 flex items-center justify-between">
                  <span className={`inline-grid h-10 w-10 place-items-center rounded-full ${selected ? 'bg-black text-[#c1ff72]' : 'bg-gray-100 text-black'}`}>
                    <i className={`ph ${axis.icon} text-xl`} aria-hidden="true" />
                  </span>
                  <i className={`ph ${selected ? 'ph-check-circle text-2xl text-black' : 'ph-plus-circle text-2xl text-gray-400'}`} aria-hidden="true" />
                </span>
                <span className="block text-lg font-extrabold text-black">{axis.title}</span>
                <span className="mt-2 block text-sm leading-relaxed text-gray-600">{axis.description}</span>
              </button>
            )
          })}
        </div>
      </section>

      {selectedAxes.length > 0 && (
        <section aria-labelledby="plan-heading" className="rounded-2xl border border-gray-200 bg-white p-5 shadow-card md:p-7">
          <div className="mb-5">
            <p className="text-sm font-bold uppercase tracking-normal text-gray-500">Étape 2</p>
            <h2 id="plan-heading" className="text-2xl font-extrabold text-black">Ton premier pas</h2>
            <p className="mt-1 text-text-secondary">Même une petite action compte. Tu pourras la modifier plus tard.</p>
          </div>

          <div className="space-y-4">
            {selectedAxes.map((axis) => (
              <label key={axis.id} className="block">
                <span className="mb-2 flex items-center gap-2 text-sm font-bold text-black">
                  <i className={`ph ${axis.icon} text-lg`} aria-hidden="true" />
                  {axis.title}
                </span>
                <textarea
                  value={commitments[axis.id] || ''}
                  onChange={(event) => updateCommitment(axis.id, event.target.value)}
                  placeholder={`Ex. ${axis.example}`}
                  rows={2}
                  className="w-full resize-y rounded-xl border border-gray-200 bg-[#fffbf7] px-4 py-3 text-sm leading-relaxed text-black outline-none transition placeholder:text-gray-400 focus:border-black"
                />
              </label>
            ))}
          </div>

          {saveError && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{saveError}</p>}
          {saved && (
            <p className="mt-4 flex items-center gap-2 rounded-xl border border-[#a7ec4e] bg-[#f2fbe4] p-3 text-sm font-semibold text-gray-800">
              <i className="ph ph-check-circle text-lg" aria-hidden="true" />
              Ton plan est enregistré. Reviens-y quand tu veux pour ajuster tes prochains pas.
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={savePlan}
              disabled={saving}
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-black px-5 py-2.5 font-bold text-white transition hover:bg-gray-800 disabled:cursor-wait disabled:opacity-60"
            >
              {saving ? 'Enregistrement...' : 'Enregistrer mon plan'}
            </button>
            <span className="text-sm text-gray-500">Choisis ce qui te ressemble aujourd'hui, pas ce que les autres attendent de toi.</span>
          </div>
        </section>
      )}
    </div>
  )
}