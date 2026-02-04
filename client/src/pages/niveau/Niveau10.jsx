import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import supabase from '../../lib/supabase'
import { analysisAPI, usersAPI } from '../../lib/api'
import { XP_PER_LEVEL, levelUp } from '../../lib/progression'

function buildAvatarFromProfile(profile, seed = 'zelia') {
  try {
    if (profile?.avatar_url && typeof profile.avatar_url === 'string') return profile.avatar_url
    if (profile?.avatar && typeof profile.avatar === 'string') return profile.avatar
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

function modifyDicebearUrl(urlStr, params = {}) {
  try {
    const u = new URL(urlStr)
    const isDice = /api\.dicebear\.com/.test(u.host) && /\/lorelei\/svg/.test(u.pathname)
    if (!isDice) return urlStr
    Object.entries(params).forEach(([k, v]) => {
      if (v === null || v === undefined || v === '') u.searchParams.delete(k)
      else u.searchParams.set(k, String(v))
    })
    if (!u.searchParams.has('size')) u.searchParams.set('size', '300')
    return u.toString()
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

const STEP_INTRO = 'intro'
const STEP_Q1 = 'q1'
const STEP_Q2 = 'q2'
const STEP_BILAN = 'bilan'

const OPTIONS_3 = ['Oui', 'Non', 'Je ne sais pas']

export default function Niveau10() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [profile, setProfile] = useState(null)
  const [baseAvatarUrl, setBaseAvatarUrl] = useState('')

  const [phase, setPhase] = useState(STEP_INTRO)
  const [mouthAlt, setMouthAlt] = useState(false)

  const [answers, setAnswers] = useState({
    careerIdeas: '',
    likeApp: ''
  })

  const [bilanLoading, setBilanLoading] = useState(false)
  const [bilanError, setBilanError] = useState('')
  const [bilan, setBilan] = useState(null)

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
        setBaseAvatarUrl(buildAvatarFromProfile(prof, user.id))
      } catch (e) {
        console.error('Niveau10 load error', e)
        if (!mounted) return
        setError('Erreur de chargement')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [navigate])

  const bubble = useMemo(() => {
    if (phase === STEP_INTRO) return { text: "C'est le moment de faire un premier bilan", durationMs: 1400 }
    if (phase === STEP_Q1) return { text: "As t-on réélement réussi à te donner des idées sur ton futur métier", durationMs: 1200 }
    if (phase === STEP_Q2) return { text: "On va passer au niveau suivant mais on aimerait bien savoir si tu aimes bien l'application ?", durationMs: 1400 }
    return { text: 'Ok voici ton bilan', durationMs: 800 }
  }, [phase])

  const { text: typed, done: typedDone, skip } = useTypewriter(bubble.text, bubble.durationMs)
  const shouldAnimateMouth = !typedDone

  useEffect(() => {
    if (!shouldAnimateMouth) return
    const id = setInterval(() => setMouthAlt(v => !v), 200)
    return () => clearInterval(id)
  }, [shouldAnimateMouth])

  const displayedAvatarUrl = useMemo(() => {
    if (!baseAvatarUrl) return baseAvatarUrl
    if (!shouldAnimateMouth) return modifyDicebearUrl(baseAvatarUrl, { mouth: null })
    return modifyDicebearUrl(baseAvatarUrl, { mouth: mouthAlt ? 'happy08' : 'happy01' })
  }, [baseAvatarUrl, shouldAnimateMouth, mouthAlt])

  const canContinueFromIntro = phase === STEP_INTRO
  const showQ1 = phase === STEP_Q1
  const showQ2 = phase === STEP_Q2
  const showBilan = phase === STEP_BILAN

  async function saveNiveau10Answers(nextAnswers) {
    const entries = [
      {
        question_id: 'niv10_career_ideas',
        question_text: "As t-on réélement réussi à te donner des idées sur ton futur métier (Oui / non / Je ne sais pas )",
        answer_text: nextAnswers.careerIdeas
      },
      {
        question_id: 'niv10_like_app',
        question_text: "On va passer au niveau suivant mais on aimerait bien savoir si tu aimes bien l'application ? (Oui/ non / Je ne sais pas)",
        answer_text: nextAnswers.likeApp
      }
    ]
    await usersAPI.saveExtraInfo(entries)
  }

  async function loadBilan() {
    setBilanError('')
    setBilanLoading(true)
    try {
      const { data } = await analysisAPI.getLevel10Bilan()
      setBilan(data || null)
    } catch (e) {
      console.error('Niveau10 bilan fetch failed', e)
      setBilan(null)
      setBilanError("Impossible de générer ton bilan pour le moment.")
    } finally {
      setBilanLoading(false)
    }
  }

  const onIntroContinue = () => {
    if (!typedDone) { skip(); return }
    setPhase(STEP_Q1)
  }

  const onPickQ1 = async (value) => {
    const next = { ...answers, careerIdeas: value }
    setAnswers(next)
    setPhase(STEP_Q2)
  }

  const onPickQ2 = async (value) => {
    const next = { ...answers, likeApp: value }
    setAnswers(next)

    setBilanError('')
    setPhase(STEP_BILAN)
    setBilan(null)

    try {
      await saveNiveau10Answers(next)
    } catch (e) {
      console.warn('Niveau10 extra info save failed (non-blocking):', e)
    }
    await loadBilan()
  }

  const onFinish = async () => {
    if (finishing) return
    setFinishing(true)
    try {
      await levelUp({ minLevel: 10, xpReward: XP_PER_LEVEL })
      setShowSuccess(true)
    } catch (e) {
      console.error('Niveau10 levelUp failed', e)
      setBilanError('Impossible de valider le niveau pour le moment. Réessaie.')
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

  const personalitySummary = bilan?.summaries?.personalitySummary
  const niveau1Summary = bilan?.summaries?.niveau1Summary
  const skillsBilan = bilan?.summaries?.skillsBilan

  const englishLevel = bilan?.english?.level || null
  const formations = Array.isArray(bilan?.formations?.studyRecommendations)
    ? bilan.formations.studyRecommendations
    : []

  const formationsText = formations
    .map(s => {
      if (!s) return null
      if (typeof s === 'string') return s
      const degree = s.degree || s.diploma || s.title || ''
      const type = s.type || s.study_type || s.label || ''
      return [degree, type].filter(Boolean).join(' – ') || null
    })
    .filter(Boolean)
    .slice(0, 8)

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
                  {typed}
                </div>
                <div className="absolute -left-2 top-6 w-0 h-0 border-t-8 border-b-8 border-r-8 border-t-transparent border-b-transparent border-r-black" />
              </div>

              <div className="mt-4 flex flex-col gap-3">
                {canContinueFromIntro && (
                  <button
                    type="button"
                    onClick={onIntroContinue}
                    className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200 w-full sm:w-auto"
                  >
                    Continuer
                  </button>
                )}

                {showQ1 && (
                  <div className="flex flex-col sm:flex-row gap-3">
                    {OPTIONS_3.map(opt => (
                      <button
                        key={`q1-${opt}`}
                        type="button"
                        onClick={() => onPickQ1(opt)}
                        className="px-4 py-2 rounded-lg bg-white text-gray-900 border border-gray-300 w-full sm:w-auto"
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                )}

                {showQ2 && (
                  <div className="flex flex-col sm:flex-row gap-3">
                    {OPTIONS_3.map(opt => (
                      <button
                        key={`q2-${opt}`}
                        type="button"
                        onClick={() => onPickQ2(opt)}
                        className="px-4 py-2 rounded-lg bg-white text-gray-900 border border-gray-300 w-full sm:w-auto"
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                )}

                {showBilan && (
                  <button
                    type="button"
                    onClick={onFinish}
                    disabled={bilanLoading || finishing}
                    className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200 w-full sm:w-auto disabled:opacity-60"
                  >
                    Continuer
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-card">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center text-white">📋</div>
            <h2 className="text-xl font-bold">Bilan</h2>
          </div>

          {!showBilan ? (
            <div className="text-text-secondary">Réponds aux 2 questions pour voir ton bilan.</div>
          ) : bilanLoading ? (
            <div className="text-center">
              <div className="inline-block w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
              <p className="mt-2 text-text-secondary">Génération de ton bilan…</p>
            </div>
          ) : bilanError ? (
            <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-lg">{bilanError}</div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="font-semibold">Anglais</div>
                <div className="text-text-secondary">Niveau : {englishLevel || 'Non disponible'}</div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="font-semibold">Formations</div>
                {formationsText.length ? (
                  <ul className="mt-2 list-disc pl-5 text-text-secondary">
                    {formationsText.map((t, idx) => (
                      <li key={`formation-${idx}`}>{t}</li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-text-secondary">Non disponible</div>
                )}
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="font-semibold">Résumé du test de personnalité</div>
                <div className="mt-2 whitespace-pre-wrap text-text-secondary">{personalitySummary || 'Non disponible'}</div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="font-semibold">Résumé de tes réponses du Niveau 1</div>
                <div className="mt-2 whitespace-pre-wrap text-text-secondary">{niveau1Summary || 'Non disponible'}</div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="font-semibold">Bilan des compétences</div>
                <div className="mt-2 whitespace-pre-wrap text-text-secondary">{skillsBilan || 'Non disponible'}</div>
              </div>

              {Boolean(bilanError) && (
                <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-lg">{bilanError}</div>
              )}
            </div>
          )}
        </div>
      </div>

      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="relative bg-white border border-gray-200 rounded-2xl p-8 shadow-2xl text-center max-w-md w-11/12">
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 w-10 h-10 bg-[#c1ff72] rounded-full flex items-center justify-center shadow-md animate-bounce">🏆</div>
            <h3 className="text-2xl font-extrabold mb-2">Niveau 10 réussi !</h3>
            <p className="text-text-secondary mb-4">Tu as terminé cette étape avec succès.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button onClick={() => navigate('/app/activites')} className="px-4 py-2 rounded-lg bg-white text-gray-900 border border-gray-200">Retour aux activités</button>
              <button onClick={() => navigate('/app/niveau/11')} className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200">Passer au niveau suivant</button>
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

// Legacy upsell implementation (disabled). Will be removed once confirmed unnecessary.
function Niveau10Legacy_DISABLED() {
  const [hasPaid, setHasPaid] = useState(false)
  const [userId, setUserId] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [mouthAlt, setMouthAlt] = useState(false)
  const [phase, setPhase] = useState('dialogue') // dialogue -> share -> payment
  const [dialogueIdx, setDialogueIdx] = useState(0)
  const [statusBanner, setStatusBanner] = useState(null)
  const [error, setError] = useState('')
  const [checkoutState, setCheckoutState] = useState('idle')
  const [savingProgress, setSavingProgress] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [showPaymentCelebration, setShowPaymentCelebration] = useState(false)
  const [waitlistEntry, setWaitlistEntry] = useState(null)
  const [analysisData, setAnalysisData] = useState(null)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [analysisError, setAnalysisError] = useState('')
  const [emails, setEmails] = useState([])
  const [emailInput, setEmailInput] = useState('')
  const [sendError, setSendError] = useState('')
  const [sendingEmails, setSendingEmails] = useState(false)
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [stripeConfig, setStripeConfig] = useState({
    publishableKey: null,
    priceId: null,
    priceAmount: null,
    priceCurrency: 'eur',
    productName: 'Zélia+ — Accès complet'
  })
  const stripePromiseRef = useRef(null)
  const verifyingRef = useRef(false)

  const benefits = useMemo(() => ([
    {
      title: 'Niveaux 11 à 20',
      description: "Découvre les univers métiers, rencontre des professionnels et prépare tes immersions."
    },
    {
      title: 'Niveaux 21 à 30',
      description: 'Valorise tes compétences, construis un CV impactant et rédige ta lettre de motivation idéale.'
    },
    {
      title: 'Niveaux 31 à 40',
      description: 'Sécurise Parcoursup, prépare tes oraux et travaille ta posture pour convaincre.'
    },
    {
      title: 'Niveaux 41 à 50',
      description: 'Polis chaque détail de ton dossier et passe en mode mentor pour inspirer les autres.'
    }
  ]), [])

  const formattedPrice = useMemo(() => {
    if (!stripeConfig?.priceAmount || stripeConfig.priceAmount <= 0) return null
    try {
      return new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: (stripeConfig.priceCurrency || 'eur').toUpperCase()
      }).format(stripeConfig.priceAmount / 100)
    } catch {
      const amount = (stripeConfig.priceAmount / 100).toFixed(2)
      return `${amount} ${(stripeConfig.priceCurrency || 'EUR').toUpperCase()}`
    }
  }, [stripeConfig.priceAmount, stripeConfig.priceCurrency])

  const defaultPriceLabel = formattedPrice || '24,99 €'

  const userFirstName = useMemo(() => {
    if (!profile) return 'ton enfant'
    if (profile.first_name) return profile.first_name
    if (profile.full_name) return profile.full_name.split(' ')[0]
    return 'ton enfant'
  }, [profile])

  const waitlistJoined = Boolean(waitlistEntry?.id)

  const waitlistJoinDateLabel = useMemo(() => {
    if (!waitlistEntry?.created_at) return null
    try {
      return new Intl.DateTimeFormat('fr-FR', {
        dateStyle: 'medium',
        timeStyle: 'short'
      }).format(new Date(waitlistEntry.created_at))
    } catch {
      return null
    }
  }, [waitlistEntry])

  const currentDialogue = DIALOGUE_STEPS[Math.min(dialogueIdx, DIALOGUE_STEPS.length - 1)]
  const { text: dialogueText, done: dialogueDone, skip: skipDialogue } = useTypewriter(currentDialogue?.text || '', currentDialogue?.durationMs || 2000)

  const shouldAnimateMouth = phase === 'dialogue' && !dialogueDone

  useEffect(() => {
    if (!shouldAnimateMouth) return undefined
    const interval = setInterval(() => setMouthAlt((v) => !v), 200)
    return () => clearInterval(interval)
  }, [shouldAnimateMouth])

  useEffect(() => {
    setLoading(true)
    let cancelled = false

    ;(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          navigate('/login')
          return
        }

        setUserId(user.id)

        const profileRes = await usersAPI.getProfile().catch(() => null)
        if (cancelled) return

        const prof = profileRes?.data?.profile || profileRes?.data || null
        setProfile(prof)
        const paid = Boolean(prof?.has_paid)
        setHasPaid(paid)
        setAvatarUrl(buildAvatarFromProfile(prof, user.id))
        if (paid) setPhase('payment')
      } catch (err) {
        console.error('Niveau10 profile load error', err)
        if (!cancelled) {
          setError("Impossible de charger ton profil. Réessaie plus tard.")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [navigate])

  useEffect(() => {
    if (!userId) return
    let cancelled = false

    ;(async () => {
      try {
        const { data } = await waitlistAPI.getMyEntry()
        if (!cancelled && data?.entry) {
          setWaitlistEntry(data.entry)
        }
      } catch (err) {
        if (err?.response?.status !== 404) {
          console.warn('Unable to fetch waitlist entry', err)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [userId])

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        const { data } = await paymentsAPI.getConfig().catch(() => ({ data: {} }))
        if (cancelled) return

        setStripeConfig({
          publishableKey: data?.publishableKey || null,
          priceId: data?.priceId || null,
          priceAmount: typeof data?.priceAmount === 'number' ? data.priceAmount : null,
          priceCurrency: data?.priceCurrency || 'eur',
          productName: data?.productName || 'Zélia+ — Accès complet'
        })

        if (data?.publishableKey) {
          stripePromiseRef.current = loadStripe(data.publishableKey)
        }
      } catch (err) {
        console.error('Stripe config load failed', err)
        if (!cancelled) {
          setStatusBanner({
            tone: 'warning',
            text: "Stripe n'est pas encore configuré. Ajoute tes clés dans les variables d'environnement pour activer le paiement."
          })
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const checkout = searchParams.get('checkout')
    if (checkout === 'cancelled') {
      setStatusBanner({ tone: 'info', text: 'Paiement annulé. Tu peux réessayer quand tu seras prêt(e).' })
    } else if (checkout === 'success') {
      setStatusBanner({ tone: 'info', text: 'Merci ! Vérification de ton paiement en cours…' })
    }
  }, [searchParams])

  useEffect(() => {
    if (!profile) return
    const seed = userId || profile?.id || 'zelia'
    setAvatarUrl(buildAvatarFromProfile(profile, seed))
  }, [profile, userId])

  useEffect(() => {
    const sessionId = searchParams.get('session_id')
    if (!sessionId || verifyingRef.current) return

    verifyingRef.current = true
    setCheckoutState('verifying')
    setStatusBanner({ tone: 'info', text: 'Nous vérifions la confirmation de ton paiement…' })

    ;(async () => {
      try {
        const { data } = await paymentsAPI.verifySession(sessionId)
        if (data?.paid) {
          setHasPaid(true)
          setPhase('payment')
          setStatusBanner({ tone: 'success', text: 'Paiement confirmé ! Zélia+ est désormais activé.' })
          setShowPaymentCelebration(true)
          await refreshProfile()
        } else {
          setStatusBanner({ tone: 'warning', text: 'Paiement en attente ou incomplet. Si le débit apparaît, contacte-nous.' })
        }
      } catch (err) {
        console.error('Payment verification failed', err)
        setStatusBanner({ tone: 'error', text: 'Impossible de vérifier le paiement. Contacte le support si besoin.' })
      } finally {
        verifyingRef.current = false
        setCheckoutState('idle')
      }
    })()
  }, [searchParams])

  const refreshProfile = useCallback(async () => {
    try {
      const profileRes = await usersAPI.getProfile().catch(() => null)
      const prof = profileRes?.data?.profile || profileRes?.data || null
      setProfile(prof)
      setHasPaid(Boolean(prof?.has_paid))
      setAvatarUrl(buildAvatarFromProfile(prof, userId || 'zelia'))
    } catch (err) {
      console.warn('Unable to refresh profile after payment', err)
    }
  }, [userId])

  const ensureAnalysisData = useCallback(async () => {
    if (analysisData?.orientation) return analysisData
    if (analysisLoading) return null
    setAnalysisLoading(true)
    setAnalysisError('')

    const fetchResults = async () => {
      const response = await apiClient.get('/analysis/my-results', {
        headers: { 'Cache-Control': 'no-cache' },
        params: { _: Date.now() }
      })
      return response.data.results
    }

    try {
      const results = await fetchResults()
      const orientation = results?.inscriptionResults || null
      if (!orientation) {
        setAnalysisError('Complète ton questionnaire d’orientation avant de pouvoir partager ton dossier.')
        return null
      }
      const mapped = { orientation, raw: results }
      setAnalysisData(mapped)
      return mapped
    } catch (err) {
      if (err.response?.status === 404) {
        const targetUserId = userId || profile?.id
        if (targetUserId) {
          try {
            await apiClient.post('/analysis/generate-analysis', { userId: targetUserId })
            const refreshed = await fetchResults()
            const orientation = refreshed?.inscriptionResults || null
            if (!orientation) {
              setAnalysisError('Aucun résultat d’orientation disponible. Assure-toi d’avoir terminé le questionnaire inscription.')
              return null
            }
            const mapped = { orientation, raw: refreshed }
            setAnalysisData(mapped)
            return mapped
          } catch (genErr) {
            console.error('Generation fallback failed', genErr)
            setAnalysisError('Impossible de récupérer tes résultats pour le moment. Vérifie que tu as complété ton analyse.')
          }
        }
      } else if (err.response?.status === 401) {
        setAnalysisError('Session expirée. Recharge la page et reconnecte-toi pour partager tes résultats.')
      } else {
        console.error('Analysis fetch failed', err)
        setAnalysisError('Erreur lors du chargement des résultats. Réessaie dans un instant.')
      }
    } finally {
      setAnalysisLoading(false)
    }
    return null
  }, [analysisData, analysisLoading, profile?.id, userId])

  const handleDialogueNext = () => {
    if (!dialogueDone) {
      skipDialogue()
      return
    }
    if (dialogueIdx + 1 < DIALOGUE_STEPS.length) {
      setDialogueIdx((idx) => idx + 1)
      if (dialogueIdx + 1 === DIALOGUE_STEPS.length - 1) setPhase('share')
    } else {
      setPhase('share')
    }
  }

  const addEmailFromInput = () => {
    const trimmed = emailInput.trim()
    if (!trimmed) return
    if (!EMAIL_REGEX.test(trimmed)) {
      setSendError('Adresse e-mail invalide.')
      return
    }
    if (emails.includes(trimmed.toLowerCase())) {
      setSendError("Cette adresse est déjà ajoutée.")
      return
    }
    setEmails((prev) => [...prev, trimmed.toLowerCase()])
    setEmailInput('')
    setSendError('')
  }

  const removeEmail = (email) => {
    setEmails((prev) => prev.filter((item) => item !== email))
  }

  const handleSendEmails = async () => {
    setSendError('')
    if (!emails.length) {
      setSendError('Ajoute au moins une adresse e-mail.')
      return
    }

    setSendingEmails(true)
    try {
      const data = await ensureAnalysisData()
      const orientationResults = data?.orientation
      if (!orientationResults) {
        throw new Error('Résultats d’orientation indisponibles')
      }
      const pdf = await generateResultsPdf({ profile, results: orientationResults, benefits, priceLabel: defaultPriceLabel })
      const dataUri = pdf.output('datauristring')
      const base64 = dataUri.split(',')[1]
      const filename = `resultats-orientation-${userFirstName.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.pdf`

      const payload = {
        recipients: emails,
        subject: `Voici les résultats d'orientation de ${userFirstName}`,
        text: buildEmailBody({ firstName: userFirstName, benefits, price: defaultPriceLabel }),
        html: buildEmailHtml({ firstName: userFirstName, benefits, price: defaultPriceLabel }),
        attachment: {
          filename,
          content: base64
        }
      }

      await shareAPI.sendResults(payload)
      setStatusBanner({ tone: 'success', text: 'E-mail envoyé ! Tu peux maintenant activer Zélia+.' })
      setPhase('payment')
    } catch (err) {
      console.error('Share results failed', err)
      const message = err.response?.data?.error || err.message || 'Impossible d’envoyer les résultats.'
      setSendError(message)
    } finally {
      setSendingEmails(false)
    }
  }

  const handleDownloadPdf = async () => {
    setDownloadingPdf(true)
    setSendError('')
    try {
      const data = await ensureAnalysisData()
      const orientationResults = data?.orientation
      if (!orientationResults) {
        throw new Error('Résultats d’orientation indisponibles')
      }
      const pdf = await generateResultsPdf({ profile, results: orientationResults, benefits, priceLabel: defaultPriceLabel })
      const filename = `resultats-orientation-${userFirstName.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.pdf`
      pdf.save(filename)
    } catch (err) {
      console.error('Download PDF failed', err)
      setSendError('Impossible de télécharger le PDF.')
    } finally {
      setDownloadingPdf(false)
    }
  }

  // Stripe checkout conservé pour référence si on réactive le paiement direct :
  /*
  try {
    const { data } = await paymentsAPI.createCheckout()
    const sessionId = data?.sessionId

    if (!sessionId) {
      throw new Error('Missing session id')
    }

    const stripe = stripePromiseRef.current ? await stripePromiseRef.current : null

    if (stripe) {
      const { error: stripeError } = await stripe.redirectToCheckout({ sessionId })
      if (stripeError) {
        console.warn('Stripe redirect error', stripeError)
        if (data?.url) {
          window.location.href = data.url
          return
        }
        throw stripeError
      }
    } else if (data?.url) {
      window.location.href = data.url
    } else {
      throw new Error('Stripe non initialisé')
    }
  } catch (err) {
    console.error('Checkout initiation failed', err)
    setError("Impossible de lancer le paiement. Merci de réessayer dans quelques instants.")
  }
  */

  const handleCheckout = async () => {
    setError('')
    setStatusBanner(null)
    setCheckoutState('processing')

    try {
      await usersAPI.updateProfile({ accent_color: 'Registered' })
      setProfile((prev) => (prev ? { ...prev, accent_color: 'Registered' } : prev))
    } catch (err) {
      console.error('Waitlist registration failed', err)
      const message = err.response?.data?.error || "Impossible de t'inscrire sur la liste d'attente. Réessaie dans un instant."
      setError(message)
      setCheckoutState('idle')
      return
    }

    try {
      const { data } = await waitlistAPI.join({
        source: 'niveau-10',
        level: 10,
        note: 'Inscription déclenchée depuis le CTA du niveau 10',
        metadata: {
          hasPaid,
          profileId: profile?.id || userId || null
        }
      })
      if (data?.entry) {
        setWaitlistEntry(data.entry)
      }
      setStatusBanner({
        tone: 'success',
        text: data?.alreadyJoined
          ? 'Tu es déjà sur la liste d’attente. On revient très vite vers toi !'
          : 'Inscription confirmée ! On t’avertit dès que Zélia+ est prêt.'
      })
      setError('')
    } catch (err) {
      console.error('Waitlist join failed', err)
      const message = err.response?.data?.error || "Impossible de t'inscrire sur la liste d'attente. Réessaie dans quelques instants."
      setError(message)
    } finally {
      setCheckoutState('idle')
    }
  }

  const handleValidateLevel = async () => {
    setSavingProgress(true)
    setError('')
    try {
      await levelUp({ minLevel: 10, xpReward: XP_REWARD })
      setCompleted(true)
    } catch (err) {
      console.error('Level up failed', err)
      setError('Impossible de valider le niveau. Réessaie dans un instant.')
    } finally {
      setSavingProgress(false)
    }
  }

  const displayedAvatarUrl = useMemo(() => {
    if (!avatarUrl) return avatarUrl
    if (phase === 'dialogue' && shouldAnimateMouth) {
      return modifyDicebearUrl(avatarUrl, { mouth: mouthAlt ? 'happy08' : 'happy01' })
    }
    return modifyDicebearUrl(avatarUrl, { mouth: null })
  }, [avatarUrl, mouthAlt, phase, shouldAnimateMouth])

  if (loading) {
    return (
      <div className="p-6 text-center">
        <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-black border-t-transparent" />
        <p className="mt-2 text-text-secondary">Chargement du niveau…</p>
      </div>
    )
  }

  const renderDialogueLayout = () => (
    <div className="p-4 md:p-6">
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-card md:p-8">
          <div className="flex flex-col items-center gap-6 md:flex-row md:items-start">
            <img
              src={displayedAvatarUrl || '/static/images/logo-dark.png'}
              alt="Avatar"
              className="mx-auto h-28 w-28 rounded-3xl border border-gray-100 bg-white object-contain shadow-sm sm:h-36 sm:w-36 md:h-44 md:w-44 lg:h-52 lg:w-52 xl:h-60 xl:w-60 2xl:h-64 2xl:w-64"
            />
            <div className="flex-1">
              <div className="relative w-full rounded-2xl bg-black px-5 py-4 text-white md:px-6 md:py-5">
                <p className="min-h-[3.5rem] whitespace-pre-wrap text-base leading-relaxed md:text-lg">{dialogueText}</p>
                <div className="absolute -left-2 top-6 h-0 w-0 border-b-8 border-r-8 border-t-8 border-b-transparent border-r-black border-t-transparent" />
              </div>
              <button
                type="button"
                onClick={handleDialogueNext}
                className="mt-4 inline-flex items-center justify-center rounded-xl bg-[#c1ff72] px-5 py-3 text-base font-semibold text-black transition hover:bg-[#b3ff5d]"
              >
                {dialogueIdx === DIALOGUE_STEPS.length - 1 ? 'Compris !' : 'Suivant'}
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 text-sm shadow-card md:p-8">
          <h2 className="text-xl font-bold text-gray-900">Tu as atteint le dernier niveau</h2>
          <p className="mt-3 text-gray-600">
            Tu as atteint le dernier niveau de cette version gratuite :) Si tu souhaites continuer pour approfondir tes connaissances (rencontres métiers, jobs, inspirations, mini exercices pour préciser tes choix...), inscris-toi sur la liste d’attente et on te prévient quand tout est prêt !
          </p>
          <p className="mt-3 text-gray-600">
            Tu pourras activer Zélia+.
          </p>
        </div>
      </div>
    </div>
  )

  const renderShareLayout = () => (
    <div className="p-4 md:p-6">
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-card md:p-8">
          <div className="flex flex-col items-center gap-6 md:flex-row md:items-start">
            <img
              src={displayedAvatarUrl || '/static/images/logo-dark.png'}
              alt="Avatar"
              className="mx-auto h-28 w-28 rounded-3xl border border-gray-100 bg-white object-contain shadow-sm sm:h-36 sm:w-36 md:h-44 md:w-44 lg:h-52 lg:w-52 xl:h-60 xl:w-60 2xl:h-64 2xl:w-64"
            />
            <div className="flex-1">
              <div className="relative w-full rounded-2xl bg-black px-5 py-4 text-white md:px-6 md:py-5">
                <p className="min-h-[3.5rem] whitespace-pre-wrap text-base leading-relaxed md:text-lg">
                  Insère les e-mails des personnes qui peuvent te donner accès à Zélia+. On leur envoie ton dossier en PDF.
                </p>
                <div className="absolute -left-2 top-6 h-0 w-0 border-b-8 border-r-8 border-t-8 border-b-transparent border-r-black border-t-transparent" />
              </div>
              <div className="mt-4 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">
                <p className="font-semibold text-gray-900">Contenu du dossier :</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>Résultats Métiers, Personnalité, Compétences (format MPC)</li>
                  <li>Recommandations personnalisées et prochaines étapes</li>
                  <li>Présentation de Zélia+ et de tout ce que tu vas débloquer</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-card md:p-8">
          <h2 className="text-xl font-bold text-gray-900">Partager mes résultats</h2>
          <p className="mt-2 text-sm text-gray-600">Entre les adresses e-mail des parents, tuteurs ou référents qui doivent valider ton accès à Zélia+.</p>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              type="email"
              value={emailInput}
              onChange={(event) => {
                setEmailInput(event.target.value)
                if (sendError) setSendError('')
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  addEmailFromInput()
                }
              }}
              placeholder="parent@example.com"
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:border-black focus:outline-none focus:ring-2 focus:ring-black/10"
            />
            <button
              type="button"
              onClick={addEmailFromInput}
              className="inline-flex items-center justify-center rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-gray-900"
            >
              Ajouter
            </button>
          </div>

          {emails.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {emails.map((email) => (
                <span key={email} className="inline-flex items-center gap-2 rounded-full bg-gray-900/10 px-3 py-1 text-sm text-gray-800">
                  {email}
                  <button type="button" onClick={() => removeEmail(email)} className="text-gray-500 transition hover:text-gray-800">
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          {analysisError && (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              {analysisError}
            </div>
          )}

          {sendError && (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {sendError}
            </div>
          )}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={handleSendEmails}
              disabled={sendingEmails || downloadingPdf || analysisLoading}
              className="inline-flex items-center justify-center rounded-xl bg-[#c1ff72] px-5 py-3 text-base font-semibold text-black transition hover:bg-[#b3ff5d] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sendingEmails ? 'Envoi en cours…' : 'Envoyer mon dossier' }
            </button>
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={sendingEmails || downloadingPdf || analysisLoading}
              className="inline-flex items-center justify-center rounded-xl border border-gray-200 px-5 py-3 text-base font-semibold text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {downloadingPdf ? 'Génération…' : 'Télécharger le PDF'}
            </button>
            <button
              type="button"
              onClick={() => setPhase('payment')}
              className="inline-flex items-center justify-center rounded-xl border border-transparent px-5 py-3 text-base font-semibold text-gray-500 transition hover:text-gray-700 hover:bg-gray-50"
            >
              Passer
            </button>
          </div>

          <p className="mt-3 text-sm text-gray-500">
            Nous utilisons uniquement ces e-mails pour envoyer le PDF récapitulatif de tes résultats et présenter Zélia+. Aucun compte ne sera créé sans leur accord.
          </p>
        </div>
      </div>
    </div>
  )

  const renderPaymentLayout = () => (
    <div className="p-4 md:p-6">
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-card md:p-8">
          <div className="flex flex-col gap-2">
            <div className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-gray-500">
              <span className="inline-flex h-6 min-w-[2rem] items-center justify-center rounded-full bg-black px-2 text-xs font-bold text-white">
                Niv. 10
              </span>
              Zélia+
            </div>
            <h1 className="text-3xl font-extrabold text-gray-900">Active Zélia+ pour débloquer la suite</h1>
            <p className="text-lg text-gray-600">
              Nous te félicitons pour être arrivé jusqu’ici ! Pour continuer ton aventure et accéder aux niveaux 11 à 50, inscris-toi sur la liste d’attente de Zélia+.
            </p>
          </div>

          {statusBanner && (
            <div className={`mt-4 rounded-2xl px-4 py-3 text-sm ${STATUS_STYLES[statusBanner.tone] || STATUS_STYLES.info}`}>
              {statusBanner.text}
            </div>
          )}

          {error && (
            <div className={`mt-4 rounded-2xl px-4 py-3 text-sm ${STATUS_STYLES.error}`}>
              {error}
            </div>
          )}

          {!hasPaid && (
            <div className="mt-6 space-y-6">
              <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">
                <p className="font-semibold text-gray-900">Ce que tu obtiens :</p>
                <ul className="mt-2 list-disc space-y-1 pl-4">
                  <li>Accès immédiat aux niveaux 11 à 50</li>
                  <li>Ateliers premium (CV, lettre, Parcoursup, oraux)</li>
                  <li>Support prioritaire et mises à jour exclusives</li>
                </ul>
                <p className="mt-3 text-sm text-gray-500">Tarif : {defaultPriceLabel} (paiement unique). Si tu es intéressé·e, inscris-toi sur la liste d’attente.</p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={handleCheckout}
                  disabled={checkoutState !== 'idle' || waitlistJoined}
                  className="inline-flex items-center justify-center rounded-xl bg-[#c1ff72] px-5 py-3 text-base font-semibold text-black transition hover:bg-[#b3ff5d] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {waitlistJoined
                    ? 'Déjà inscrit·e sur la liste'
                    : checkoutState === 'processing'
                      ? 'Inscription en cours…'
                      : checkoutState === 'verifying'
                        ? 'Vérification…'
                        : "S'inscrire sur la liste d'attente"}
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/app/activites')}
                  className="inline-flex items-center justify-center rounded-xl border border-gray-200 px-5 py-3 text-base font-semibold text-gray-700 transition hover:bg-gray-100"
                >
                  Retour aux activités
                </button>
              </div>

              {waitlistJoined && (
                <p className="text-sm text-gray-500">
                  Inscription enregistrée{waitlistJoinDateLabel ? ` le ${waitlistJoinDateLabel}` : ''}. On te tient informé·e par e-mail.
                </p>
              )}

              <p className="flex items-center gap-2 text-sm text-gray-400">
                <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                L’activation restera 100% sécurisée via Stripe dès son ouverture. Les données bancaires ne transitent jamais par Zélia.
              </p>
            </div>
          )}

          {hasPaid && (
            <div className="mt-6 space-y-4">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                Bravo ! Zélia+ est actif. Tu peux maintenant valider ce niveau et poursuivre ton parcours.
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={handleValidateLevel}
                  disabled={savingProgress}
                  className="inline-flex items-center justify-center rounded-xl bg-[#c1ff72] px-5 py-3 text-base font-semibold text-black transition hover:bg-[#b3ff5d] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingProgress ? 'Validation…' : 'Valider le niveau 10'}
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/app/activites')}
                  className="inline-flex items-center justify-center rounded-xl border border-gray-200 px-5 py-3 text-base font-semibold text-gray-700 transition hover:bg-gray-100"
                >
                  Retour aux activités
                </button>
              </div>
              <p className="text-sm text-gray-500">Une fois validé, tu pourras accéder directement au niveau 11 depuis la page Activités.</p>
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-card md:p-8">
          <h2 className="text-xl font-bold text-gray-900">Ce que Zélia+ débloque</h2>
          <p className="mt-2 text-sm text-gray-500">Ton parcours devient complet et guidé jusqu’aux derniers niveaux.</p>
          <ul className="mt-6 space-y-3">
            {benefits.map((benefit) => (
              <li key={benefit.title} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <p className="font-semibold text-gray-900">{benefit.title}</p>
                <p className="text-sm text-gray-600">{benefit.description}</p>
              </li>
            ))}
          </ul>
          <div className="mt-6 rounded-2xl border border-dashed border-gray-300 p-4 text-sm text-gray-500">
            <p className="font-semibold text-gray-900">Besoin d’aide ?</p>
            <p className="mt-1">Écris-nous via le chat ou par e-mail : <a className="font-medium text-gray-900 underline" href="mailto:support@zelia.io">support@zelia.io</a>.</p>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <>
      {phase === 'dialogue' && renderDialogueLayout()}
      {phase === 'share' && renderShareLayout()}
      {phase === 'payment' && renderPaymentLayout()}

      {showPaymentCelebration && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="relative w-full max-w-lg rounded-3xl border border-gray-200 bg-white p-8 text-center shadow-2xl">
            <button
              type="button"
              onClick={() => setShowPaymentCelebration(false)}
              className="absolute right-4 top-4 text-gray-400 transition hover:text-gray-600"
              aria-label="Fermer l'animation"
            >
              <span className="text-2xl">×</span>
            </button>
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 flex h-12 w-12 items-center justify-center rounded-full bg-[#c1ff72] text-2xl shadow-lg animate-bounce">
              🎉
            </div>
            <img
              src={avatarUrl || '/assets/images/logo-dark.png'}
              alt="Avatar Zélia"
              className="mx-auto mt-6 h-32 w-32 rounded-2xl border border-gray-100 bg-white object-contain shadow-md"
            />
            <h3 className="mt-6 text-2xl font-extrabold text-gray-900">Merci pour le paiement !</h3>
            <p className="mt-2 text-base text-gray-600">Merci pour ta confiance, on va pouvoir passer au niveau 11 ensemble.</p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={() => {
                  setShowPaymentCelebration(false)
                  handleValidateLevel()
                }}
                disabled={savingProgress}
                className="inline-flex items-center justify-center rounded-xl bg-[#c1ff72] px-5 py-3 text-base font-semibold text-black transition hover:bg-[#b3ff5d] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingProgress ? 'Validation…' : 'Valider le niveau 10'}
              </button>
              <button
                type="button"
                onClick={() => setShowPaymentCelebration(false)}
                className="inline-flex items-center justify-center rounded-xl border border-gray-200 px-5 py-3 text-base font-semibold text-gray-700 transition hover:bg-gray-100"
              >
                Plus tard
              </button>
            </div>
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="absolute left-6 top-8 h-2 w-2 animate-ping rounded-full bg-[#f68fff]" />
              <div className="absolute right-8 top-10 h-2 w-2 animate-ping rounded-full bg-[#c1ff72]" />
              <div className="absolute left-10 bottom-8 h-2 w-2 animate-ping rounded-full bg-[#8cd3ff]" />
              <div className="absolute right-6 bottom-10 h-2 w-2 animate-ping rounded-full bg-[#f8c572]" />
            </div>
          </div>
        </div>
      )}

      {completed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="relative w-full max-w-md rounded-3xl border border-gray-200 bg-white p-8 text-center shadow-2xl">
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 flex h-12 w-12 items-center justify-center rounded-full bg-[#c1ff72] text-2xl shadow-lg">
              🚀
            </div>
            <h3 className="mt-4 text-2xl font-extrabold text-gray-900">Niveau 10 validé !</h3>
            <p className="mt-2 text-gray-500">Tu peux maintenant passer au niveau 11 et poursuivre ton parcours premium.</p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={() => navigate('/app/activites')}
                className="inline-flex items-center justify-center rounded-xl bg-[#c1ff72] px-5 py-3 text-base font-semibold text-black transition hover:bg-[#b3ff5d]"
              >
                Voir mes activités
              </button>
              <button
                type="button"
                onClick={() => setCompleted(false)}
                className="inline-flex items-center justify-center rounded-xl border border-gray-200 px-5 py-3 text-base font-semibold text-gray-700 transition hover:bg-gray-100"
              >
                Rester ici
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}