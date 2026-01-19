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

function sanitizeLetter(raw) {
  if (!raw) return ''
  return String(raw)
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\*\*/g, '')
    .trim()
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
  add('Téléphone', profile.phone_number || profile.numero_telephone || profile.numeroTelephone)
  return rows.join('\n')
}

export default function Niveau14() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [profile, setProfile] = useState(null)
  const [avatarUrl, setAvatarUrl] = useState('')
  const [jobFromResults, setJobFromResults] = useState('')
  const [userResponses, setUserResponses] = useState([])
  const [extraInfos, setExtraInfos] = useState([])

  const [step, setStep] = useState(0)
  const [choice, setChoice] = useState(null) // 'yes' | 'no'
  const [jobInput, setJobInput] = useState('')

  const [letter, setLetter] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState('')
  const [showSuccess, setShowSuccess] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [showFinalMessage, setShowFinalMessage] = useState(false)

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

        // Fetch user_responses & informations_complementaires for context
        try {
          const [{ data: responses }, { data: extra }] = await Promise.all([
            supabase
              .from('user_responses')
              .select('questionnaire_type, question_id, response, created_at')
              .eq('user_id', user.id)
              .order('created_at', { ascending: true }),
            supabase
              .from('informations_complementaires')
              .select('question_id, question_text, answer_text, created_at')
              .eq('user_id', user.id)
              .order('created_at', { ascending: true })
          ])
          if (!mounted) return
          setUserResponses(Array.isArray(responses) ? responses : [])
          setExtraInfos(Array.isArray(extra) ? extra : [])
        } catch (e) {
          console.warn('Niveau14 context fetch error', e)
        }
      } catch (e) {
        console.error('Niveau14 load error', e)
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

  const suggestedJob = useMemo(() => {
    const pref = (profile?.home_preference || '').trim()
    if (pref && pref.toLowerCase() !== 'questionnaire') return pref
    return (jobFromResults || '').trim()
  }, [profile, jobFromResults])

  const dialogue = useMemo(() => {
    const line1 = `On va te générer une lettre de motivation${firstName ? ` ${firstName}` : ''} !`
    return ([
      { type: 'text', text: line1, durationMs: 1800 },
      { type: 'text', text: "Avec ce qu'on s'est dit ensemble ça va m'aider pour te générer ta lettre de motivation parfaite", durationMs: 2600 },
      { type: 'question', text: `Est-ce qu'on fait une lettre de motivation pour ce métier : ${suggestedJob || 'ce métier'} ?`, durationMs: 2000 }
    ])
  }, [firstName, suggestedJob])

  const finalMessage = "Tu peux désormais y accéder gratuitement dans le menu, c'est un outil dédié pour tes lettres de motivations futurs!"

  const current = dialogue[Math.min(step, dialogue.length - 1)]
  const activeText = showFinalMessage ? finalMessage : (current?.text || '')
  const activeDuration = showFinalMessage ? 3000 : (current?.durationMs || 1500)
  const { text: typed, done: typedDone, skip } = useTypewriter(activeText, activeDuration)

  const isQuestionStep = current?.type === 'question' && !showFinalMessage

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

  const buildContext = () => {
    const profileBlock = formatProfileContext(profile)
    const responsesBlock = (userResponses || [])
      .map((r) => `- [${r.questionnaire_type || 'questionnaire'} #${r.question_id}] ${r.response || '—'}`)
      .join('\n')
    const extraBlock = (extraInfos || [])
      .map((r) => `- ${r.question_text || r.question_id}: ${r.answer_text || '—'}`)
      .join('\n')
    return [
      profileBlock ? `Profil:\n${profileBlock}` : 'Profil: (inconnu)',
      responsesBlock ? `\nRéponses utilisateur:\n${responsesBlock}` : '\nRéponses utilisateur: (aucune)',
      extraBlock ? `\nInformations complémentaires:\n${extraBlock}` : '\nInformations complémentaires: (aucune)'
    ].join('\n')
  }

  const generateLetter = async () => {
    const jobTitle = effectiveJob
    if (!jobTitle) return
    setGenerating(true)
    setGenerateError('')
    setLetter('')
    try {
      const context = buildContext()
      const message =
        `Rédige uniquement une lettre de motivation en français pour le métier suivant : "${jobTitle}".\n` +
        `Contraintes STRICTES :\n` +
        `- Réponds uniquement par la lettre (aucune explication, aucune question, aucun commentaire).\n` +
        `- Commence par une formule d'appel (ex: "Madame, Monsieur,") et termine par une formule de politesse.\n` +
        `- Ton professionnel, sincère et adapté à un(e) étudiant(e).\n` +
        `- 1 page maximum.\n` +
        `- Utilise le contexte fourni, n'invente pas d'éléments manquants.\n` +
        `- Ne mets pas de titre ni de mise en forme Markdown.\n\n` +
        `Contexte utilisateur :\n${context}`

      const resp = await apiClient.post('/chat/ai', {
        mode: 'advisor',
        advisorType: 'lettre-motivation',
        message,
        history: []
      })

      const reply = sanitizeLetter(resp?.data?.reply || '')
      if (!reply) throw new Error('Réponse IA vide')
      setLetter(reply)
      setShowFinalMessage(true)
    } catch (e) {
      console.error('Niveau14 letter error', e)
      const msg = e?.response?.data?.error || 'Impossible de générer la lettre. Réessaie.'
      setGenerateError(msg)
    } finally {
      setGenerating(false)
    }
  }

  const copyToClipboard = () => {
    if (!letter) return
    navigator.clipboard?.writeText(letter)
  }

  const finishLevel = async () => {
    if (finishing) return
    setFinishing(true)
    try {
      await levelUp({ minLevel: 14, xpReward: XP_PER_LEVEL })
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

              {!isQuestionStep && !showFinalMessage && (
                <button
                  type="button"
                  onClick={onNext}
                  className="mt-4 px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200"
                >
                  {step < dialogue.length - 1 ? (typedDone ? 'Suivant' : 'Passer') : 'Suivant'}
                </button>
              )}

              {isQuestionStep && typedDone && !showFinalMessage && (
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

              {showFinalMessage && typedDone && (
                <button
                  type="button"
                  onClick={finishLevel}
                  disabled={finishing}
                  className="mt-4 px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200 disabled:opacity-50"
                >
                  {finishing ? 'Validation...' : 'Valider le niveau'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right: Letter Generation */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-card">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center text-white">📝</div>
            <h2 className="text-xl font-bold">Lettre de motivation</h2>
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
              onClick={generateLetter}
              disabled={generating || !effectiveJob}
              className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200 disabled:opacity-50"
            >
              {generating ? 'Génération...' : 'Générer la lettre'}
            </button>
            {letter && (
              <button
                type="button"
                onClick={copyToClipboard}
                className="px-4 py-2 rounded-lg bg-white text-gray-900 border border-gray-300"
              >
                Copier
              </button>
            )}
          </div>

          {generateError && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-800 p-3 rounded-lg">{generateError}</div>
          )}

          {letter ? (
            <div className="bg-gray-50 border border-gray-200 p-4 rounded-lg whitespace-pre-wrap font-mono text-sm">
              {letter}
            </div>
          ) : (
            <div className="text-text-secondary text-sm">
              La lettre apparaîtra ici après génération.
            </div>
          )}
        </div>
      </div>

      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="relative bg-white border border-gray-200 rounded-2xl p-8 shadow-2xl text-center max-w-md w-11/12">
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 w-10 h-10 bg-[#c1ff72] rounded-full flex items-center justify-center shadow-md animate-bounce">🏆</div>
            <h3 className="text-2xl font-extrabold mb-2">Niveau 14 réussi !</h3>
            <p className="text-text-secondary mb-4">Ta lettre de motivation est prête.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button onClick={() => navigate('/app/activites')} className="px-4 py-2 rounded-lg bg-white text-gray-900 border border-gray-200">Retour aux activités</button>
              <button onClick={() => navigate('/app/niveau/15')} className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200">Passer au niveau suivant</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}