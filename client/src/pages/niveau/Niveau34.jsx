import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { usersAPI } from '../../lib/api'
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

const QUESTIONS = [
  {
    id: 1,
    text: "Une grosse échéance approche (examen, oral, rendu...). Comment te sens-tu ?",
    options: [
      { id: 'A', text: "Panique à bord, je perds mes moyens" },
      { id: 'B', text: "Un peu de pression, mais ça me motive" },
      { id: 'C', text: "Zen, je prends les choses comme elles viennent" }
    ]
  },
  {
    id: 2,
    text: "Quand tu as trop de choses à faire en même temps...",
    options: [
	  { id: 'A', text: "Je bloque et je procrastine" },
      { id: 'B', text: "Je fais une liste et je priorise" },
      { id: 'C', text: "Je fonce et je fais tout à la dernière minute" }
    ]
  },
  {
    id: 3,
    text: "Après une journée difficile, que fais-tu pour décompresser ?",
    options: [
      { id: 'A', text: "J'y repense en boucle, impossible de dormir" },
      { id: 'B', text: "Sport, musique ou passion pour couper" },
      { id: 'C', text: "Écrans et réseaux sociaux jusqu'à pas d'heure" }
    ]
  },
  {
    id: 4,
    text: "Quand quelqu'un te fait une remarque juste avant un oral...",
    options: [
      { id: 'A', text: "Je rumine et je doute de moi" },
      { id: 'B', text: "Je garde ce qui est utile et je respire" },
      { id: 'C', text: "Je fais comme si de rien n'était, même si ça monte" }
    ]
  },
  {
    id: 5,
    text: "La veille d'une épreuve importante, ton réflexe ressemble plutôt à...",
    options: [
      { id: 'A', text: "Réviser trop tard et dormir peu" },
      { id: 'B', text: "Préparer le nécessaire, puis couper pour dormir" },
      { id: 'C', text: "Repousser la préparation jusqu'au dernier moment" }
    ]
  }
]

const BREATHING_STEPS = [
  { label: 'Inspire', seconds: 4, detail: 'Inspire doucement par le nez.' },
  { label: 'Garde', seconds: 4, detail: "Garde l'air sans forcer." },
  { label: 'Expire', seconds: 6, detail: 'Expire lentement par la bouche.' }
]

const EXERCISES = [
  {
    id: 'breathing',
    title: 'Respiration 4-4-6',
    duration: '2 min',
    type: 'breathing',
    description: 'Pour faire redescendre la pression physique avant un oral, un test ou une décision.'
  },
  {
    id: 'grounding',
    title: 'Ancrage 5-4-3-2-1',
    duration: '3 min',
    type: 'form',
    description: 'Pour sortir de la rumination et revenir dans le présent.',
    prompts: [
      { id: 'see', label: '5 choses que tu vois', placeholder: 'Ex : bureau, fenêtre, cahier...' },
      { id: 'feel', label: '4 sensations physiques', placeholder: 'Ex : pieds au sol, respiration...' },
      { id: 'hear', label: '3 sons que tu entends', placeholder: 'Ex : clavier, voix, silence...' },
      { id: 'small', label: '2 détails minuscules autour de toi', placeholder: 'Ex : couleur, texture...' },
      { id: 'anchor', label: '1 phrase d’ancrage', placeholder: 'Ex : Je peux avancer une étape à la fois.' }
    ]
  },
  {
    id: 'pressure-plan',
    title: 'Plan anti-panique',
    duration: '4 min',
    type: 'form',
    description: 'Pour transformer une inquiétude floue en prochaine action claire.',
    prompts: [
      { id: 'trigger', label: 'Ce qui me stresse', placeholder: 'Ex : ne pas savoir quoi répondre à l’oral' },
      { id: 'control', label: 'Ce que je contrôle vraiment', placeholder: 'Ex : préparer 3 idées, dormir, demander un avis' },
      { id: 'first_step', label: 'Ma première action en 10 minutes', placeholder: 'Ex : écrire le plan de mon introduction' },
      { id: 'support', label: 'La personne ou ressource qui peut m’aider', placeholder: 'Ex : un ami, un prof, Zélia, une fiche' }
    ]
  }
]

