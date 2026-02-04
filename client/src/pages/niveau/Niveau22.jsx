import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import supabase from '../../lib/supabase'
import apiClient, { usersAPI } from '../../lib/api'
import { buildAvatarFromProfile } from '../../lib/avatar'
import { XP_PER_LEVEL, levelUp } from '../../lib/progression'

const INTRO_DIALOGUES = [
  {
    text: "Dit m'en un peu plus sur tes projections futures, on va essayer de budgétiser tes futurs études.",
    durationMs: 2200
  },
  {
    text: "Je vais te donner quelques pistes pour choisir si tu préférerais le privé.",
    durationMs: 2000
  }
]

const PRIVATE_PROS = [
  'Réseau : Accès puissant aux entreprises et aux anciens élèves.',
  "Carrière : Très axé sur l'emploi, les stages et l'alternance.",
  'Suivi : Petites classes, coaching et accompagnement proche.',
  'Cadre : Campus modernes et vie associative riche.'
]

const PRIVATE_CONS = [
  'Prix : Très cher (de 5 000€ à 15 000€+ par an).',
  'Pièges : Qualité très variable (attention aux diplômes non reconnus).',
  'Niveau : Parfois moins sélectif académiquement ("payer pour avoir").'
]

const PUBLIC_PROS = [
  'Coût : Quasi gratuit (frais d\'inscription faibles).',
  "Diplôme : Valeur sûre, reconnue officiellement par l'État.",
  'Indépendance : Apprend la débrouillardise et l\'autonomie.',
  'Niveau : Excellence théorique et recherche.'
]

const PUBLIC_CONS = [
  "Encadrement : Très faible, vous êtes livré à vous-même.",
  'Pratique : Souvent trop théorique, moins connecté au marché.',
  'Moyens : Locaux parfois vétustes, amphis bondés.'
]

const STUDY_LEVELS = ['Bac +2', 'Bac +3', 'Bac +5', 'Bac +8', 'Bac +8 ou plus']

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

