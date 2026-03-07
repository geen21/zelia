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
    id: 'pivot',
    title: 'Situation 1 : Le Pivot Technologique',
    type: 'truefalse',
    context: "Tu as passÃƒÂ© deux jours ÃƒÂ  prÃƒÂ©parer une prÃƒÂ©sentation sur un logiciel spÃƒÂ©cifique. ArrivÃƒÂ© en rÃƒÂ©union, ton tuteur te dit : \"On change d'outil, on passe sur cette nouvelle application dÃƒÂ¨s maintenant\".",
    question: "L'adaptabilitÃƒÂ©, c'est accepter immÃƒÂ©diatement le changement sans poser de questions, mÃƒÂªme si tu ne maÃƒÂ®trises pas le nouvel outil.",
    options: ['Vrai', 'Faux'],
    correctIndex: 1,
    explanation: "L'adaptabilitÃƒÂ©, c'est l'agilitÃƒÂ©, pas la soumission aveugle. La bonne rÃƒÂ©action est d'accepter le changement tout en communiquant sur ses besoins."
  },
  {
    id: 'relation',
    title: "Situation 2 : L'ImprÃƒÂ©vu Relationnel",
    type: 'qcm',
    context: "Tu travailles en ÃƒÂ©quipe sur un projet scolaire/pro. Un membre trÃƒÂ¨s investi quitte soudainement le groupe. L'ambiance devient tendue et le travail est bloquÃƒÂ©.",
    question: "Quelle est l'attitude la plus adaptable ?",
    options: [
      'Maintenir le plan initial coÃƒÂ»te que coÃƒÂ»te en travaillant deux fois plus.',
      'Proposer une rÃƒÂ©union d\'urgence pour redistribuer les rÃƒÂ´les selon les forces de chacun.',
      'Attendre que le professeur ou le manager rÃƒÂ¨gle le problÃƒÂ¨me.',
      'Te plaindre du dÃƒÂ©part du membre pour justifier un futur retard.'
    ],
    correctIndex: 1,
    explanation: "S'adapter, c'est savoir rÃƒÂ©organiser les ressources disponibles face ÃƒÂ  une nouvelle contrainte."
  },
  {
    id: 'priority',
    title: 'Situation 3 : HiÃƒÂ©rarchie des PrioritÃƒÂ©s',
    type: 'drag',
    context: "Tu es en plein petit job d'ÃƒÂ©tÃƒÂ©. Voici 4 ÃƒÂ©vÃƒÂ©nements qui surviennent en mÃƒÂªme temps.",
    question: "Range-les par ordre d'adaptation (du plus urgent au moins urgent).",
    options: [
      { id: 'A', text: "Ton manager te demande de l'aider sur une tÃƒÂ¢che qu'il n'avait pas prÃƒÂ©vue." },
      { id: 'B', text: 'Un client mÃƒÂ©content arrive avec une rÃƒÂ©clamation imprÃƒÂ©vue.' },
      { id: 'C', text: 'Tu reÃƒÂ§ois une notification pour une tÃƒÂ¢che que tu devais finir ce soir.' },
      { id: 'D', text: 'La connexion internet coupe, empÃƒÂªchant l\'usage de ta caisse/logiciel.' }
    ],
    correctOrder: ['D', 'B', 'A', 'C'],
    explanation: "L'adaptabilitÃƒÂ© commence par gÃƒÂ©rer le blocage technique majeur, puis l'urgence humaine, avant de rÃƒÂ©organiser les consignes du manager et ses propres tÃƒÂ¢ches."
  },
  {
    id: 'comfort',
    title: 'Situation 4 : Sortir de sa zone de confort',
    type: 'qcm',
    context: "Tu as postulÃƒÂ© pour ÃƒÂªtre vendeur. En arrivant, on te dit que l'ÃƒÂ©quipe d'inventaire est en sous-effectif et on te demande d'aller compter des stocks en rÃƒÂ©serve toute la journÃƒÂ©e.",
    question: 'Ta rÃƒÂ©action :',
    options: [
      "DÃƒÂ©solÃƒÂ©, j'ai ÃƒÂ©tÃƒÂ© embauchÃƒÂ© pour vendre, pas pour compter des cartons.",
      "Pas de souci, je le fais, mais je vais traÃƒÂ®ner des pieds car c'est ennuyeux.",
      "C'est diffÃƒÂ©rent de ce qui ÃƒÂ©tait prÃƒÂ©vu, mais c'est l'occasion de voir l'envers du dÃƒÂ©cor du magasin."
    ],
    correctIndex: 2,
    explanation: "C'est ce qu'on appelle le Growth Mindset. L'adaptabilitÃƒÂ© est une question de perception : voir une corvÃƒÂ©e comme un apprentissage."
  },
  {
    id: 'lateral',
    title: 'Situation 5 : La PensÃƒÂ©e LatÃƒÂ©rale',
    type: 'qcm',
    context: "Tu dois livrer un colis important ÃƒÂ  vÃƒÂ©lo. Le pont principal est fermÃƒÂ© pour travaux, et tu n'as plus de batterie sur ton GPS.",
    question: "Quelle action montre une capacitÃƒÂ© d'adaptation originale ?",
    options: [
      'Faire demi-tour et rentrer chez toi.',
      'Demander ton chemin ÃƒÂ  3 passants diffÃƒÂ©rents pour croiser les informations.',
      'Chercher un plan papier dans une boulangerie ou un arrÃƒÂªt de bus ÃƒÂ  proximitÃƒÂ©.',
      'Suivre un autre cycliste en espÃƒÂ©rant qu\'il aille dans la mÃƒÂªme direction.'
    ],
    correctIndex: 2,
    explanation: "L'adaptabilitÃƒÂ©, c'est aussi savoir utiliser des outils low-tech quand la technologie te lÃƒÂ¢che."
  }
]

