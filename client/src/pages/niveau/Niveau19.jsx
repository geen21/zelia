import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import apiClient, { analysisAPI, usersAPI } from '../../lib/api'
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

export default function Niveau19() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [profile, setProfile] = useState(null)
  const [avatarUrl, setAvatarUrl] = useState('')
  const [analysis, setAnalysis] = useState(null)
  const [responses, setResponses] = useState([])

  const [step, setStep] = useState(0)
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
    { text: 'Je vais te livrer selon moi des choses que l\'on aime pas forcément entendre...', durationMs: 1800 },
    { text: 'Mais je suis persuadé que cela peut te faire avancer !', durationMs: 1600 },
    { text: 'Je vais te lister 5 défaut chez toi qui selon moi peuvent être des points d\'amélioration', durationMs: 2000 },
    { text: `On test ça${firstName ? ` ${firstName}` : ''} ? Tu me dis si tu es d\'accord ou pas :)`, durationMs: 1800 }
  ]), [firstName])

  const currentDialogue = dialogue[Math.min(step, dialogue.length - 1)]
  const { text: typed, done: typedDone, skip } = useTypewriter(currentDialogue?.text || '', currentDialogue?.durationMs || 1500)
  const started = step >= dialogue.length

  const buildContext = () => {
    const profileBlock = formatProfileContext(profile)
    const responseBlock = (responses || [])
      .map((r) => `- [${r.questionnaire_type || 'questionnaire'} #${r.question_id}] ${r.response || '—'}`)
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
      responseBlock ? `\nRéponses (niveau 4):\n${responseBlock}` : '\nRéponses (niveau 4): (aucune)',
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
        `À partir du contexte suivant, propose 5 points d'amélioration (défauts à travailler) liés à la personnalité de l'utilisateur.\n` +
        `${context}\n\n` +
        `Contraintes STRICTES :\n` +
        `- Réponds uniquement par une liste de 5 points, un par ligne.\n` +
        `- Formulations bienveillantes, orientées amélioration.\n` +
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
        answer_text: nextAnswers[idx] || '—'
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
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-card">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center text-white">🧠</div>
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

      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="relative bg-white border border-gray-200 rounded-2xl p-8 shadow-2xl text-center max-w-md w-11/12">
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 w-10 h-10 bg-[#c1ff72] rounded-full flex items-center justify-center shadow-md animate-bounce">🏆</div>
            <h3 className="text-2xl font-extrabold mb-2">Niveau 19 réussi !</h3>
            <p className="text-text-secondary mb-4">Tes réponses sont enregistrées.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button onClick={() => navigate('/app/activites')} className="px-4 py-2 rounded-lg bg-white text-gray-900 border border-gray-200">Retour aux activités</button>
              <button onClick={() => navigate('/app/niveau/20')} className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200">Passer au niveau suivant</button>
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