export default function Niveau22() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [profile, setProfile] = useState(null)
  const [avatarUrl, setAvatarUrl] = useState('')
  const [showSuccess, setShowSuccess] = useState(false)
  const [saving, setSaving] = useState(false)

  const [introIndex, setIntroIndex] = useState(0)
  const [phase, setPhase] = useState('intro')

  const [preference, setPreference] = useState('')
  const [nearHome, setNearHome] = useState(null)
  const [city, setCity] = useState('')
  const [needsHousing, setNeedsHousing] = useState(null)
  const [studyLevel, setStudyLevel] = useState('')

  const [estimateLoading, setEstimateLoading] = useState(false)
  const [estimate, setEstimate] = useState(null)

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
        console.error('Niveau22 load error', e)
        if (!mounted) return
        setError('Erreur de chargement')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [navigate])

  const currentIntro = INTRO_DIALOGUES[Math.min(introIndex, INTRO_DIALOGUES.length - 1)]
  const { text: typedIntro, done: typedIntroDone, skip: skipIntro } = useTypewriter(
    currentIntro?.text || '',
    currentIntro?.durationMs || 1500
  )

  const firstName = profile?.first_name || 'toi'

  const dialogueText = (() => {
    if (phase === 'intro') return typedIntro
    if (phase === 'private') return "Voici les avantages et inconvénients du privé."
    if (phase === 'public') return "Passons maintenant au public."
    if (phase === 'choice') return "Alors est-ce que tu préfères t'orienter dans le public ou plutôt dans le privé ?"
    if (phase === 'confirm') return `Ok très bien ${firstName}, tu fais le bon choix.`
    if (phase === 'near') return "Tu penses faire tes études proche de chez toi ?"
    if (phase === 'city') return "Dans quelle ville souhaiterais-tu faire tes études ?"
    if (phase === 'housing') return "Alors tu penses prendre un logement pour cela ? Cela va m'aider à te donner une fourchette de prix."
    if (phase === 'level') return "Tu souhaites aller jusqu'à quel niveau d'études ?"
    if (phase === 'estimate') return "Ok merci, je vais te donner une estimation sur les prochaines années, patiente 10s."
    if (phase === 'result') return 'Voici ton estimation.'
    return ''
  })()

  const onIntroNext = () => {
    if (!typedIntroDone) {
      skipIntro()
      return
    }
    if (introIndex < INTRO_DIALOGUES.length - 1) {
      setIntroIndex(prev => prev + 1)
      return
    }
    setPhase('private')
  }

  const onEstimate = async () => {
    if (estimateLoading || estimate) return
    setEstimateLoading(true)
    try {
      const context = [
        `Préférence: ${preference || 'non renseigné'}`,
        `Proche de chez soi: ${nearHome === null ? 'non renseigné' : nearHome ? 'oui' : 'non'}`,
        `Ville: ${city ? city : 'non renseignée'}`,
        `Logement: ${needsHousing === null ? 'non renseigné' : needsHousing ? 'oui' : 'non'}`,
        `Niveau d'études: ${studyLevel || 'non renseigné'}`
      ].join('\n')

      const message = `Tu es un conseiller d'orientation. Voici le contexte de l'élève:\n${context}\n\nDonne une estimation de budget total pour les prochaines années d'études en France selon ces informations.\nRéponds en JSON strict avec min, max et un court message: {"min": 0, "max": 0, "message": "texte court"}.\nRéponds UNIQUEMENT avec le JSON.`

      const resp = await apiClient.post('/chat/ai', {
        mode: 'advisor',
        advisorType: 'study-budget',
        message,
        history: []
      })

      const reply = resp?.data?.reply || ''
      const jsonMatch = reply.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        setEstimate({
          min: parsed.min ?? null,
          max: parsed.max ?? null,
          message: sanitizeText(parsed.message || '')
        })
      } else {
        setEstimate({
          min: null,
          max: null,
          message: sanitizeText(reply)
        })
      }
      setPhase('result')
    } catch (e) {
      console.error('Budget estimate error', e)
      setEstimate({ min: null, max: null, message: "Je n'ai pas pu estimer, mais on peut affiner ensemble." })
      setPhase('result')
    } finally {
      setEstimateLoading(false)
    }
  }

  useEffect(() => {
    if (phase === 'estimate') {
      onEstimate()
    }
  }, [phase])

  const onValidate = async () => {
    if (saving) return
    setSaving(true)
    try {
      const entries = [
        {
          question_id: 'niveau22_preference',
          question_text: 'Préférence public/privé (Niveau 22)',
          answer_text: preference || ''
        },
        {
          question_id: 'niveau22_near_home',
          question_text: 'Études proches de chez soi (Niveau 22)',
          answer_text: nearHome === null ? '' : nearHome ? 'Oui' : 'Non'
        },
        {
          question_id: 'niveau22_city',
          question_text: 'Ville d\'études (Niveau 22)',
          answer_text: city || ''
        },
        {
          question_id: 'niveau22_housing',
          question_text: 'Besoin de logement (Niveau 22)',
          answer_text: needsHousing === null ? '' : needsHousing ? 'Oui' : 'Non'
        },
        {
          question_id: 'niveau22_level',
          question_text: "Niveau d'études visé (Niveau 22)",
          answer_text: studyLevel || ''
        },
        {
          question_id: 'niveau22_budget',
          question_text: 'Estimation budget (Niveau 22)',
          answer_text: JSON.stringify(estimate || {})
        }
      ]

      await usersAPI.saveExtraInfo(entries)
      await levelUp({ minLevel: 22, xpReward: XP_PER_LEVEL })
      setShowSuccess(true)
    } catch (err) {
      console.error('Niveau22 save error', err)
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
                  {dialogueText}
                </div>
                <div className="absolute -left-2 top-6 w-0 h-0 border-t-8 border-b-8 border-r-8 border-t-transparent border-b-transparent border-r-black" />
              </div>

              {phase === 'intro' && (
                <button
                  type="button"
                  onClick={onIntroNext}
                  className="mt-4 px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200"
                >
                  {introIndex < INTRO_DIALOGUES.length - 1 ? 'Suivant' : 'Continuer'}
                </button>
              )}

              {phase === 'choice' && (
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setPreference('Public')
                      setPhase('confirm')
                    }}
                    className="px-4 py-2 rounded-lg bg-white text-gray-900 border border-gray-200"
                  >
                    Public
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPreference('Privé')
                      setPhase('confirm')
                    }}
                    className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200"
                  >
                    Privé
                  </button>
                </div>
              )}

              {phase === 'confirm' && (
                <button
                  type="button"
                  onClick={() => setPhase('near')}
                  className="mt-4 px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200"
                >
                  Continuer
                </button>
              )}

              {phase === 'near' && (
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setNearHome(true)
                      setPhase('housing')
                    }}
                    className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200"
                  >
                    Oui
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNearHome(false)
                      setPhase('city')
                    }}
                    className="px-4 py-2 rounded-lg bg-white text-gray-900 border border-gray-200"
                  >
                    Non
                  </button>
                </div>
              )}

              {phase === 'housing' && (
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setNeedsHousing(true)
                      setPhase('level')
                    }}
                    className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200"
                  >
                    Oui
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNeedsHousing(false)
                      setPhase('level')
                    }}
                    className="px-4 py-2 rounded-lg bg-white text-gray-900 border border-gray-200"
                  >
                    Non
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-card">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center text-white">💶</div>
            <h2 className="text-xl font-bold">Budgetise tes études</h2>
          </div>

          {phase === 'private' && (
            <>
              <div className="grid gap-4">
                <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl p-4">
                  <h3 className="font-semibold mb-2">Les Pour</h3>
                  <ul className="space-y-2 text-sm">
                    {PRIVATE_PROS.map((item) => (
                      <li key={item}>• {item}</li>
                    ))}
                  </ul>
                </div>
                <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-4">
                  <h3 className="font-semibold mb-2">Les Contre</h3>
                  <ul className="space-y-2 text-sm">
                    {PRIVATE_CONS.map((item) => (
                      <li key={item}>• {item}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPhase('public')}
                className="mt-4 w-full px-4 py-3 rounded-lg bg-[#c1ff72] text-black border border-gray-200"
              >
                Continuer
              </button>
            </>
          )}

          {phase === 'public' && (
            <>
              <div className="grid gap-4">
                <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl p-4">
                  <h3 className="font-semibold mb-2">Les Pour</h3>
                  <ul className="space-y-2 text-sm">
                    {PUBLIC_PROS.map((item) => (
                      <li key={item}>• {item}</li>
                    ))}
                  </ul>
                </div>
                <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-4">
                  <h3 className="font-semibold mb-2">Les Contre</h3>
                  <ul className="space-y-2 text-sm">
                    {PUBLIC_CONS.map((item) => (
                      <li key={item}>• {item}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPhase('choice')}
                className="mt-4 w-full px-4 py-3 rounded-lg bg-[#c1ff72] text-black border border-gray-200"
              >
                Continuer
              </button>
            </>
          )}

          {phase === 'city' && (
            <>
              <label className="block text-sm font-medium text-gray-700 mb-2">Ville d'études</label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Ex: Lyon"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c1ff72]"
              />
              <button
                type="button"
                onClick={() => setPhase('housing')}
                disabled={!city.trim()}
                className="mt-4 w-full px-4 py-3 rounded-lg bg-[#c1ff72] text-black border border-gray-200 disabled:opacity-50"
              >
                Continuer
              </button>
            </>
          )}

          {phase === 'level' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {STUDY_LEVELS.map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => {
                      setStudyLevel(level)
                      setPhase('estimate')
                    }}
                    className="px-4 py-3 rounded-lg border border-gray-200 bg-white hover:bg-[#c1ff72]/30"
                  >
                    {level}
                  </button>
                ))}
              </div>
            </>
          )}

          {phase === 'estimate' && (
            <div className="text-center py-8">
              <div className="inline-block w-8 h-8 border-2 border-black border-t-transparent rounded-full animate-spin" />
              <p className="mt-2 text-text-secondary">Analyse en cours…</p>
            </div>
          )}

          {phase === 'result' && (
            <>
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <div className="text-sm text-text-secondary">Estimation</div>
                <div className="text-2xl font-bold text-gray-900">
                  {estimate?.min != null && estimate?.max != null
                    ? `${estimate.min}€ - ${estimate.max}€`
                    : 'À affiner'}
                </div>
                {estimate?.message && (
                  <p className="mt-2 text-sm text-gray-700">{estimate.message}</p>
                )}
              </div>
              <button
                type="button"
                onClick={onValidate}
                disabled={saving}
                className="mt-4 w-full px-4 py-3 rounded-lg bg-[#c1ff72] text-black border border-gray-200 disabled:opacity-60"
              >
                {saving ? 'Validation…' : 'Continuer'}
              </button>
            </>
          )}

          {phase === 'intro' && (
            <div className="text-text-secondary">Lis le dialogue pour continuer.</div>
          )}

          {phase === 'choice' && (
            <div className="text-text-secondary">Choisis ton orientation dans le dialogue.</div>
          )}

          {phase === 'near' && (
            <div className="text-text-secondary">Réponds dans le dialogue.</div>
          )}

          {phase === 'housing' && (
            <div className="text-text-secondary">Réponds dans le dialogue.</div>
          )}
        </div>
      </div>

      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="relative bg-white border border-gray-200 rounded-2xl p-8 shadow-2xl text-center max-w-md w-11/12">
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 w-10 h-10 bg-[#c1ff72] rounded-full flex items-center justify-center shadow-md animate-bounce">🏆</div>
            <h3 className="text-2xl font-extrabold mb-2">Niveau 22 réussi !</h3>
            <p className="text-text-secondary mb-4">Ton budget est estimé.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button onClick={() => navigate('/app/activites')} className="px-4 py-2 rounded-lg bg-white text-gray-900 border border-gray-200">Retour aux activités</button>
              <button onClick={() => navigate('/app/niveau/23')} className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200">Passer au niveau suivant</button>
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