export default function Niveau36() {
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

  const [dragItems, setDragItems] = useState(SITUATIONS[2].options)
  const [draggingId, setDraggingId] = useState(null)

  const firstName = profile?.first_name || 'toi'

  const dialogues = useMemo(() => [
    { text: `${firstName}, on travaille un soft skill clÃƒÂ© : l'adaptabilitÃƒÂ©.`, durationMs: 2200 },
    { text: "Tu vas rÃƒÂ©soudre 5 situations diffÃƒÂ©rentes.", durationMs: 1800 },
    { text: "RÃƒÂ©ponds, puis lis l'explication.", durationMs: 1600 },
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
        console.error('Niveau36 load error', e)
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

  const handleContinue = () => {
    setShowFeedback(false)
    if (currentIndex < SITUATIONS.length - 1) {
      setCurrentIndex(prev => prev + 1)
      if (currentSituation.type === 'drag') {
        setDragItems(SITUATIONS[2].options)
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
      // Save adaptability results to extra info
      const situationsSummary = SITUATIONS.map(s => s.title).join(', ')
      await usersAPI.saveExtraInfo([
        {
          question_id: 'niveau36_adaptability_completed',
          question_text: 'Soft skill : adaptabilitÃƒÂ©',
          answer_text: JSON.stringify({
            situationsCompleted: SITUATIONS.length,
            situationsSummary,
            completedAt: new Date().toISOString()
          })
        }
      ]).catch(e => console.warn('saveExtraInfo N36 failed', e))
      
      await levelUp({ minLevel: 36, xpReward: XP_PER_LEVEL })
      setShowSuccess(true)
    } catch (e) {
      console.error('Niveau36 levelUp failed', e)
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
            onClick={() => handleSelect(idx)}
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
          <p className="text-sm text-gray-800"><strong>{isCorrect ? 'Correct.' : 'Ãƒâ‚¬ revoir.'}</strong> {currentSituation.explanation}</p>
        </div>
      )
    }

    const chosen = answers[currentSituation.id]
    const isCorrect = chosen === currentSituation.correctIndex
    return (
      <div className={`mt-4 p-4 rounded-xl border ${isCorrect ? 'bg-[#f8fff0] border-[#c1ff72]' : 'bg-red-50 border-red-200'}`}>
        <p className="text-sm text-gray-800"><strong>{isCorrect ? 'Correct.' : 'Ãƒâ‚¬ revoir.'}</strong> {currentSituation.explanation}</p>
      </div>
    )
  }

  return (
    <div className="p-2 md:p-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-card">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
            <img src={avatarUrl} alt="Avatar" className="w-28 h-28 sm:w-36 sm:h-36 md:w-44 md:h-44 lg:w-52 lg:h-52 rounded-2xl border border-gray-100 shadow-sm object-contain bg-white mx-auto md:mx-0" />
            <div className="flex-1 w-full">
              <div className="relative bg-black text-white rounded-2xl p-4 md:p-5 w-full">
                <div className="text-base md:text-lg leading-relaxed whitespace-pre-wrap min-h-[3.5rem]">
                  {phase === 'intro' && typed}
                  {phase === 'game' && "Lis la situation et rÃƒÂ©ponds. Tu verras l'explication juste aprÃƒÂ¨s."}
                  {phase === 'result' && "Bravo, tu as terminÃƒÂ© les 5 mini-jeux."}
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

        <div className="bg-white border border-gray-200 rounded-2xl p-2 md:p-6 shadow-card">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center text-white font-bold">36</div>
            <h2 className="text-lg md:text-xl font-bold">AdaptabilitÃƒÂ©</h2>
          </div>

          {phase === 'intro' && (
            <div className="text-text-secondary text-center py-8">Les mini-jeux apparaÃƒÂ®tront ici.</div>
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
                    {currentIndex < SITUATIONS.length - 1 ? 'Situation suivante' : 'Voir le rÃƒÂ©sultat'}
                  </button>
                </div>
              )}
            </div>
          )}

          {phase === 'result' && (
            <div className="space-y-4">
              <div className="bg-[#f8fff0] border border-[#c1ff72] rounded-xl p-6 text-center">
                <h3 className="text-xl font-bold text-gray-900 mb-2">Niveau terminÃƒÂ©</h3>
                <p className="text-gray-700">Tu as travaillÃƒÂ© l'adaptabilitÃƒÂ© ÃƒÂ  travers 5 situations concrÃƒÂ¨tes.</p>
              </div>
              <ul className="space-y-2 text-sm text-gray-700">
                {SITUATIONS.map((s) => (
                  <li key={s.id} className="flex items-start gap-2">
                    <span className="text-[#c1ff72] font-bold">Ã¢â‚¬Â¢</span>
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
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 w-10 h-10 bg-[#c1ff72] rounded-full flex items-center justify-center shadow-md animate-bounce font-bold">36</div>
            <h3 className="text-2xl font-extrabold mb-2">Niveau 36 terminÃƒÂ© !</h3>
            <p className="text-text-secondary mb-4">Tu as renforcÃƒÂ© ton adaptabilitÃƒÂ© avec 5 situations.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button onClick={() => navigate('/app/activites')} className="px-4 py-2 rounded-lg bg-white text-gray-900 border border-gray-200">Retour aux activitÃƒÂ©s</button>
              <button onClick={() => navigate('/app/niveau/37')} className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200">Niveau suivant</button>
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