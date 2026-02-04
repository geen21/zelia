import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usersAPI } from '../../lib/api'
import { XP_PER_LEVEL, levelUp } from '../../lib/progression'
import { supabase } from '../../lib/supabase'

function buildAvatarFromProfile(profile, seed = 'zelia') {
  try {
    if (profile?.avatar_url && typeof profile.avatar_url === 'string') {
      return profile.avatar_url
    }
    if (profile?.avatar && typeof profile.avatar === 'string') {
      return profile.avatar
    }
    if (profile?.avatar_json) {
      let conf = profile.avatar_json
      if (typeof conf === 'string') {
        try { conf = JSON.parse(conf) } catch {}
      }
      if (conf && typeof conf === 'object') {
        if (conf.url && typeof conf.url === 'string') {
          try {
            const u = new URL(conf.url)
            if (!u.searchParams.has('seed')) u.searchParams.set('seed', String(seed))
            if (!u.searchParams.has('size')) u.searchParams.set('size', '300')
            return u.toString()
          } catch {}
        }
        const params = new URLSearchParams()
        params.set('seed', String(seed))
        Object.entries(conf).forEach(([k, v]) => {
          if (v !== undefined && v !== null && v !== '') params.set(k, String(v))
        })
        if (!params.has('size')) params.set('size', '300')
        return `https://api.dicebear.com/9.x/lorelei/svg?${params.toString()}`
      }
    }
  } catch {}
  const p = new URLSearchParams({ seed: String(seed), size: '300', radius: '15' })
  return `https://api.dicebear.com/9.x/lorelei/svg?${p.toString()}`
}

