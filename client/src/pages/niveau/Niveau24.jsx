import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import supabase from '../../lib/supabase'
import { usersAPI } from '../../lib/api'
import { buildAvatarFromProfile } from '../../lib/avatar'
import { XP_PER_LEVEL, levelUp } from '../../lib/progression'

// Quiz data with real statistics
const QUIZ_DATA = [
  {
    id: 1,
    stat: 30,
    color: '#ef4444', // red
    source: 'superfutur.fr/reorientation-etudiant',
    question: 'Que représente ce pourcentage selon toi ?',
    options: [
      { id: 'A', text: "Le pourcentage de personnes qui apprécient leurs études" },
      { id: 'B', text: "Le pourcentage de personnes qui abandonnent leurs études la 1ère année" },
      { id: 'C', text: "Le pourcentage de personnes qui n'aiment pas Zélia" }
    ],
    correct: 'B',
    explanation: "30% des étudiants ne vont pas au-delà de leur 1ère année d'études supérieures."
  },
  {
    id: 2,
    stat: 40,
    color: '#f59e0b', // orange
    source: 'onisep.fr',
    question: 'Et celui-ci, que représente-t-il ?',
    options: [
      { id: 'A', text: "Le pourcentage d'étudiants qui se réorientent après le bac" },
      { id: 'B', text: "Le pourcentage d'étudiants qui partent à l'étranger" },
      { id: 'C', text: "Le pourcentage d'étudiants satisfaits de leur orientation" }
    ],
    correct: 'A',
    explanation: "Environ 40% des étudiants changent de filière ou se réorientent dans les 2 premières années après le bac."
  },
  {
    id: 3,
    stat: 65,
    color: '#22c55e', // green
    source: 'cereq.fr',
    question: 'Dernier graphique ! Que représente ce pourcentage ?',
    options: [
      { id: 'A', text: "Le pourcentage de jeunes qui trouvent un emploi stable 3 ans après leur diplôme" },
      { id: 'B', text: "Le pourcentage d'étudiants qui font des études longues" },
      { id: 'C', text: "Le pourcentage de bacheliers qui poursuivent des études supérieures" }
    ],
    correct: 'C',
    explanation: "Environ 65% des bacheliers poursuivent des études dans l'enseignement supérieur."
  }
]

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

// Pie Chart component
function PieChart({ percentage, color }) {
  const radius = 80
  const circumference = 2 * Math.PI * radius
  const strokeDasharray = `${(percentage / 100) * circumference} ${circumference}`

  return (
    <div className="flex justify-center">
      <svg width="200" height="200" viewBox="0 0 200 200">
        {/* Background circle */}
        <circle
          cx="100"
          cy="100"
          r={radius}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="30"
        />
        {/* Percentage arc */}
        <circle
          cx="100"
          cy="100"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="30"
          strokeDasharray={strokeDasharray}
          strokeLinecap="round"
          transform="rotate(-90 100 100)"
          className="transition-all duration-1000"
        />
        {/* Center text */}
        <text
          x="100"
          y="100"
          textAnchor="middle"
          dominantBaseline="middle"
          className="text-3xl font-bold"
          fill="#1f2937"
        >
          {percentage}%
        </text>
      </svg>
    </div>
  )
}

const DIALOGUE = [
  { text: "Je vais te montrer des graphiques concernant l'orientation.", durationMs: 1800 },
  { text: "Je vais te laisser deviner ce que c'est", durationMs: 1500 },
  { text: "Let's go {first_name}", durationMs: 1000 }
]

