import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import supabase from '../../lib/supabase'
import apiClient, { usersAPI } from '../../lib/api'
import { buildAvatarFromProfile } from '../../lib/avatar'
import { XP_PER_LEVEL, levelUp } from '../../lib/progression'
import { FaEuroSign, FaHandHoldingDollar, FaTrophy } from 'react-icons/fa6'

const INTRO_DIALOGUES = [
  {
    text: "Dit m'en un peu plus sur tes projections futures, on va essayer de budgÃƒÂ©tiser tes futurs ÃƒÂ©tudes.",
    durationMs: 2200
  },
  {
    text: "Je vais te donner quelques pistes pour choisir si tu prÃƒÂ©fÃƒÂ©rerais le privÃƒÂ©.",
    durationMs: 2000
  }
]

const PRIVATE_PROS = [
  'RÃƒÂ©seau : AccÃƒÂ¨s puissant aux entreprises et aux anciens ÃƒÂ©lÃƒÂ¨ves.',
  "CarriÃƒÂ¨re : TrÃƒÂ¨s axÃƒÂ© sur l'emploi, les stages et l'alternance.",
  'Suivi : Petites classes, coaching et accompagnement proche.',
  'Cadre : Campus modernes et vie associative riche.'
]

const PRIVATE_CONS = [
  'Prix : TrÃƒÂ¨s cher (de 5 000Ã¢â€šÂ¬ ÃƒÂ  15 000Ã¢â€šÂ¬+ par an).',
  'PiÃƒÂ¨ges : QualitÃƒÂ© trÃƒÂ¨s variable (attention aux diplÃƒÂ´mes non reconnus).',
  'Niveau : Parfois moins sÃƒÂ©lectif acadÃƒÂ©miquement ("payer pour avoir").'
]

const PUBLIC_PROS = [
  'CoÃƒÂ»t : Quasi gratuit (frais d\'inscription faibles).',
  "DiplÃƒÂ´me : Valeur sÃƒÂ»re, reconnue officiellement par l'Ãƒâ€°tat.",
  'IndÃƒÂ©pendance : Apprend la dÃƒÂ©brouillardise et l\'autonomie.',
  'Niveau : Excellence thÃƒÂ©orique et recherche.'
]