const ADVICE_PER_PROFILE = {
  'A': {
    title: "Profil : Sensible au stress",
    text: "Tu as tendance à te laisser envahir par la pression. C'est normal, mais ça se travaille !",
    exerciseId: 'breathing',
    tips: [
      "Pratique la respiration abdominale (cohérence cardiaque) avant les épreuves.",
      "Découpe tes grosses tâches en petites étapes ridicules pour éviter le blocage.",
      "Ne reste pas seul(e) avec tes angoisses, parles-en."
    ]
  },
  'B': {
    title: "Profil : Équilibré & Organisé",
    text: "Tu as de bons réflexes pour gérer la pression. C'est une super force pour ton avenir pro !",
    exerciseId: 'pressure-plan',
    tips: [
      "Continue à planifier, c'est ta force.",
      "Pense à aider ceux qui stressent autour de toi.",
      "N'oublie pas de garder des moments de 'rien' pour recharger les batteries."
    ]
  },
  'C': {
    title: "Profil : À l'instinct / Sous adrénaline",
    text: "Tu fonctionnes à l'énergie, parfois au dernier moment. Ça passe... jusqu'à ce que ça casse ?",
    exerciseId: 'grounding',
    tips: [
      "Attention au manque de sommeil qui augmente le stress de fond.",
      "Essaie d'anticiper un tout petit peu plus pour éviter les nuits blanches.",
      "Trouve des activités de déconnexion sans écrans."
    ]
  }
}