export default function Niveau24() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [profile, setProfile] = useState(null)
  const [avatarUrl, setAvatarUrl] = useState('')
  const [showSuccess, setShowSuccess] = useState(false)
  const [finishing, setFinishing] = useState(false)

  // Dialogue phase
  const [dialogueStep, setDialogueStep] = useState(0)
  const dialogueFinished = dialogueStep >= DIALOGUE.length

  // Quiz phase
  const [currentQuiz, setCurrentQuiz] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState(null)
  const [showResult, setShowResult] = useState(false)
  const [answers, setAnswers] = useState([]) // Store all answers

  const firstName = profile?.first_name || 'toi'

  // Get current dialogue text
  const currentDialogue = useMemo(() => {
    if (dialogueStep >= DIALOGUE.length) return null
    const d = DIALOGUE[dialogueStep]
    return {
      text: d.text.replace('{first_name}', firstName),
      durationMs: d.durationMs
    }
  }, [dialogueStep, firstName])

  const { text: typed, done: typedDone, skip } = useTypewriter(
    currentDialogue?.text || '',
    currentDialogue?.durationMs || 1200
  )

  // Load user data
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
        console.error('Niveau24 load error', e)
        if (!mounted) return
        setError('Erreur de chargement')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [navigate])

  // Handle dialogue progression
  const onDialogueNext = () => {
    if (!typedDone) {
      skip()
      return
    }
    setDialogueStep((prev) => prev + 1)
  }

  // Handle answer selection
  const onSelectAnswer = (answerId) => {
    if (showResult) return
    setSelectedAnswer(answerId)
  }

  // Validate answer
  const onValidateAnswer = () => {
    if (!selectedAnswer) return
    setShowResult(true)
    setAnswers((prev) => [...prev, {
      quizId: QUIZ_DATA[currentQuiz].id,
      selected: selectedAnswer,
      correct: selectedAnswer === QUIZ_DATA[currentQuiz].correct
    }])
  }

  // Go to next quiz or finish
  const onNext = async () => {
    if (currentQuiz < QUIZ_DATA.length - 1) {
      setCurrentQuiz((prev) => prev + 1)
      setSelectedAnswer(null)
      setShowResult(false)
    } else {
      // Finish level
      if (finishing) return
      setFinishing(true)
      try {
        // Sauvegarder les résultats du quiz
        const correctCount = answers.filter(a => a.correct).length + (selectedAnswer === currentQuizData.correct ? 1 : 0)
        await usersAPI.saveExtraInfo([
          {
            question_id: 'niveau24_quiz_score',
            question_text: 'Score quiz orientation (Niveau 24)',
            answer_text: `${correctCount}/${QUIZ_DATA.length} bonnes réponses`
          },
          {
            question_id: 'niveau24_quiz_completed',
            question_text: 'Quiz statistiques complété (Niveau 24)',
            answer_text: 'Oui'
          }
        ])
        await levelUp({ minLevel: 24, xpReward: XP_PER_LEVEL })
        setShowSuccess(true)
      } catch (e) {
        console.error('Niveau24 levelUp failed', e)
        setError('Impossible de valider le niveau pour le moment.')
      } finally {
        setFinishing(false)
      }
    }
  }

  const currentQuizData = QUIZ_DATA[currentQuiz]
  const isCorrect = selectedAnswer === currentQuizData?.correct

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
        {/* Left: Avatar & Dialogue */}
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
                  {!dialogueFinished ? typed : (
                    showResult ? (
                      isCorrect ? '🎉 Bonne réponse !' : `❌ Mauvaise réponse, c'était la réponse ${currentQuizData.correct}`
                    ) : currentQuizData.question
                  )}
                </div>
                <div className="absolute -left-2 top-6 w-0 h-0 border-t-8 border-b-8 border-r-8 border-t-transparent border-b-transparent border-r-black" />
              </div>

              {!dialogueFinished && (
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={onDialogueNext}
                    className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200"
                  >
                    {dialogueStep < DIALOGUE.length - 1 ? 'Suivant' : 'Commencer'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Quiz Card */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-card">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center text-white">📊</div>
            <h2 className="text-xl font-bold">Quiz Orientation</h2>
            {dialogueFinished && (
              <span className="ml-auto text-sm text-text-secondary">
                {currentQuiz + 1} / {QUIZ_DATA.length}
              </span>
            )}
          </div>

          {!dialogueFinished ? (
            <div className="text-text-secondary text-center py-8">
              Réponds au dialogue pour commencer le quiz.
            </div>
          ) : (
            <div className="space-y-6">
              {/* Pie Chart */}
              <PieChart percentage={currentQuizData.stat} color={currentQuizData.color} />

              {/* Source */}
              <div className="text-center text-xs text-text-secondary">
                Source : {currentQuizData.source}
              </div>

              {/* Answer Options */}
              <div className="space-y-3">
                {currentQuizData.options.map((option) => {
                  const isSelected = selectedAnswer === option.id
                  const isCorrectOption = option.id === currentQuizData.correct

                  let optionClasses = 'w-full p-4 rounded-xl border-2 text-left transition-all cursor-pointer '
                  if (showResult) {
                    if (isCorrectOption) {
                      optionClasses += 'border-green-500 bg-green-50'
                    } else if (isSelected && !isCorrectOption) {
                      optionClasses += 'border-red-500 bg-red-50'
                    } else {
                      optionClasses += 'border-gray-200 bg-gray-50 opacity-50'
                    }
                  } else {
                    if (isSelected) {
                      optionClasses += 'border-black bg-gray-100'
                    } else {
                      optionClasses += 'border-gray-300 bg-white hover:border-black hover:bg-gray-50 shadow-sm'
                    }
                  }

                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => onSelectAnswer(option.id)}
                      disabled={showResult}
                      className={optionClasses}
                    >
                      <div className="flex items-start gap-3">
                        <span className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center font-bold text-sm shrink-0">
                          {option.id}
                        </span>
                        <span className="flex-1 text-sm md:text-base">{option.text}</span>
                        {showResult && isCorrectOption && (
                          <span className="text-green-600 text-xl">✓</span>
                        )}
                        {showResult && isSelected && !isCorrectOption && (
                          <span className="text-red-600 text-xl">✗</span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Explanation after answer */}
              {showResult && (
                <div className={`p-4 rounded-xl ${isCorrect ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
                  <p className="text-sm">{currentQuizData.explanation}</p>
                </div>
              )}

              {/* Action buttons */}
              <div className="pt-2">
                {!showResult && (
                  <button
                    type="button"
                    onClick={onValidateAnswer}
                    disabled={!selectedAnswer}
                    className="w-full px-4 py-3 rounded-lg bg-[#c1ff72] text-black border border-gray-200 font-medium disabled:opacity-50"
                  >
                    Valider ma réponse
                  </button>
                )}

                {showResult && (
                  <button
                    type="button"
                    onClick={onNext}
                    disabled={finishing}
                    className="w-full px-4 py-3 rounded-lg bg-[#c1ff72] text-black border border-gray-200 font-medium disabled:opacity-50"
                  >
                    {currentQuiz < QUIZ_DATA.length - 1 ? 'Question suivante' : 'Terminer'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Success Popup */}
      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="relative bg-white border border-gray-200 rounded-2xl p-8 shadow-2xl text-center max-w-md w-11/12">
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 w-10 h-10 bg-[#c1ff72] rounded-full flex items-center justify-center shadow-md animate-bounce">🏆</div>
            <h3 className="text-2xl font-extrabold mb-2">Niveau 24 réussi !</h3>
            <p className="text-text-secondary mb-4">
              Tu as répondu à {answers.filter(a => a.correct).length}/{QUIZ_DATA.length} questions correctement.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button onClick={() => navigate('/app/activites')} className="px-4 py-2 rounded-lg bg-white text-gray-900 border border-gray-200">Retour aux activités</button>
              <button onClick={() => navigate('/app/niveau/25')} className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200">Passer au niveau suivant</button>
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