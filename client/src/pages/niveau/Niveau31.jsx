import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
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

// Metiers avec beaucoup de debouches (contre-intuitif)
const JOBS_DATA = [
  { id: 1, name: 'Aide-soignant', hasOpportunities: true, explanation: 'Forte demande dans le secteur medical avec le vieillissement de la population.' },
  { id: 2, name: 'Developpeur web', hasOpportunities: true, explanation: 'Transformation numerique massive, demande constante.' },
  { id: 3, name: 'Influenceur', hasOpportunities: false, explanation: 'Marche sature, tres peu arrivent a en vivre.' },
  { id: 4, name: 'Conducteur poids lourd', hasOpportunities: true, explanation: 'Penurie de chauffeurs, secteur en tension.' },
  { id: 5, name: 'Avocat', hasOpportunities: false, explanation: 'Marche sature, concurrence forte, insertion difficile.' },
  { id: 6, name: 'Plombier', hasOpportunities: true, explanation: 'Metier en forte tension, departs a la retraite massifs.' },
  { id: 7, name: 'Architecte', hasOpportunities: false, explanation: 'Peu de postes, beaucoup de diplomes.' },
  { id: 8, name: 'Infirmier', hasOpportunities: true, explanation: 'Demande enorme, secteur en crise de recrutement.' },
  { id: 9, name: 'Journaliste', hasOpportunities: false, explanation: 'Secteur en crise, suppressions de postes.' },
  { id: 10, name: 'Electricien', hasOpportunities: true, explanation: 'Transition energetique, renovation, forte demande.' },
]

const ZONE_OPPORTUNITIES = 'opportunities'
const ZONE_NO_OPPORTUNITIES = 'no-opportunities'