export default function Niveau34() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [profile, setProfile] = useState(null)
  const [avatarUrl, setAvatarUrl] = useState('')

  const [dialogueIdx, setDialogueIdx] = useState(0)
  const [phase, setPhase] = useState('quiz') // intro -> quiz -> result
  const [showSuccess, setShowSuccess] = useState(false)
  const [finishing, setFinishing] = useState(false)
  
  const [currentQIndex, setCurrentQIndex] = useState(0)
  const [answers, setAnswers] = useState({}) // { 1: 'A', 2: 'B' }
  const [resultProfile, setResultProfile] = useState(null)
  const [selectedExerciseId, setSelectedExerciseId] = useState('breathing')
  const [completedExercises, setCompletedExercises] = useState({})
  const [exerciseInputs, setExerciseInputs] = useState({})
  const [breathingRunning, setBreathingRunning] = useState(false)
  const [breathingStep, setBreathingStep] = useState(0)
  const [breathingSecondsLeft, setBreathingSecondsLeft] = useState(BREATHING_STEPS[0].seconds)
  const [breathingCycles, setBreathingCycles] = useState(0)

  const firstName = profile?.first_name || 'toi'
  const completedExerciseIds = useMemo(
    () => Object.keys(completedExercises).filter((id) => completedExercises[id]),
    [completedExercises]
  )
  const selectedExercise = useMemo(
    () => EXERCISES.find((exercise) => exercise.id === selectedExerciseId) || EXERCISES[0],
    [selectedExerciseId]
  )
  const selectedExerciseReady = useMemo(() => {
    if (!selectedExercise) return false
    if (selectedExercise.type === 'breathing') return Boolean(completedExercises[selectedExercise.id]) || breathingCycles >= 3
    return (selectedExercise.prompts || []).every((prompt) => {
      const value = exerciseInputs[`${selectedExercise.id}.${prompt.id}`] || ''
      return value.trim().length >= 2
    })
  }, [breathingCycles, completedExercises, exerciseInputs, selectedExercise])

  const dialogues = useMemo(() => [
    { text: `Le stress fait partie de la vie, ${firstName}. Surtout pendant les études !`, durationMs: 2500 },
    { text: "L'important n'est pas de l'éliminer, mais de savoir le gérer.", durationMs: 2000 },
    { text: "Faisons un petit point rapide sur ta façon de réagir...", durationMs: 2000 },
  ], [firstName])

  const currentDialogue = dialogues[dialogueIdx] || { text: '', durationMs: 1500 }
  const { text: typed, done: typedDone, skip } = useTypewriter(
    phase === 'intro' ? currentDialogue.text : '',
    currentDialogue.durationMs
  )

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { navigate('/login'); return }

        const pRes = await usersAPI.getProfile().catch(() => null)
        if (!mounted) return
        const prof = pRes?.data?.profile || pRes?.data || null
        setProfile(prof)
        setAvatarUrl(buildAvatarFromProfile(prof, user.id))
      } catch (e) {
        console.error('Niveau34 load error', e)
        if (!mounted) return
        setError('Erreur de chargement')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [navigate])

  useEffect(() => {
    if (!breathingRunning || selectedExerciseId !== 'breathing' || phase !== 'result') return undefined

    const timer = setTimeout(() => {
      if (breathingSecondsLeft > 1) {
        setBreathingSecondsLeft(prev => prev - 1)
        return
      }

      const nextStep = (breathingStep + 1) % BREATHING_STEPS.length
      if (nextStep === 0) {
        setBreathingCycles(prev => {
          const nextCycles = prev + 1
          if (nextCycles >= 3) {
            setBreathingRunning(false)
            setCompletedExercises(current => ({ ...current, breathing: true }))
          }
          return nextCycles
        })
      }
      setBreathingStep(nextStep)
      setBreathingSecondsLeft(BREATHING_STEPS[nextStep].seconds)
    }, 1000)

    return () => clearTimeout(timer)
  }, [breathingRunning, breathingSecondsLeft, breathingStep, phase, selectedExerciseId])

  const onDialogueNext = () => {
    if (!typedDone) { skip(); return }
    if (dialogueIdx < dialogues.length - 1) {
      setDialogueIdx(prev => prev + 1)
    } else {
      setPhase('quiz')
    }
  }

  const markExerciseDone = (exerciseId = selectedExerciseId) => {
    setCompletedExercises(prev => ({ ...prev, [exerciseId]: true }))
  }

  const resetBreathing = () => {
    setBreathingRunning(false)
    setBreathingStep(0)
    setBreathingSecondsLeft(BREATHING_STEPS[0].seconds)
    setBreathingCycles(0)
  }

  const updateExerciseInput = (exerciseId, promptId, value) => {
    setExerciseInputs(prev => ({ ...prev, [`${exerciseId}.${promptId}`]: value }))
  }

  const handleOptionClick = (optionId) => {
    const nextAnswers = { ...answers, [QUESTIONS[currentQIndex].id]: optionId }
    setAnswers(nextAnswers)

    if (currentQIndex < QUESTIONS.length - 1) {
      setTimeout(() => setCurrentQIndex(prev => prev + 1), 250)
    } else {
      // Calculate result
      calculateResult(nextAnswers)
    }
  }

  const calculateResult = (finalAnswers) => {
    const counts = { 'A': 0, 'B': 0, 'C': 0 }
    Object.values(finalAnswers).forEach(ans => {
      if (counts[ans] !== undefined) counts[ans]++
    })
    
    // Determine dominant profile
    let max = 0
    let dominant = 'B' // default
    Object.entries(counts).forEach(([key, val]) => {
      if (val > max) {
        max = val
        dominant = key
      }
    })

    setResultProfile(dominant)
    setSelectedExerciseId(ADVICE_PER_PROFILE[dominant]?.exerciseId || 'breathing')
    setPhase('result')
  }

  const finishLevel = async () => {
    if (finishing) return
    setFinishing(true)
    try {
      // Save stress profile to extra info
      const profileData = ADVICE_PER_PROFILE[resultProfile]
      await usersAPI.saveExtraInfo([
        {
          question_id: 'niveau34_stress_profile',
          question_text: 'Gestion du stress',
          answer_text: JSON.stringify({
            profile: resultProfile,
            profileTitle: profileData?.title || '',
            answers,
            completedExercises: completedExerciseIds,
            exerciseInputs,
            completedAt: new Date().toISOString()
          })
        }
      ]).catch(e => console.warn('saveExtraInfo N34 failed', e))
      
      await levelUp({ minLevel: 34, xpReward: XP_PER_LEVEL })
      setShowSuccess(true)
    } catch (e) {
      console.error('Niveau34 levelUp failed', e)
      setError('Impossible de valider le module.')
    } finally {
      setFinishing(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 text-center">
        <div className="inline-block w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
        <p className="mt-2 text-text-secondary">Chargement...</p>
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
        {/* Left: Avatar + Dialogue */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-card">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
            <img src={avatarUrl} alt="Avatar" className="w-28 h-28 sm:w-36 sm:h-36 md:w-44 md:h-44 lg:w-52 lg:h-52 rounded-2xl border border-gray-100 shadow-sm object-contain bg-white mx-auto md:mx-0" />
            <div className="flex-1 w-full">
              <div className="relative bg-black text-white rounded-2xl p-4 md:p-5 w-full">
                <div className="text-base md:text-lg leading-relaxed whitespace-pre-wrap min-h-[3.5rem]">
                  {phase === 'intro' && typed}
                  {phase === 'quiz' && "Réponds spontanément, il n'y a pas de mauvaise réponse !"}
                  {phase === 'result' && (completedExerciseIds.length > 0
                    ? "Bien. Tu as testé un outil concret : garde-le sous la main quand la pression remonte."
                    : "Voici ton profil. Choisis au moins un exercice à tester avant de terminer.")}
                </div>
                <div className="absolute -left-2 top-6 w-0 h-0 border-t-8 border-b-8 border-r-8 border-t-transparent border-b-transparent border-r-black" />
              </div>

              <div className="mt-4 flex flex-col gap-3">
                {phase === 'intro' && (
                  <button onClick={onDialogueNext} className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200 w-full sm:w-auto">
                    {dialogueIdx < dialogues.length - 1 ? 'Suivant' : "C'est parti"}
                  </button>
                )}
                {phase === 'result' && (
                  <>
                    <button onClick={finishLevel} disabled={finishing || completedExerciseIds.length === 0 || showSuccess} className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200 w-full sm:w-auto disabled:opacity-50">
                      {showSuccess ? 'Enregistré' : completedExerciseIds.length === 0 ? 'Teste un exercice pour enregistrer' : 'Enregistrer mes exercices'}
                    </button>
                    {showSuccess && pathname.includes('/outils') && (
                      <p className="text-sm text-green-700">Profil et exercices enregistrés.</p>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Quiz Area */}
        <div className="bg-white border border-gray-200 rounded-2xl p-2 md:p-6 shadow-card">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center text-white font-bold">OK</div>
            <h2 className="text-lg md:text-xl font-bold">Gérer son stress</h2>
          </div>

          {phase === 'intro' && (
            <div className="text-text-secondary text-center py-8">Le questionnaire apparaîtra ici.</div>
          )}

          {phase === 'quiz' && (
            <div className="space-y-6">
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-[#c1ff72] h-2 rounded-full transition-all duration-300"
                  style={{ width: `${((currentQIndex + 1) / QUESTIONS.length) * 100}%` }}
                />
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-6">{QUESTIONS[currentQIndex].text}</h3>
                <div className="flex flex-col gap-3">
                  {QUESTIONS[currentQIndex].options.map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => handleOptionClick(opt.id)}
                      className="text-left p-4 rounded-xl border border-gray-200 hover:border-[#c1ff72] hover:bg-[#f8fff0] transition-all"
                    >
                      {opt.text}
                    </button>
                  ))}
                </div>
              </div>
              <div className="text-center text-sm text-text-secondary">
                Question {currentQIndex + 1} sur {QUESTIONS.length}
              </div>
            </div>
          )}

          {phase === 'result' && resultProfile && (
            <div className="space-y-4 animate-fadeIn">
              <div className="bg-[#f8fff0] border border-[#c1ff72] rounded-xl p-6 text-center">
                <h3 className="text-xl font-bold text-gray-900 mb-2">{ADVICE_PER_PROFILE[resultProfile].title}</h3>
                <p className="text-gray-700 mb-4">{ADVICE_PER_PROFILE[resultProfile].text}</p>
              </div>

              <div>
                <h4 className="font-semibold mb-3">Mes conseils pour toi :</h4>
                <ul className="space-y-3">
                  {ADVICE_PER_PROFILE[resultProfile].tips.map((tip, idx) => (
                    <li key={idx} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                      <span className="text-[#c1ff72] font-bold text-lg">•</span>
                      <span className="text-sm text-gray-800">{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl border border-gray-200 p-4">
                <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h4 className="font-semibold">Exercices pour gérer ton stress</h4>
                    <p className="text-sm text-gray-500">Teste au moins un exercice maintenant, puis garde les autres pour plus tard.</p>
                  </div>
                  <span className="w-fit rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
                    {completedExerciseIds.length}/{EXERCISES.length} fait{completedExerciseIds.length > 1 ? 's' : ''}
                  </span>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  {EXERCISES.map((exercise) => {
                    const isSelected = selectedExerciseId === exercise.id
                    const isDone = Boolean(completedExercises[exercise.id])
                    return (
                      <button
                        key={exercise.id}
                        type="button"
                        onClick={() => setSelectedExerciseId(exercise.id)}
                        className={`text-left rounded-xl border p-3 transition-all ${isSelected ? 'border-black bg-gray-50' : 'border-gray-200 hover:border-[#c1ff72] hover:bg-[#f8fff0]'}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <strong className="text-sm text-gray-900">{exercise.title}</strong>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${isDone ? 'bg-[#c1ff72] text-black' : 'bg-white text-gray-500 border border-gray-200'}`}>
                            {isDone ? 'Fait' : exercise.duration}
                          </span>
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-gray-500">{exercise.description}</p>
                      </button>
                    )
                  })}
                </div>

                <div className="mt-4 rounded-xl bg-gray-50 p-4">
                  <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <h5 className="font-semibold text-gray-900">{selectedExercise.title}</h5>
                    {completedExercises[selectedExercise.id] && <span className="text-xs font-semibold text-green-700">Exercice validé</span>}
                  </div>

                  {selectedExercise.type === 'breathing' && (
                    <div className="grid gap-4 md:grid-cols-[auto_1fr] md:items-center">
                      <div className="flex flex-col items-center gap-2">
                        <div className="flex h-32 w-32 flex-col items-center justify-center rounded-full border-4 border-[#c1ff72] bg-white text-center shadow-sm">
                          <span className="text-4xl font-black text-gray-900">{breathingSecondsLeft}</span>
                          <span className="text-xs font-semibold uppercase text-gray-500">{BREATHING_STEPS[breathingStep].label}</span>
                        </div>
                        <p className="text-center text-sm text-gray-600">{BREATHING_STEPS[breathingStep].detail}</p>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <div className="mb-1 flex justify-between text-sm text-gray-600">
                            <span>Cycles terminés</span>
                            <span>{Math.min(breathingCycles, 3)}/3</span>
                          </div>
                          <div className="h-2 rounded-full bg-gray-200">
                            <div className="h-2 rounded-full bg-[#c1ff72] transition-all" style={{ width: `${Math.min(100, (breathingCycles / 3) * 100)}%` }} />
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => setBreathingRunning(prev => !prev)} disabled={completedExercises.breathing} className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                            {breathingRunning ? 'Pause' : 'Démarrer'}
                          </button>
                          <button type="button" onClick={resetBreathing} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-800">
                            Recommencer
                          </button>
                          <button type="button" onClick={() => markExerciseDone('breathing')} disabled={!selectedExerciseReady} className="rounded-lg bg-[#c1ff72] px-4 py-2 text-sm font-semibold text-black disabled:opacity-50">
                            Valider
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedExercise.type === 'form' && (
                    <div className="space-y-3">
                      {selectedExercise.prompts.map((prompt) => (
                        <label key={prompt.id} className="block">
                          <span className="mb-1 block text-sm font-semibold text-gray-800">{prompt.label}</span>
                          <textarea
                            className="min-h-[76px] w-full rounded-lg border border-gray-200 bg-white p-3 text-sm focus:border-black focus:outline-none"
                            placeholder={prompt.placeholder}
                            value={exerciseInputs[`${selectedExercise.id}.${prompt.id}`] || ''}
                            onChange={(event) => updateExerciseInput(selectedExercise.id, prompt.id, event.target.value)}
                          />
                        </label>
                      ))}
                      <button type="button" onClick={() => markExerciseDone(selectedExercise.id)} disabled={!selectedExerciseReady} className="rounded-lg bg-[#c1ff72] px-4 py-2 text-sm font-semibold text-black disabled:opacity-50">
                        {completedExercises[selectedExercise.id] ? 'Exercice validé' : 'Valider cet exercice'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Success Popup */}
      {showSuccess && !pathname.includes('/outils') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="relative bg-white border border-gray-200 rounded-2xl p-8 shadow-2xl text-center max-w-md w-11/12">
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 w-10 h-10 bg-[#c1ff72] rounded-full flex items-center justify-center shadow-md animate-bounce font-bold">OK</div>
            <h3 className="text-2xl font-extrabold mb-2">Exercices enregistrés !</h3>
            <p className="text-text-secondary mb-4">Prendre soin de son mental, c'est aussi important que les notes.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button onClick={() => navigate('/app/activites')} className="px-4 py-2 rounded-lg bg-white text-gray-900 border border-gray-200">Retour aux activités</button>
              <button onClick={() => navigate('/app/niveau/35')} className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200">Continuer</button>
            </div>
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