const PUBLIC_CONS = [
  "Encadrement : TrÃƒÂ¨s faible, vous ÃƒÂªtes livrÃƒÂ© ÃƒÂ  vous-mÃƒÂªme.",
  'Pratique : Souvent trop thÃƒÂ©orique, moins connectÃƒÂ© au marchÃƒÂ©.',
  'Moyens : Locaux parfois vÃƒÂ©tustes, amphis bondÃƒÂ©s.'
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
    if (phase === 'private') return "Voici les avantages et inconvÃƒÂ©nients du privÃƒÂ©."
    if (phase === 'public') return "Passons maintenant au public."
    if (phase === 'choice') return "Alors est-ce que tu prÃƒÂ©fÃƒÂ¨res t'orienter dans le public ou plutÃƒÂ´t dans le privÃƒÂ© ?"
    if (phase === 'confirm') return `Ok trÃƒÂ¨s bien ${firstName}, tu fais le bon choix.`
    if (phase === 'near') return "Tu penses faire tes ÃƒÂ©tudes proche de chez toi ?"
    if (phase === 'city') return "Dans quelle ville souhaiterais-tu faire tes ÃƒÂ©tudes ?"
    if (phase === 'housing') return "Alors tu penses prendre un logement pour cela ? Cela va m'aider ÃƒÂ  te donner une fourchette de prix."
    if (phase === 'level') return "Tu souhaites aller jusqu'ÃƒÂ  quel niveau d'ÃƒÂ©tudes ?"
    if (phase === 'estimate') return "Ok merci, je vais te donner une estimation sur les prochaines annÃƒÂ©es, patiente 10s."
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
        `PrÃƒÂ©fÃƒÂ©rence: ${preference || 'non renseignÃƒÂ©'}`,
        `Proche de chez soi: ${nearHome === null ? 'non renseignÃƒÂ©' : nearHome ? 'oui' : 'non'}`,
        `Ville: ${city ? city : 'non renseignÃƒÂ©e'}`,
        `Logement: ${needsHousing === null ? 'non renseignÃƒÂ©' : needsHousing ? 'oui' : 'non'}`,
        `Niveau d'ÃƒÂ©tudes: ${studyLevel || 'non renseignÃƒÂ©'}`
      ].join('\n')

      const message = `Tu es un conseiller d'orientation. Voici le contexte de l'ÃƒÂ©lÃƒÂ¨ve:\n${context}\n\nDonne une estimation de budget total pour les prochaines annÃƒÂ©es d'ÃƒÂ©tudes en France selon ces informations.\nRÃƒÂ©ponds en JSON strict avec min, max et un court message: {"min": 0, "max": 0, "message": "texte court"}.\nRÃƒÂ©ponds UNIQUEMENT avec le JSON.`

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
          question_text: 'PrÃƒÂ©fÃƒÂ©rence public/privÃƒÂ© (Niveau 22)',
          answer_text: preference || ''
        },
        {
          question_id: 'niveau22_near_home',
          question_text: 'Ãƒâ€°tudes proches de chez soi (Niveau 22)',
          answer_text: nearHome === null ? '' : nearHome ? 'Oui' : 'Non'
        },
        {
          question_id: 'niveau22_city',
          question_text: 'Ville d\'ÃƒÂ©tudes (Niveau 22)',
          answer_text: city || ''
        },
        {
          question_id: 'niveau22_housing',
          question_text: 'Besoin de logement (Niveau 22)',
          answer_text: needsHousing === null ? '' : needsHousing ? 'Oui' : 'Non'
        },
        {
          question_id: 'niveau22_level',
          question_text: "Niveau d'ÃƒÂ©tudes visÃƒÂ© (Niveau 22)",
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
        <p className="mt-2 text-text-secondary">ChargementÃ¢â‚¬Â¦</p>
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
                      setPreference('PrivÃƒÂ©')
                      setPhase('confirm')
                    }}
                    className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200"
                  >
                    PrivÃƒÂ©
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
            <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center text-white"><FaEuroSign className="w-5 h-5" /></div>
            <h2 className="text-xl font-bold">Budgetise tes ÃƒÂ©tudes</h2>
          </div>

          {phase === 'private' && (
            <>
              <div className="grid gap-4">
                <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl p-4">
                  <h3 className="font-semibold mb-2">Les Pour</h3>
                  <ul className="space-y-2 text-sm">
                    {PRIVATE_PROS.map((item) => (
                      <li key={item}>Ã¢â‚¬Â¢ {item}</li>
                    ))}
                  </ul>
                </div>
                <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-4">
                  <h3 className="font-semibold mb-2">Les Contre</h3>
                  <ul className="space-y-2 text-sm">
                    {PRIVATE_CONS.map((item) => (
                      <li key={item}>Ã¢â‚¬Â¢ {item}</li>
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
                      <li key={item}>Ã¢â‚¬Â¢ {item}</li>
                    ))}
                  </ul>
                </div>
                <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-4">
                  <h3 className="font-semibold mb-2">Les Contre</h3>
                  <ul className="space-y-2 text-sm">
                    {PUBLIC_CONS.map((item) => (
                      <li key={item}>Ã¢â‚¬Â¢ {item}</li>
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
              <label className="block text-sm font-medium text-gray-700 mb-2">Ville d'ÃƒÂ©tudes</label>
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
              <p className="mt-2 text-text-secondary">Analyse en coursÃ¢â‚¬Â¦</p>
            </div>
          )}

          {phase === 'result' && (
            <>
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <div className="text-sm text-text-secondary">Estimation</div>
                <div className="text-2xl font-bold text-gray-900">
                  {estimate?.min != null && estimate?.max != null
                    ? `${estimate.min}Ã¢â€šÂ¬ - ${estimate.max}Ã¢â€šÂ¬`
                    : 'Ãƒâ‚¬ affiner'}
                </div>
                {estimate?.message && (
                  <p className="mt-2 text-sm text-gray-700">{estimate.message}</p>
                )}
              </div>

              {/* Encart aides financiÃƒÂ¨res */}
              <div className="mt-4 bg-blue-50 border border-blue-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <FaHandHoldingDollar className="w-5 h-5 text-blue-600" />
                  <h3 className="font-semibold text-blue-900">Aides disponibles pour financer tes ÃƒÂ©tudes</h3>
                </div>
                <ul className="space-y-2 text-sm text-blue-800">
                  <li className="flex items-start gap-2">
                    <span className="font-bold mt-0.5">Ã¢â‚¬Â¢</span>
                    <div><span className="font-semibold">Bourse CROUS</span> Ã¢â‚¬â€ Aide financiÃƒÂ¨re selon tes revenus familiaux. Fais ta demande via le DSE (Dossier Social Ãƒâ€°tudiant) entre janvier et mai.</div>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold mt-0.5">Ã¢â‚¬Â¢</span>
                    <div><span className="font-semibold">PrÃƒÂªt ÃƒÂ©tudiant garanti par l'Ãƒâ€°tat</span> Ã¢â‚¬â€ Jusqu'ÃƒÂ  20 000 Ã¢â€šÂ¬ sans caution parentale, remboursable aprÃƒÂ¨s les ÃƒÂ©tudes.</div>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold mt-0.5">Ã¢â‚¬Â¢</span>
                    <div><span className="font-semibold">APL / ALS (CAF)</span> Ã¢â‚¬â€ Aide au logement si tu prends un appartement. Fais ta demande sur caf.fr dÃƒÂ¨s ton emmÃƒÂ©nagement.</div>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold mt-0.5">Ã¢â‚¬Â¢</span>
                    <div><span className="font-semibold">Alternance / Apprentissage</span> Ã¢â‚¬â€ Tes ÃƒÂ©tudes sont financÃƒÂ©es par l'entreprise et tu es rÃƒÂ©munÃƒÂ©rÃƒÂ©(e) chaque mois.</div>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold mt-0.5">Ã¢â‚¬Â¢</span>
                    <div><span className="font-semibold">Aides rÃƒÂ©gionales</span> Ã¢â‚¬â€ Chaque rÃƒÂ©gion propose des aides spÃƒÂ©cifiques (transport, ÃƒÂ©quipement, mobilitÃƒÂ©). Renseigne-toi sur le site de ta rÃƒÂ©gion.</div>
                  </li>
                </ul>
                <p className="mt-3 text-xs text-blue-600">Pense ÃƒÂ  faire tes demandes le plus tÃƒÂ´t possible, les dÃƒÂ©lais sont souvent serrÃƒÂ©s !</p>
              </div>

              <button
                type="button"
                onClick={onValidate}
                disabled={saving}
                className="mt-4 w-full px-4 py-3 rounded-lg bg-[#c1ff72] text-black border border-gray-200 disabled:opacity-60"
              >
                {saving ? 'ValidationÃ¢â‚¬Â¦' : 'Continuer'}
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
            <div className="text-text-secondary">RÃƒÂ©ponds dans le dialogue.</div>
          )}

          {phase === 'housing' && (
            <div className="text-text-secondary">RÃƒÂ©ponds dans le dialogue.</div>
          )}
        </div>
      </div>

      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="relative bg-white border border-gray-200 rounded-2xl p-8 shadow-2xl text-center max-w-md w-11/12">
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 w-10 h-10 bg-[#c1ff72] rounded-full flex items-center justify-center shadow-md animate-bounce"><FaTrophy className="w-5 h-5 text-yellow-600" /></div>
            <h3 className="text-2xl font-extrabold mb-2">Niveau 22 rÃƒÂ©ussi !</h3>
            <p className="text-text-secondary mb-4">Ton budget est estimÃƒÂ©.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button onClick={() => navigate('/app/activites')} className="px-4 py-2 rounded-lg bg-white text-gray-900 border border-gray-200">Retour aux activitÃƒÂ©s</button>
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