export default function Niveau31() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [profile, setProfile] = useState(null)
  const [avatarUrl, setAvatarUrl] = useState('')

  const [dialogueIdx, setDialogueIdx] = useState(0)
  const [phase, setPhase] = useState('intro') // intro -> game -> result
  const [showSuccess, setShowSuccess] = useState(false)
  const [finishing, setFinishing] = useState(false)

  // Game state
  const [availableJobs, setAvailableJobs] = useState([])
  const [placedJobs, setPlacedJobs] = useState({ [ZONE_OPPORTUNITIES]: [], [ZONE_NO_OPPORTUNITIES]: [] })
  const [draggedJob, setDraggedJob] = useState(null)
  const [touchStartY, setTouchStartY] = useState(null)
  const [results, setResults] = useState(null)
  const [selectedJob, setSelectedJob] = useState(null)
  const [gameInitialized, setGameInitialized] = useState(false)

  const firstName = profile?.first_name || 'toi'

  const dialogues = useMemo(() => [
    { text: `${firstName}, on va tester tes connaissances sur le marche du travail.`, durationMs: 2000 },
    { text: 'Certains metiers ont beaucoup de debouches, d\'autres non. Ca peut etre contre-intuitif !', durationMs: 2500 },
    { text: 'Glisse chaque metier dans la bonne zone. Pret ?', durationMs: 1800 },
  ], [firstName])

  const currentDialogue = dialogues[dialogueIdx] || { text: '', durationMs: 1500 }
  const { text: typed, done: typedDone, skip } = useTypewriter(
    phase === 'intro' ? currentDialogue.text : '',
    currentDialogue.durationMs
  )

  // Load profile
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
        console.error(e)
        if (!mounted) return
        setError('Erreur de chargement')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [navigate])

  // Initialize game
  useEffect(() => {
    if (phase === 'game' && !gameInitialized) {
      // Shuffle jobs
      const shuffled = [...JOBS_DATA].sort(() => Math.random() - 0.5)
      setAvailableJobs(shuffled)
      setPlacedJobs({ [ZONE_OPPORTUNITIES]: [], [ZONE_NO_OPPORTUNITIES]: [] })
      setResults(null)
      setGameInitialized(true)
    }
  }, [phase, gameInitialized])

  const onDialogueNext = () => {
    if (!typedDone) { skip(); return }
    if (dialogueIdx < dialogues.length - 1) {
      setDialogueIdx(prev => prev + 1)
    } else {
      setPhase('game')
    }
  }

  // Drag handlers (desktop)
  const onDragStart = (e, job) => {
    setDraggedJob(job)
    e.dataTransfer.effectAllowed = 'move'
  }

  const onDragOver = (e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const onDropInZone = (zone) => {
    if (!draggedJob) return
    // Remove from available
    setAvailableJobs(prev => prev.filter(j => j.id !== draggedJob.id))
    // Add to zone
    setPlacedJobs(prev => ({
      ...prev,
      [zone]: [...prev[zone], draggedJob]
    }))
    setDraggedJob(null)
  }

  // Touch handlers (mobile)
  const onTouchStartJob = (job, e) => {
    setDraggedJob(job)
    setTouchStartY(e.touches[0].clientY)
  }

  const onTouchMoveJob = useCallback((e) => {
    // Prevent scroll while dragging
    if (draggedJob) {
      e.preventDefault()
    }
  }, [draggedJob])

  const onTouchEndZone = (zone) => {
    if (!draggedJob) return
    setAvailableJobs(prev => prev.filter(j => j.id !== draggedJob.id))
    setPlacedJobs(prev => ({
      ...prev,
      [zone]: [...prev[zone], draggedJob]
    }))
    setDraggedJob(null)
    setTouchStartY(null)
  }

  // Cancel touch drag
  const cancelDrag = () => {
    setDraggedJob(null)
    setTouchStartY(null)
  }

  // Check answers
  const checkAnswers = () => {
    const correct = []
    const incorrect = []

    placedJobs[ZONE_OPPORTUNITIES].forEach(job => {
      if (job.hasOpportunities) correct.push(job)
      else incorrect.push(job)
    })

    placedJobs[ZONE_NO_OPPORTUNITIES].forEach(job => {
      if (!job.hasOpportunities) correct.push(job)
      else incorrect.push(job)
    })

    setResults({ correct, incorrect, total: JOBS_DATA.length })
    setPhase('result')
  }

  const allPlaced = availableJobs.length === 0 && 
    (placedJobs[ZONE_OPPORTUNITIES].length + placedJobs[ZONE_NO_OPPORTUNITIES].length) === JOBS_DATA.length

  const finishLevel = async () => {
    if (finishing) return
    setFinishing(true)
    try {
      await levelUp({ minLevel: 31, xpReward: XP_PER_LEVEL })
      setShowSuccess(true)
    } catch (e) {
      console.error('Niveau31 levelUp failed', e)
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

  return (
    <div className="p-4 md:p-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Left: Avatar + Dialogue */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-card">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
            <img src={avatarUrl} alt="Avatar" className="w-28 h-28 sm:w-36 sm:h-36 md:w-44 md:h-44 lg:w-52 lg:h-52 rounded-2xl border border-gray-100 shadow-sm object-contain bg-white mx-auto md:mx-0" />
            <div className="flex-1 w-full">
              <div className="relative bg-black text-white rounded-2xl p-4 md:p-5 w-full">
                <div className="text-base md:text-lg leading-relaxed whitespace-pre-wrap min-h-[3.5rem]">
                  {phase === 'intro' && typed}
                  {phase === 'game' && 'Glisse les metiers dans la bonne zone !'}
                  {phase === 'result' && `Score : ${results?.correct.length || 0}/${results?.total || 0}`}
                </div>
                <div className="absolute -left-2 top-6 w-0 h-0 border-t-8 border-b-8 border-r-8 border-t-transparent border-b-transparent border-r-black" />
              </div>

              <div className="mt-4 flex flex-col gap-3">
                {phase === 'intro' && (
                  <button onClick={onDialogueNext} className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200 w-full sm:w-auto">
                    {dialogueIdx < dialogues.length - 1 ? 'Suivant' : 'Commencer le jeu'}
                  </button>
                )}
                {phase === 'game' && allPlaced && (
                  <button onClick={checkAnswers} className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200 w-full sm:w-auto">
                    Valider mes reponses
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

        {/* Right: Game Area */}
        <div className="bg-white border border-gray-200 rounded-2xl p-4 md:p-6 shadow-card">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center text-white font-bold">31</div>
            <h2 className="text-lg md:text-xl font-bold">Metiers et debouches</h2>
          </div>

          {phase === 'intro' && (
            <div className="text-text-secondary text-center py-8">Le jeu apparaitra apres le dialogue.</div>
          )}

          {phase === 'game' && (
            <div className="space-y-4" onTouchMove={onTouchMoveJob}>
              {/* Progress bar */}
              <div className="mb-4">
                <div className="flex justify-between text-sm text-text-secondary mb-1">
                  <span>Progression</span>
                  <span>{JOBS_DATA.length - availableJobs.length}/{JOBS_DATA.length}</span>
                </div>
                <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-[#c1ff72] transition-all duration-300" 
                    style={{ width: `${((JOBS_DATA.length - availableJobs.length) / JOBS_DATA.length) * 100}%` }}
                  />
                </div>
              </div>

              {/* Available jobs */}
              {availableJobs.length > 0 && (
                <div className="mb-4">
                  <p className="text-sm text-text-secondary mb-2">Metiers a classer ({availableJobs.length} restants) :</p>
                  <div className="flex flex-wrap gap-2">
                    {availableJobs.map(job => (
                      <div
                        key={job.id}
                        draggable
                        onDragStart={(e) => onDragStart(e, job)}
                        onTouchStart={(e) => onTouchStartJob(job, e)}
                        className={`px-3 py-2 rounded-lg border-2 cursor-grab active:cursor-grabbing select-none transition-all ${
                          draggedJob?.id === job.id 
                            ? 'border-black bg-gray-100 opacity-50' 
                            : 'border-gray-300 bg-white hover:border-gray-400'
                        }`}
                      >
                        <span className="text-sm font-medium">{job.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Dragged job indicator (mobile) */}
              {draggedJob && (
                <div className="lg:hidden text-center py-2 bg-gray-100 rounded-lg border border-dashed border-gray-300">
                  <span className="text-sm">Deplace : <strong>{draggedJob.name}</strong></span>
                  <button onClick={cancelDrag} className="ml-2 text-red-500 text-sm underline">Annuler</button>
                </div>
              )}

              {/* Drop zones */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Zone: Has opportunities */}
                <div
                  onDragOver={onDragOver}
                  onDrop={() => onDropInZone(ZONE_OPPORTUNITIES)}
                  onTouchEnd={() => draggedJob && onTouchEndZone(ZONE_OPPORTUNITIES)}
                  className={`min-h-[140px] p-3 rounded-xl border-2 border-dashed transition-colors ${
                    draggedJob ? 'border-green-400 bg-green-50' : 'border-gray-300 bg-gray-50'
                  }`}
                >
                  <div className="text-sm font-semibold text-green-700 mb-2 text-center">Beaucoup de debouches</div>
                  <div className="flex flex-wrap gap-1">
                    {placedJobs[ZONE_OPPORTUNITIES].map(job => (
                      <span key={job.id} className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded border border-green-200">{job.name}</span>
                    ))}
                  </div>
                  {placedJobs[ZONE_OPPORTUNITIES].length === 0 && (
                    <p className="text-xs text-gray-400 text-center mt-4">Deposer ici</p>
                  )}
                </div>

                {/* Zone: Few opportunities */}
                <div
                  onDragOver={onDragOver}
                  onDrop={() => onDropInZone(ZONE_NO_OPPORTUNITIES)}
                  onTouchEnd={() => draggedJob && onTouchEndZone(ZONE_NO_OPPORTUNITIES)}
                  className={`min-h-[140px] p-3 rounded-xl border-2 border-dashed transition-colors ${
                    draggedJob ? 'border-red-400 bg-red-50' : 'border-gray-300 bg-gray-50'
                  }`}
                >
                  <div className="text-sm font-semibold text-red-700 mb-2 text-center">Peu de debouches</div>
                  <div className="flex flex-wrap gap-1">
                    {placedJobs[ZONE_NO_OPPORTUNITIES].map(job => (
                      <span key={job.id} className="px-2 py-1 text-xs bg-red-100 text-red-800 rounded border border-red-200">{job.name}</span>
                    ))}
                  </div>
                  {placedJobs[ZONE_NO_OPPORTUNITIES].length === 0 && (
                    <p className="text-xs text-gray-400 text-center mt-4">Deposer ici</p>
                  )}
                </div>
              </div>

              {/* Validate button - always visible in game area */}
              <div className="pt-4 border-t border-gray-200">
                <button 
                  onClick={checkAnswers} 
                  disabled={!allPlaced}
                  className={`w-full px-4 py-3 rounded-lg font-medium transition-all ${
                    allPlaced 
                      ? 'bg-[#c1ff72] text-black border border-gray-200 hover:bg-[#b8f566]' 
                      : 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed'
                  }`}
                >
                  {allPlaced ? 'Valider mes reponses' : `Classe tous les metiers (${JOBS_DATA.length - availableJobs.length}/${JOBS_DATA.length})`}
                </button>
              </div>
            </div>
          )}

          {phase === 'result' && results && (
            <div className="space-y-4">
              {/* Score summary */}
              <div className="text-center py-4 bg-gray-50 rounded-xl border border-gray-200">
                <div className="text-4xl font-bold mb-1">{results.correct.length}/{results.total}</div>
                <p className="text-text-secondary">bonnes reponses</p>
                <div className="flex justify-center gap-4 mt-3">
                  <span className="text-sm text-green-600 font-medium">{results.correct.length} correct{results.correct.length > 1 ? 's' : ''}</span>
                  <span className="text-sm text-red-600 font-medium">{results.incorrect.length} incorrect{results.incorrect.length > 1 ? 's' : ''}</span>
                </div>
              </div>

              {/* Legend */}
              <div className="text-xs text-text-secondary text-center">Clique sur un metier pour voir l'explication</div>

              {/* Corrections */}
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {JOBS_DATA.map(job => {
                  const wasCorrect = results.correct.find(j => j.id === job.id)
                  // Find where user placed this job
                  const userPlacedInOpportunities = placedJobs[ZONE_OPPORTUNITIES].find(j => j.id === job.id)
                  const userAnswer = userPlacedInOpportunities ? 'Debouches' : 'Sature'
                  const correctAnswer = job.hasOpportunities ? 'Debouches' : 'Sature'
                  
                  return (
                    <div
                      key={job.id}
                      onClick={() => setSelectedJob(selectedJob?.id === job.id ? null : job)}
                      className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                        wasCorrect 
                          ? 'bg-green-50 border-green-300' 
                          : 'bg-red-50 border-red-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {/* Correct/Incorrect indicator */}
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                          wasCorrect ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
                        }`}>
                          {wasCorrect ? (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          )}
                        </div>
                        
                        <div className="flex-1">
                          <span className="font-medium">{job.name}</span>
                          {!wasCorrect && (
                            <div className="text-xs mt-1">
                              <span className="text-red-600">Ta reponse : {userAnswer}</span>
                              <span className="text-text-secondary"> | </span>
                              <span className="text-green-600">Bonne reponse : {correctAnswer}</span>
                            </div>
                          )}
                        </div>
                        
                        <span className={`text-xs px-2 py-1 rounded font-medium ${
                          job.hasOpportunities 
                            ? 'bg-green-100 text-green-700' 
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {job.hasOpportunities ? 'Debouches' : 'Sature'}
                        </span>
                      </div>
                      
                      {selectedJob?.id === job.id && (
                        <p className="text-sm text-text-secondary mt-3 pt-3 border-t border-gray-200 pl-11">
                          {job.explanation}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Finish button in result area */}
              <div className="pt-4 border-t border-gray-200">
                <button 
                  onClick={finishLevel} 
                  disabled={finishing}
                  className="w-full px-4 py-3 rounded-lg bg-[#c1ff72] text-black border border-gray-200 font-medium hover:bg-[#b8f566] transition-colors disabled:opacity-50"
                >
                  {finishing ? 'Validation...' : 'Terminer le niveau'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Success Popup */}
      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="relative bg-white border border-gray-200 rounded-2xl p-8 shadow-2xl text-center max-w-md w-11/12">
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 w-10 h-10 bg-[#c1ff72] rounded-full flex items-center justify-center shadow-md animate-bounce font-bold">31</div>
            <h3 className="text-2xl font-extrabold mb-2">Niveau 31 termine !</h3>
            <p className="text-text-secondary mb-4">Tu connais maintenant mieux le marche du travail et ses surprises.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button onClick={() => navigate('/app/activites')} className="px-4 py-2 rounded-lg bg-white text-gray-900 border border-gray-200">Retour aux activites</button>
              <button onClick={() => navigate('/app/niveau/32')} className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200">Niveau suivant</button>
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