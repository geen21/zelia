import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import supabase from '../../lib/supabase'
import { usersAPI } from '../../lib/api'
import { XP_PER_LEVEL, levelUp } from '../../lib/progression'
import { FaChartColumn, FaCheck, FaXmark } from 'react-icons/fa6'

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

export default function Niveau24() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [finishing, setFinishing] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [completed, setCompleted] = useState(false)

  const [currentQuiz, setCurrentQuiz] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState(null)
  const [showResult, setShowResult] = useState(false)
  const [answers, setAnswers] = useState([])

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

  const onSelectAnswer = (answerId) => {
    if (showResult) return
    setSelectedAnswer(answerId)
  }

  const onValidateAnswer = () => {
    if (!selectedAnswer) return
    setShowResult(true)
    setAnswers((prev) => [...prev, {
      quizId: QUIZ_DATA[currentQuiz].id,
      selected: selectedAnswer,
      correct: selectedAnswer === QUIZ_DATA[currentQuiz].correct
    }])
  }

  const onNext = async () => {
    if (currentQuiz < QUIZ_DATA.length - 1) {
      setCurrentQuiz((prev) => prev + 1)
      setSelectedAnswer(null)
      setShowResult(false)
    } else {
      if (finishing) return
      setFinishing(true)
      setSaveError('')
      try {
        const correctCount = answers.filter((answer) => answer.correct).length
        await usersAPI.saveExtraInfo([
          {
            question_id: 'niveau24_quiz_score',
            question_text: 'Score quiz orientation',
            answer_text: `${correctCount}/${QUIZ_DATA.length} bonnes réponses`
          },
          {
            question_id: 'niveau24_quiz_completed',
            question_text: 'Quiz statistiques complété',
            answer_text: 'Oui'
          }
        ])
        await levelUp({ minLevel: 24, xpReward: XP_PER_LEVEL })
        setCompleted(true)
      } catch (e) {
        console.error('Niveau24 levelUp failed', e)
        setSaveError('Impossible d’enregistrer ton score pour le moment.')
      } finally {
        setFinishing(false)
      }
    }
  }

  const currentQuizData = QUIZ_DATA[currentQuiz]
  const isCorrect = selectedAnswer === currentQuizData?.correct
  const score = answers.filter((answer) => answer.correct).length

  const restartQuiz = () => {
    setCurrentQuiz(0)
    setSelectedAnswer(null)
    setShowResult(false)
    setAnswers([])
    setSaveError('')
    setCompleted(false)
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
    <div className="mx-auto max-w-4xl space-y-5 p-2 md:p-6">
      <header className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-black text-xl text-[#c1ff72]">
          <FaChartColumn aria-hidden="true" />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase text-gray-500">Explorer son orientation</p>
          <h1 className="mt-1 text-2xl font-semibold text-gray-950">Quiz stat orientation</h1>
          <p className="mt-1 text-sm text-gray-500">Trois chiffres pour mieux comprendre les études après le bac.</p>
        </div>
      </header>

      {saveError && (
        <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {saveError}
        </div>
      )}

      <section className="grid overflow-hidden rounded-lg border border-gray-200 bg-white shadow-card lg:grid-cols-[minmax(250px,0.8fr)_minmax(0,1.2fr)]">
        <aside className="border-b border-gray-200 bg-gray-50 p-5 lg:border-b-0 lg:border-r">
          <p className="text-xs font-semibold uppercase text-gray-500">Le chiffre</p>
          <PieChart percentage={currentQuizData.stat} color={currentQuizData.color} />
          <p className="text-center text-xs text-gray-500">Source : {currentQuizData.source}</p>
        </aside>

        <div className="p-5 md:p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-gray-950">Question {currentQuiz + 1}</span>
            <span className="text-sm text-gray-500">{currentQuiz + 1} / {QUIZ_DATA.length}</span>
          </div>
          <h2 className="text-xl font-semibold text-gray-950">{currentQuizData.question}</h2>

          <div className="mt-5 space-y-3">
            {currentQuizData.options.map((option) => {
              const isSelected = selectedAnswer === option.id
              const isCorrectOption = option.id === currentQuizData.correct
              let optionClasses = 'w-full rounded-lg border p-4 text-left transition '

              if (showResult) {
                if (isCorrectOption) optionClasses += 'border-green-500 bg-green-50'
                else if (isSelected) optionClasses += 'border-red-400 bg-red-50'
                else optionClasses += 'border-gray-200 bg-gray-50 opacity-60'
              } else if (isSelected) {
                optionClasses += 'border-black bg-gray-100'
              } else {
                optionClasses += 'border-gray-200 bg-white hover:border-gray-950'
              }

              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onSelectAnswer(option.id)}
                  disabled={showResult}
                  aria-pressed={isSelected}
                  className={optionClasses}
                >
                  <span className="flex items-start gap-3">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-black text-xs font-bold text-white">{option.id}</span>
                    <span className="flex-1 text-sm text-gray-900 md:text-base">{option.text}</span>
                    {showResult && isCorrectOption && <FaCheck className="mt-0.5 shrink-0 text-green-700" aria-hidden="true" />}
                    {showResult && isSelected && !isCorrectOption && <FaXmark className="mt-0.5 shrink-0 text-red-600" aria-hidden="true" />}
                  </span>
                </button>
              )
            })}
          </div>

          {showResult && (
            <div className={`mt-5 rounded-lg border p-4 text-sm ${isCorrect ? 'border-green-200 bg-green-50 text-green-950' : 'border-amber-200 bg-amber-50 text-amber-950'}`}>
              <strong className="block">{isCorrect ? 'Bonne réponse' : 'À retenir'}</strong>
              <p className="mt-1">{currentQuizData.explanation}</p>
            </div>
          )}

          <div className="mt-5">
            {!showResult ? (
              <button
                type="button"
                onClick={onValidateAnswer}
                disabled={!selectedAnswer}
                className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-black px-4 text-sm font-semibold text-white hover:bg-gray-900 disabled:opacity-50"
              >
                Vérifier ma réponse
              </button>
            ) : (
              <button
                type="button"
                onClick={onNext}
                disabled={finishing || completed}
                className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-black px-4 text-sm font-semibold text-white hover:bg-gray-900 disabled:opacity-50"
              >
                {currentQuiz < QUIZ_DATA.length - 1 ? 'Question suivante' : finishing ? 'Enregistrement...' : 'Enregistrer mon score'}
              </button>
            )}
          </div>
        </div>
      </section>

      {completed && (
        <section className="flex flex-col gap-4 rounded-lg border border-[#c1ff72] bg-[#f8fff0] p-4 sm:flex-row sm:items-center sm:justify-between" role="status">
          <div className="flex items-start gap-3">
            <i className="ph ph-check-circle mt-0.5 text-xl text-green-700" aria-hidden="true" />
            <div>
              <h2 className="font-semibold text-gray-950">Score enregistré : {score}/{QUIZ_DATA.length}</h2>
              <p className="mt-1 text-sm text-gray-600">Tu peux le refaire pour revoir les données.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={restartQuiz} className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-900 hover:border-black">
              Refaire le quiz
            </button>
            <Link to="/app" className="inline-flex h-10 items-center justify-center rounded-lg bg-black px-4 text-sm font-semibold text-white hover:bg-gray-900">
              Retour au parcours
            </Link>
          </div>
        </section>
      )}
    </div>
  )
}