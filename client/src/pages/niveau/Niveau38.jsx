import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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

const SITUATIONS = [
  {
    id: 'analysis',
    title: "Situation 1 : L'analyse",
    type: 'qcm',
    context: "Tu travailles dans un café. C’est le coup de feu, il y a 10 personnes qui attendent, et soudain, la machine à café tombe en panne et fuit partout.",
    question: "Quelle est ta toute première réaction pour résoudre ce problème efficacement ?",
    options: [
      "Commencer à éponger l'eau immédiatement.",
      "S'excuser auprès des clients et appeler un réparateur.",
      "Identifier la source de la fuite et couper l'arrivée d'eau/électricité.",
      "Paniquer et demander au collègue de gérer."
    ],
    correctIndex: 2,
    explanation: "Avant de réparer ou de communiquer, il faut stopper l'aggravation du problème (confinement)."
  },
  {
    id: 'priorization',
    title: "Situation 2 : Priorisation",
    type: 'drag',
    context: "Tu es stagiaire en communication. Ton maître de stage te confie 4 tâches à faire en 1h avant une réunion importante.",
    question: "Classe-les de la plus prioritaire (1) à la moins urgente (4).",
    options: [
      { id: 'A', text: "Commander les pizzas pour le déjeuner de demain." },
      { id: 'B', text: "Imprimer et agrafer les 10 dossiers pour la réunion de dans 1h." },
      { id: 'C', text: "Répondre à un commentaire sur Instagram datant d'hier." },
      { id: 'D', text: "Corriger une faute d'orthographe sur la présentation qui va être projetée à la réunion." }
    ],
    correctOrder: ['D', 'B', 'C', 'A'],
    explanation: "L'impact immédiat sur la réunion est la priorité absolue (Erreur visuelle > Logistique immédiate)."
  },
  {
    id: 'critical',
    title: "Situation 3 : Pensée critique",
    type: 'truefalse',
    context: "On te confie une mission : « Augmenter les ventes de glaces du magasin ». Tu remarques que les ventes baissent quand il pleut.",
    question: "En résolution de problème, une corrélation signifie forcément une causalité.",
    options: ['Vrai', 'Faux'],
    correctIndex: 1,
    explanation: "Il peut y avoir d'autres causes. Il faut toujours vérifier ses hypothèses."
  },
  {
    id: 'creativity',
    title: "Situation 4 : Créativité",
    type: 'qcm',
    context: "Tu organises une soirée étudiante. Le DJ annule à 2h de l'évènement. Tu n'as pas de budget supplémentaire.",
    question: "Quelle solution illustre le mieux la débrouillardise ?",
    options: [
      "Annuler la soirée.",
      "Brancher un téléphone avec une playlist collaborative où chaque invité peut ajouter un titre.",
      "Emprunter de l'argent pour payer un DJ de luxe en urgence.",
      "Mettre la radio en espérant que ça plaise."
    ],
    correctIndex: 1,
    explanation: "C'est une solution à coût zéro qui transforme un problème en animation interactive."
  },
  {
    id: 'decision',
    title: "Situation 5 : Prise de décision",
    type: 'qcm',
    context: "Tu travailles en équipe sur un projet. Un membre ne rend pas sa partie à temps, ce qui bloque tout le monde.",
    question: "Le chef de projet te demande qui est responsable. Que fais-tu ?",
    options: [
      "Tu le dénonces directement pour te protéger.",
      "Tu ignores le message et tu attends que ça passe.",
      "Tu proposes une solution collective sans pointer du doigt."
    ],
    correctIndex: 2,
    explanation: "La résolution de problème en entreprise est souvent relationnelle. L'objectif est le résultat, pas le coupable."
  }
]

