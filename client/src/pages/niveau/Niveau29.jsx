import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usersAPI } from '../../lib/api'
import apiClient from '../../lib/api'
import { XP_PER_LEVEL, levelUp } from '../../lib/progression'
import { supabase } from '../../lib/supabase'
import { buildAvatarFromProfile } from '../../lib/avatar'
import { FaUserTie, FaTrophy } from 'react-icons/fa6'

function useTypewriter(message, durationMs) {
  const [text, setText] = useState('')
  const [done, setDone] = useState(false)
  const intervalRef = useRef(null)
  const timeoutRef = useRef(null)

  useEffect(() => {
    setText('')
    setDone(false)
    const full = message || ''
    let i = 0
    const step = Math.max(15, Math.floor((durationMs || 1500) / Math.max(1, full.length)))
    intervalRef.current = setInterval(() => {
      i++
      setText(full.slice(0, i))
      if (i >= full.length) {
        clearInterval(intervalRef.current)
      }
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

const SYSTEM_PROMPT = `
INSTRUCTION STRICTE : Tu es un Coach d'admission en études supérieures impitoyable et exigeant.
Tu fais passer un entretien d'admission orienté études (pas un entretien métier).
Ton attitude :
- Froid, distant, professionnel mais très critique.
- Tu ne supportes pas la médiocrité ni les réponses toutes faites.
- Tu cherches à déstabiliser le candidat pour tester sa résistance.
- Tes questions sont pointues.
- Si le candidat répond vaguement, attaque-le là-dessus.
- Ne sois jamais gentil ou encourageant. Tu es là pour sélectionner le meilleur, pas pour faire du social.
- Fais des réponses courtes (max 2-3 phrases).
- Pose une seule question à la fois.
Reste dans ton personnage quoi qu'il arrive.
`

const MAX_INTERACTIONS = 5

export default function Niveau29() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [avatarUrl, setAvatarUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [dialogueStep, setDialogueStep] = useState(3)
  const [showSuccess, setShowSuccess] = useState(false)
  const [finishing, setFinishing] = useState(false)

  // Chat state
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "Bonjour. J'ai parcouru votre dossier d'études. Présentez-vous rapidement, et tâchez d'être convaincant." }
  ])
  const [input, setInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [studySuggestions, setStudySuggestions] = useState([])
  const listRef = useRef(null)
  const userInteractions = messages.filter((m) => m.role === 'user').length
  const interactionLimitReached = userInteractions >= MAX_INTERACTIONS

  const firstName = profile?.first_name || 'toi'
  const dialogueFinished = dialogueStep >= 3

  const dialogues = useMemo(() => [
    { text: `Bon ${firstName}, fini de jouer. On va passer aux choses sérieuses.`, durationMs: 2000 },
    { text: "Je t'ai préparé une simulation d'entretien d'admission en études avec une IA.", durationMs: 2300 },
    { text: "Attention : ce coach a été programmé pour être sans pitié. Il va tester tes limites.", durationMs: 2500 },
  ], [firstName])

  const currentDialogue = dialogues[dialogueStep] || { text: '', durationMs: 1000 }
  const { text: typed, done: typedDone, skip } = useTypewriter(
    dialogueFinished ? '' : currentDialogue.text,
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

        try {
          const extraRes = await usersAPI.getExtraInfo().catch(() => null)
          if (!mounted) return
          const entries = Array.isArray(extraRes?.data?.entries) ? extraRes.data.entries : []
          const rawFilieres = entries.find((row) => String(row?.question_id || '').toLowerCase() === 'niveau21_filieres')?.answer_text || ''

          let parsed = []
          try {
            const j = JSON.parse(rawFilieres)
            if (Array.isArray(j)) parsed = j
            else if (typeof j === 'string') parsed = [j]
          } catch {
            parsed = String(rawFilieres || '')
              .split(/\r?\n|,|;/)
              .map((line) => line.replace(/^[\s\-*•\d.)]+/, '').trim())
              .filter(Boolean)
          }

          const suggestions = [...new Set(
            parsed
              .map((v) => {
                if (typeof v === 'string') return v.trim()
                if (v && typeof v === 'object') {
                  return String(v.title || v.name || v.label || v.intitule || '').trim()
                }
                return ''
              })
              .filter(Boolean)
          )].slice(0, 8)
          setStudySuggestions(suggestions)
        } catch (ctxErr) {
          console.warn('Failed to load niveau21_filieres suggestions', ctxErr)
        }
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

  // Auto scroll
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages])

  const onDialogueNext = () => {
    if (!typedDone) { skip(); return }
    setDialogueStep((prev) => prev + 1)
  }

  const handleSend = async () => {
    const text = input.trim()
    if (!text || aiLoading || interactionLimitReached) return

    const newMessages = [...messages, { role: 'user', content: text }]
    setMessages(newMessages)
    setInput('')
    setAiLoading(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const headers = token ? { Authorization: `Bearer ${token}` } : {}

      // Construct history with system prompt at the start
      // Note: We use a 'user' message to inject instructions if 'system' is not strictly supported by the proxy,
      // but usually the proxy handles it or we can hint it.
      // Let's try to pass it via the 'message' field context or history.
      
      const studiesContext = studySuggestions.length
        ? `Contexte études (source: informations_complementaires, question_id=niveau21_filieres): ${studySuggestions.join(', ')}`
        : 'Contexte études: non disponible.'

      const historyForAi = [
        { role: 'user', content: SYSTEM_PROMPT },
        { role: 'user', content: studiesContext },
        { role: 'assistant', content: "Entendu. Je suis le coach d'admission impitoyable. Je suis prêt." },
        ...newMessages
      ]

      const res = await apiClient.post('/chat/ai', {
        mode: 'advisor', // Using advisor mode to pass history
        message: text,
        history: historyForAi.slice(-10), // Keep context window manageable
        advisorType: 'recruteur-impitoyable'
      }, { headers })

      const reply = res?.data?.reply || "..."
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }])
      
    } catch (e) {
      console.error(e)
      setMessages((prev) => [...prev, { role: 'assistant', content: "Hum... vous avez de la chance, j'ai une urgence (Erreur technique)." }])
    } finally {
      setAiLoading(false)
    }
  }

  const finishLevel = async () => {
    if (finishing) return
    setFinishing(true)
    try {
      await usersAPI.saveExtraInfo([
        {
          question_id: 'niveau29_interview_done',
          question_text: 'Simulation entretien complétée (Niveau 29)',
          answer_text: 'Oui'
        },
        {
          question_id: 'niveau29_messages_exchanged',
          question_text: 'Échanges avec le recruteur (Niveau 29)',
          answer_text: `${messages.filter(m => m.role === 'user').length} réponse(s) donnée(s)`
        }
      ])
      await levelUp({ minLevel: 29, xpReward: XP_PER_LEVEL })
      setShowSuccess(true)
    } catch (e) {
      console.error('Niveau28 levelUp failed', e)
      setError('Impossible de valider le niveau pour le moment.')
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
    <div className="p-2 md:p-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Left: Avatar + Dialogue */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-card">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
            <img src={avatarUrl} alt="Avatar" className="w-28 h-28 sm:w-36 sm:h-36 md:w-44 md:h-44 lg:w-52 lg:h-52 rounded-2xl border border-gray-100 shadow-sm object-contain bg-white mx-auto md:mx-0" />
            <div className="flex-1 w-full">
              <div className="relative bg-white text-gray-900 rounded-2xl p-4 md:p-5 w-full border border-gray-200 shadow-sm">
                <div className="text-base md:text-lg leading-relaxed whitespace-pre-wrap min-h-[3.5rem]">
                  {!dialogueFinished ? typed : "Bon courage pour l'entretien d'admission. Ne te laisse pas démonter !"}
                </div>
                <div className="absolute -left-2 top-6 w-0 h-0 border-t-8 border-b-8 border-r-8 border-t-transparent border-b-transparent border-r-white" />
              </div>

              <div className="mt-4 flex flex-col sm:flex-row gap-2">
                {!dialogueFinished ? (
                  <button
                    onClick={onDialogueNext}
                    className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200"
                  >
                    {dialogueStep < dialogues.length - 1 ? 'Suivant' : 'Commencer l\'entretien'}
                  </button>
                ) : (
                  <button
                    onClick={finishLevel}
                    disabled={finishing}
                    className="px-4 py-2 rounded-lg bg-red-100 text-red-900 border border-red-200 hover:bg-red-200 transition-colors w-full sm:w-auto"
                  >
                    Arrêter le supplice (Terminer)
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Interview Chat */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-card overflow-hidden flex flex-col h-[500px]">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center gap-4">
            <img 
              src={`https://api.dicebear.com/9.x/avataaars/svg?seed=CoachAdmission&backgroundColor=b6e3f4&clothing=blazerAndShirt&eyes=surprised&eyebrows=angry&mouth=serious&skinColor=f2d3b1`} 
              alt="Coach" 
              className="w-12 h-12 rounded-full border border-gray-300 bg-white"
            />
            <div>
              <h2 className="text-lg font-bold text-gray-800">Coach Admission</h2>
              <p className="text-xs text-red-600 font-semibold uppercase tracking-wider">Mode Études</p>
            </div>
          </div>

          <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-white">
            {!dialogueFinished ? (
              <div className="h-full flex flex-col items-center justify-center text-text-secondary opacity-50">
                <div className="text-4xl mb-2"><FaUserTie className="w-8 h-8" /></div>
                <p>En attente du candidat...</p>
              </div>
            ) : (
              <>
                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] px-4 py-3 rounded-2xl border ${
                      m.role === 'user' 
                        ? 'bg-black text-white border-black rounded-tr-none' 
                        : 'bg-gray-100 text-gray-900 border-gray-200 rounded-tl-none shadow-sm'
                    }`}>
                      <div className="whitespace-pre-wrap break-words">{m.content}</div>
                    </div>
                  </div>
                ))}
                {aiLoading && (
                  <div className="flex justify-start">
                    <div className="bg-gray-100 px-4 py-3 rounded-2xl rounded-tl-none border border-gray-200">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {dialogueFinished && (
            <div className="p-4 border-t border-gray-200 bg-gray-50">
              <div className="flex gap-2">
                <input
                  className="flex-1 border border-gray-300 rounded-xl px-4 py-3 outline-none focus:border-black focus:ring-1 focus:ring-black transition-all"
                  placeholder={interactionLimitReached ? 'Limite atteinte (5 interactions)' : 'Votre réponse...'}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSend() }}
                  disabled={aiLoading || interactionLimitReached}
                  autoFocus
                />
                <button 
                  disabled={aiLoading || !input.trim() || interactionLimitReached} 
                  className="px-6 py-3 rounded-xl bg-black text-white font-medium disabled:opacity-50 hover:bg-gray-800 transition-colors" 
                  onClick={handleSend}
                >
                  Envoyer
                </button>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Interactions: {userInteractions}/{MAX_INTERACTIONS}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Success Popup */}
      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="relative bg-white border border-gray-200 rounded-2xl p-8 shadow-2xl text-center max-w-md w-11/12">
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 w-10 h-10 bg-[#c1ff72] rounded-full flex items-center justify-center shadow-md animate-bounce"><FaTrophy className="w-5 h-5 text-yellow-600" /></div>
            <h3 className="text-2xl font-extrabold mb-2">Niveau 29 réussi !</h3>
            <p className="text-text-secondary mb-4">Tu as survécu à l'entretien d'admission. Bravo pour ton sang-froid !</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button onClick={() => navigate('/app/activites')} className="px-4 py-2 rounded-lg bg-white text-gray-900 border border-gray-200">Retour aux activités</button>
              <button onClick={() => navigate('/app/niveau/30')} className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200">Passer au niveau suivant</button>
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