function useTypewriter(message, durationMs) {
  const [text, setText] = useState('')
  const [done, setDone] = useState(false)
  const intervalRef = useRef(null)
  const timeoutRef = useRef(null)

  useEffect(() => {
    setText('')
    setDone(false)
    const full = message || ''
    let i = 0
    const step = Math.max(15, Math.floor((durationMs || 1500) / Math.max(1, full.length)))
    intervalRef.current = setInterval(() => {
      i++
      setText(full.slice(0, i))
      if (i >= full.length) {
        clearInterval(intervalRef.current)
      }
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

export default function Niveau3() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [baseAvatarUrl, setBaseAvatarUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [userId, setUserId] = useState('')

  const [phase, setPhase] = useState('intro') // intro -> quiz -> success
  const [introIdx, setIntroIdx] = useState(0)
  const [mouthAlt, setMouthAlt] = useState(false)

  const [qIdx, setQIdx] = useState(0)
  const [selected, setSelected] = useState(null)
  const [revealed, setRevealed] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { navigate('/login'); return }
        setUserId(user.id)
        const pRes = await usersAPI.getProfile().catch(() => null)
        if (!mounted) return
        const prof = pRes?.data?.profile || pRes?.data || null
        setProfile(prof)
        setBaseAvatarUrl(buildAvatarFromProfile(prof, user.id))
      } catch (e) {
        console.error(e)
        if (!mounted) return
        setError('Erreur de chargement')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [navigate])

  const introMessages = useMemo(() => {
    const prenom = (profile?.first_name || '').trim()
    const namePart = prenom ? ` ${prenom}` : ''
    return [
      { text: `Re${namePart}, on va déconstruire ensemble des idées reçues du monde du travail (niveau 3).`, durationMs: 2800 },
      { text: 'Je te laisse avec les questions…', durationMs: 1600 },
    ]
  }, [profile])

  const questions = useMemo(() => ([
    {
      id: 'q1',
      text: 'Qui trouve un CDI le plus rapidement ?',
      options: [
        "A. Un titulaire d'un Master en Communication (Bac +5)",
        'B. Un technicien de maintenance industrielle (Bac +2)'
      ],
      correctIndex: 1,
      explanation: "Réponse : B. Le technicien de maintenance. Pourquoi ? Le secteur de l'industrie souffre d'une pénurie chronique de techniciens. Ils sont souvent embauchés avant même la fin de leur diplôme. À l'inverse, le secteur de la communication est saturé, et les Bac+5 enchaînent souvent stages et CDD avant le premier CDI."
    },
    {
      id: 'q2',
      text: 'Quel métier est statistiquement le plus mortel en France (accidents du travail) ?',
      options: [
        'A. Policier',
        'B. Marin-pêcheur / Bûcheron'
      ],
      correctIndex: 1,
      explanation: "Réponse : B. Marin-pêcheur / Bûcheron. Pourquoi ? C'est très contre-intuitif à cause des films et des infos. En réalité, le taux de mortalité et d'accidents graves est infiniment plus élevé dans la manipulation d'arbres ou en haute mer que lors d'interventions de police. Le danger \"physique\" bat le danger \"agressif\"."
    },
    {
      id: 'q3',
      text: 'Quel pourcentage de "Créateurs de contenu" (Influenceurs, YouTubeurs, Streamers) parvient à générer l’équivalent d’un SMIC ?',
      options: [
        'A. Environ 15%',
        'B. Moins de 4%'
      ],
      correctIndex: 1,
      explanation: "Réponse : B. Moins de 4% (et souvent moins de 1%). Pourquoi ? C'est l'économie la plus inégalitaire qui soit. Sur Twitch ou YouTube, le top 0.1% capte 90% des revenus. S'orienter vers ces métiers sans plan B, c'est statistiquement comme jouer sa carrière au Loto. Un bon technicien clim gagne mieux sa vie que 99% des influenceurs."
    },
    {
      id: 'q4',
      text: 'Qui a le meilleur salaire en moyenne en France (en début de carrière) ?',
      options: [
        'A. Architecte',
        'B. Grutier'
      ],
      correctIndex: 1,
      explanation: "Réponse : B. Grutier. Pourquoi ? Le grutier gagne souvent mieux sa vie en début de carrière (primes incluses) qu'un architecte salarié débutant. Les métiers techniques/tension (responsabilité, horaires, sécurité) sont parfois mieux valorisés que des métiers perçus comme \"prestigieux\"."
    },
    {
      id: 'q5',
      text: 'Dans beaucoup de métiers, qu’est-ce qui fait le plus grimper ton salaire à court terme ?',
      options: [
        'A. Rester 4 ans dans la même entreprise',
        'B. Changer d’entreprise au bon moment'
      ],
      correctIndex: 1,
      explanation: "Réponse : B. Changer d’entreprise au bon moment. Pourquoi ? Les augmentations internes sont souvent plus lentes que les hausses obtenues à l’embauche. Sans bouger tous les 6 mois, une mobilité bien choisie (après avoir acquis des compétences concrètes) peut accélérer la progression salariale."
    },
    {
      id: 'q6',
      text: 'Quel profil trouve souvent le plus facilement un job rapidement ?',
      options: [
        'A. Quelqu’un avec un CV “parfait” mais très théorique',
        'B. Quelqu’un avec des preuves concrètes (stages, alternance, projets, missions)'
      ],
      correctIndex: 1,
      explanation: "Réponse : B. Pourquoi ? Les recruteurs cherchent des signaux de fiabilité: expérience terrain, réalisations, contraintes réelles (délais, clients, équipe). Même de petits projets concrets peuvent peser plus lourd qu’un CV \"parfait\" mais sans preuves d’exécution."
    },
  ]), [])

  const currentIntro = introMessages[introIdx] || { text: '', durationMs: 1500 }
  const { text: typedIntro, done: introDone, skip: skipIntro } = useTypewriter(currentIntro.text, currentIntro.durationMs)

  useEffect(() => {
    if (phase !== 'intro' || introDone) return
    const int = setInterval(() => setMouthAlt((v) => !v), 200)
    return () => clearInterval(int)
  }, [phase, introDone])

  function modifyDicebearUrl(urlStr, params = {}) {
    try {
      const u = new URL(urlStr)
      const isDice = /api\.dicebear\.com/.test(u.host) && /\/lorelei\/svg/.test(u.pathname)
      if (!isDice) return urlStr
      Object.entries(params).forEach(([k, v]) => {
        if (v === null || v === undefined || v === '') {
          u.searchParams.delete(k)
        } else {
          u.searchParams.set(k, String(v))
        }
      })
      if (!u.searchParams.has('size')) u.searchParams.set('size', '300')
      return u.toString()
    } catch {
      return urlStr
    }
  }

  const displayedAvatarUrl = useMemo(() => {
    let url = baseAvatarUrl
    if (!url) return url
    const isDicebear = (() => {
      try {
        const u = new URL(url)
        return /api\.dicebear\.com/.test(u.host) && /\/lorelei\/svg/.test(u.pathname)
      } catch {
        return false
      }
    })()
    if (!isDicebear) return url

    if (phase === 'intro' && !introDone) {
      url = modifyDicebearUrl(url, { mouth: mouthAlt ? 'happy08' : null })
    } else {
      url = modifyDicebearUrl(url, { mouth: null })
    }
    return url
  }, [baseAvatarUrl, phase, introDone, mouthAlt])

  const currentQuestion = questions[qIdx]
  const isCorrect = revealed && selected != null ? selected === currentQuestion?.correctIndex : false

  function handleIntroNext() {
    if (!introDone) { skipIntro(); return }
    if (introIdx + 1 < introMessages.length) {
      setIntroIdx((v) => v + 1)
      return
    }
    setPhase('quiz')
  }

  function selectAnswer(index) {
    if (revealed) return
    setSelected(index)
    setRevealed(true)
  }

  function nextQuestion() {
    if (qIdx + 1 < questions.length) {
      setQIdx((v) => v + 1)
      setSelected(null)
      setRevealed(false)
      return
    }

    setShowSuccess(true)
    ;(async () => {
      try {
        await levelUp({ minLevel: 3, xpReward: XP_PER_LEVEL })
      } catch (e) {
        console.warn('Progression update failed (non-blocking):', e)
      }
    })()
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
              src={displayedAvatarUrl}
              alt="Avatar"
              className="w-28 h-28 sm:w-36 sm:h-36 md:w-44 md:h-44 lg:w-52 lg:h-52 xl:w-60 xl:h-60 2xl:w-64 2xl:h-64 rounded-2xl border border-gray-100 shadow-sm object-contain bg-white mx-auto md:mx-0"
            />
            <div className="flex-1 w-full">
              <div className="relative bg-black text-white rounded-2xl p-4 md:p-5 w-full">
                <div className="text-base md:text-lg leading-relaxed whitespace-pre-wrap min-h-[3.5rem]">
                  {phase === 'intro' ? (
                    <>{typedIntro}</>
                  ) : (
                    <>
                      <div className="text-white/70 text-sm mb-2">Niveau 3 · Question {qIdx + 1}/{questions.length}</div>
                      <div className="font-semibold">{currentQuestion?.text}</div>
                      {revealed && (
                        <div className="mt-3 text-white/90">
                          {currentQuestion?.explanation}
                        </div>
                      )}
                    </>
                  )}
                </div>
                <div className="absolute -left-2 top-6 w-0 h-0 border-t-8 border-b-8 border-r-8 border-t-transparent border-b-transparent border-r-black" />
              </div>

              {phase === 'intro' && (
                <div className="mt-4">
                  <button
                    onClick={handleIntroNext}
                    className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200 w-full sm:w-auto"
                  >
                    {introIdx === introMessages.length - 1 ? 'Commencer' : 'Suivant'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-card">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center text-white">🧠</div>
            <h2 className="text-xl font-bold">Idées reçues · Niveau 3</h2>
          </div>

          {phase === 'intro' ? (
            <div className="text-text-secondary text-sm">
              Clique sur « Commencer » quand tu es prêt(e).
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {(currentQuestion?.options || []).map((opt, i) => {
                  const active = selected === i
                  const correct = revealed && i === currentQuestion.correctIndex
                  const wrong = revealed && active && i !== currentQuestion.correctIndex
                  const base = 'w-full text-left px-4 py-3 rounded-lg border transition'
                  const cls = correct
                    ? `${base} bg-[#c1ff72] text-black border-gray-200`
                    : wrong
                      ? `${base} bg-red-50 text-red-800 border-red-200`
                      : active
                        ? `${base} bg-black text-white border-black`
                        : `${base} bg-white text-gray-900 border-gray-300 hover:bg-gray-50`
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => selectAnswer(i)}
                      disabled={revealed}
                      className={cls}
                    >
                      {opt}
                    </button>
                  )
                })}
              </div>

              {revealed && (
                <div className="mt-5 flex flex-col sm:flex-row items-center gap-3">
                  <div className={`text-sm font-semibold ${isCorrect ? 'text-emerald-700' : 'text-gray-600'}`}>
                    {isCorrect ? 'Bonne réponse.' : 'Réponse enregistrée.'}
                  </div>
                  <button
                    type="button"
                    onClick={nextQuestion}
                    className="sm:ml-auto px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200 w-full sm:w-auto"
                  >
                    {qIdx === questions.length - 1 ? 'Terminer le niveau' : 'Question suivante'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="relative bg-white border border-gray-200 rounded-2xl p-8 shadow-2xl text-center max-w-md w-11/12">
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 w-10 h-10 bg-[#c1ff72] rounded-full flex items-center justify-center shadow-md animate-bounce">🏆</div>
            <h3 className="text-2xl font-extrabold mb-2">Niveau 3 réussi !</h3>
            <p className="text-text-secondary mb-4">Bien joué. Tu as déconstruit 6 idées reçues du monde du travail.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => navigate('/app/activites')}
                className="px-4 py-2 rounded-lg bg-white text-gray-900 border border-gray-200"
              >
                Retour aux activités
              </button>
              <button
                onClick={() => navigate('/app/niveau/4')}
                className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200"
              >
                Passer au niveau suivant
              </button>
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