export default function Niveau38() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [profile, setProfile] = useState(null)
  const [avatarUrl, setAvatarUrl] = useState('')

  const [dialogueIdx, setDialogueIdx] = useState(0)
  const [phase, setPhase] = useState('intro')
  const [showSuccess, setShowSuccess] = useState(false)
  const [finishing, setFinishing] = useState(false)

  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState({})
  const [showFeedback, setShowFeedback] = useState(false)

  const [dragItems, setDragItems] = useState(SITUATIONS[1].options)
  const [draggingId, setDraggingId] = useState(null)

  const firstName = profile?.first_name || 'toi'

  const dialogues = useMemo(() => [
    { text: `${firstName}, aujourd'hui on travaille un hard skill : la résolution de problèmes.`, durationMs: 2400 },
    { text: "Tu vas faire 5 mini-jeux avec des situations réalistes.", durationMs: 2000 },
    { text: "Réponds vite, puis lis les explications.", durationMs: 1800 },
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
        console.error('Niveau38 load error', e)
        if (!mounted) return
        setError('Erreur de chargement')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [navigate])

  const onDialogueNext = () => {
    if (!typedDone) { skip(); return }
    if (dialogueIdx < dialogues.length - 1) {
      setDialogueIdx(prev => prev + 1)
    } else {
      setPhase('game')
    }
  }

  const currentSituation = SITUATIONS[currentIndex]

  const handleSelect = (optionIndex) => {
    if (showFeedback) return
    setAnswers(prev => ({ ...prev, [currentSituation.id]: optionIndex }))
    setShowFeedback(true)
  }

  const handleTrueFalse = (optionIndex) => {
    handleSelect(optionIndex)
  }

  const handleContinue = () => {
    setShowFeedback(false)
    if (currentIndex < SITUATIONS.length - 1) {
      setCurrentIndex(prev => prev + 1)
      if (currentSituation.type === 'drag') {
        setDragItems(SITUATIONS[1].options)
      }
    } else {
      setPhase('result')
    }
  }

  const onDragStart = (id) => {
    setDraggingId(id)
  }

  const onDragOver = (e) => {
    e.preventDefault()
  }

  const onDrop = (id) => {
    if (!draggingId || draggingId === id) return
    const next = [...dragItems]
    const fromIndex = next.findIndex(item => item.id === draggingId)
    const toIndex = next.findIndex(item => item.id === id)
    if (fromIndex === -1 || toIndex === -1) return
    const [moved] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, moved)
    setDragItems(next)
    setDraggingId(null)
  }

  const checkOrder = () => {
    if (showFeedback) return
    const order = dragItems.map(item => item.id)
    setAnswers(prev => ({ ...prev, [currentSituation.id]: order }))
    setShowFeedback(true)
  }

  const finishLevel = async () => {
    if (finishing) return
    setFinishing(true)
    try {
      // Save problem-solving situations to extra info
      const situationsSummary = SITUATIONS.map(s => s.title).join(', ')
      await usersAPI.saveExtraInfo([
        {
          question_id: 'niveau38_problem_solving_completed',
          question_text: 'Résolution de problèmes (situations)',
          answer_text: JSON.stringify({
            situationsCompleted: SITUATIONS.length,
            situationsSummary,
            completedAt: new Date().toISOString()
          })
        }
      ]).catch(e => console.warn('saveExtraInfo N38 failed', e))
      
      await levelUp({ minLevel: 38, xpReward: XP_PER_LEVEL })
      setShowSuccess(true)
    } catch (e) {
      console.error('Niveau38 levelUp failed', e)
      setError('Impossible de valider le niveau.')
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

  const renderOptions = () => {
    if (currentSituation.type === 'drag') {
      return (
        <div className="space-y-2">
          {dragItems.map((item, index) => (
            <div
              key={item.id}
              draggable={!showFeedback}
              onDragStart={() => onDragStart(item.id)}
              onDragOver={onDragOver}
              onDrop={() => onDrop(item.id)}
              className={`flex items-center gap-2 p-2 md:p-3 rounded-lg border ${showFeedback ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-200 cursor-move hover:border-[#c1ff72]'}`}
            >
              <span className="w-6 h-6 rounded-full bg-black text-white flex items-center justify-center text-xs font-bold flex-shrink-0">{index + 1}</span>
              <span className="text-xs md:text-sm text-gray-800">{item.text}</span>
            </div>
          ))}
          {!showFeedback && (
            <button onClick={checkOrder} className="w-full px-4 py-3 rounded-lg bg-[#c1ff72] text-black border border-gray-200 font-medium">
              Valider l'ordre
            </button>
          )}
        </div>
      )
    }

    return (
      <div className="flex flex-col gap-2">
        {currentSituation.options.map((opt, idx) => (
          <button
            key={`${currentSituation.id}-${idx}`}
            onClick={() => (currentSituation.type === 'truefalse' ? handleTrueFalse(idx) : handleSelect(idx))}
            disabled={showFeedback}
            className={`text-left p-2 md:p-3 rounded-lg border transition-all text-sm ${showFeedback ? 'border-gray-200 bg-gray-50' : 'border-gray-200 hover:border-[#c1ff72] hover:bg-[#f8fff0]'}`}
          >
            {opt}
          </button>
        ))}
      </div>
    )
  }

  const renderFeedback = () => {
    if (!showFeedback) return null
    if (currentSituation.type === 'drag') {
      const isCorrect = JSON.stringify(dragItems.map(i => i.id)) === JSON.stringify(currentSituation.correctOrder)
      return (
        <div className={`mt-4 p-4 rounded-xl border ${isCorrect ? 'bg-[#f8fff0] border-[#c1ff72]' : 'bg-red-50 border-red-200'}`}>
          <p className="text-sm text-gray-800"><strong>{isCorrect ? 'Correct.' : 'À revoir.'}</strong> {currentSituation.explanation}</p>
        </div>
      )
    }

    const chosen = answers[currentSituation.id]
    const isCorrect = chosen === currentSituation.correctIndex
    return (
      <div className={`mt-4 p-4 rounded-xl border ${isCorrect ? 'bg-[#f8fff0] border-[#c1ff72]' : 'bg-red-50 border-red-200'}`}>
        <p className="text-sm text-gray-800"><strong>{isCorrect ? 'Correct.' : 'À revoir.'}</strong> {currentSituation.explanation}</p>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-card">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
            <img src={avatarUrl} alt="Avatar" className="w-28 h-28 sm:w-36 sm:h-36 md:w-44 md:h-44 lg:w-52 lg:h-52 rounded-2xl border border-gray-100 shadow-sm object-contain bg-white mx-auto md:mx-0" />
            <div className="flex-1 w-full">
              <div className="relative bg-black text-white rounded-2xl p-4 md:p-5 w-full">
                <div className="text-base md:text-lg leading-relaxed whitespace-pre-wrap min-h-[3.5rem]">
                  {phase === 'intro' && typed}
                  {phase === 'game' && "Lis la situation et réponds. Tu verras l'explication juste après."}
                  {phase === 'result' && "Bravo, tu as terminé les 5 mini-jeux."}
                </div>
                <div className="absolute -left-2 top-6 w-0 h-0 border-t-8 border-b-8 border-r-8 border-t-transparent border-b-transparent border-r-black" />
              </div>

              <div className="mt-4 flex flex-col gap-3">
                {phase === 'intro' && (
                  <button onClick={onDialogueNext} className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200 w-full sm:w-auto">
                    {dialogueIdx < dialogues.length - 1 ? 'Suivant' : 'Commencer'}
                  </button>
                )}
                {phase === 'result' && (
                  <button onClick={finishLevel} disabled={finishing} className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200 w-full sm:w-auto disabled:opacity-50">
                    Terminer le niveau
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-4 md:p-6 shadow-card">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center text-white font-bold">38</div>
            <h2 className="text-lg md:text-xl font-bold">Résolution de problèmes</h2>
          </div>

          {phase === 'intro' && (
            <div className="text-text-secondary text-center py-8">Les mini-jeux apparaîtront ici.</div>
          )}

          {phase === 'game' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm text-text-secondary">
                <span>{currentSituation.title}</span>
                <span>Situation {currentIndex + 1} / {SITUATIONS.length}</span>
              </div>
              <div className="p-4 rounded-xl bg-gray-50 border border-gray-200">
                <p className="text-sm text-gray-700"><strong>Contexte :</strong> {currentSituation.context}</p>
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-3">{currentSituation.question}</h3>
                {renderOptions()}
              </div>
              {renderFeedback()}
              {showFeedback && (
                <div className="pt-4 border-t border-gray-200">
                  <button onClick={handleContinue} className="w-full px-4 py-3 rounded-lg bg-[#c1ff72] text-black border border-gray-200 font-medium hover:bg-[#b8f566] transition-colors">
                    {currentIndex < SITUATIONS.length - 1 ? 'Situation suivante' : 'Voir le résultat'}
                  </button>
                </div>
              )}
            </div>
          )}

          {phase === 'result' && (
            <div className="space-y-4">
              <div className="bg-[#f8fff0] border border-[#c1ff72] rounded-xl p-6 text-center">
                <h3 className="text-xl font-bold text-gray-900 mb-2">Niveau terminé</h3>
                <p className="text-gray-700">Tu as vu 5 situations clés de résolution de problèmes. Garde ces réflexes au quotidien.</p>
              </div>
              <ul className="space-y-2 text-sm text-gray-700">
                {SITUATIONS.map((s) => (
                  <li key={s.id} className="flex items-start gap-2">
                    <span className="text-[#c1ff72] font-bold">•</span>
                    <span>{s.title}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="relative bg-white border border-gray-200 rounded-2xl p-8 shadow-2xl text-center max-w-md w-11/12">
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 w-10 h-10 bg-[#c1ff72] rounded-full flex items-center justify-center shadow-md animate-bounce font-bold">38</div>
            <h3 className="text-2xl font-extrabold mb-2">Niveau 38 terminé !</h3>
            <p className="text-text-secondary mb-4">Tu as travaillé la résolution de problèmes avec 5 situations.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button onClick={() => navigate('/app/activites')} className="px-4 py-2 rounded-lg bg-white text-gray-900 border border-gray-200">Retour aux activités</button>
              <button onClick={() => navigate('/app/niveau/39')} className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200">Niveau suivant</button>
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