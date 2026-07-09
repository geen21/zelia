import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usersAPI } from '../../lib/api'
import apiClient from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { buildAvatarFromProfile } from '../../lib/avatar'
import { FaUserTie } from 'react-icons/fa6'

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

  const [messages, setMessages] = useState([
    { role: 'assistant', content: "Bonjour. J'ai parcouru votre dossier d'études. Présentez-vous rapidement, et tâchez d'être convaincant." }
  ])
  const [input, setInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [studySuggestions, setStudySuggestions] = useState([])
  const listRef = useRef(null)
  const userInteractions = messages.filter((m) => m.role === 'user').length
  const interactionLimitReached = userInteractions >= MAX_INTERACTIONS

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

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages])

  // Persist progress silently as the simulation is actually used — no
  // explicit "Terminer" button needed for the dashboard checklist to update.
  async function persistProgress(exchangedCount) {
    try {
      await usersAPI.saveExtraInfo([
        {
          question_id: 'niveau29_interview_done',
          question_text: 'Simulation entretien complétée',
          answer_text: 'Oui'
        },
        {
          question_id: 'niveau29_messages_exchanged',
          question_text: 'Échanges avec le recruteur',
          answer_text: `${exchangedCount} réponse(s) donnée(s)`
        }
      ])
    } catch (e) {
      console.warn('Niveau29 persist failed (non-blocking):', e)
    }
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
        mode: 'advisor',
        message: text,
        history: historyForAi.slice(-10),
        advisorType: 'recruteur-impitoyable'
      }, { headers })

      const reply = res?.data?.reply || '...'
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }])
      persistProgress(newMessages.filter((m) => m.role === 'user').length)
    } catch (e) {
      console.error(e)
      setMessages((prev) => [...prev, { role: 'assistant', content: "Hum... vous avez de la chance, j'ai une urgence (Erreur technique)." }])
    } finally {
      setAiLoading(false)
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
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-card">
          <div className="flex items-center gap-3">
            <img src={avatarUrl} alt="" className="w-12 h-12 rounded-2xl border border-gray-100 shadow-sm object-contain bg-white" />
            <div>
              <h1 className="text-xl md:text-2xl font-bold">Simulation d'entretien</h1>
              <p className="text-text-secondary text-sm">Un coach d'admission exigeant va te poser des questions pointues. Réponds du mieux possible.</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl shadow-card overflow-hidden flex flex-col h-[520px]">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center gap-4">
            <img
              src="https://api.dicebear.com/9.x/avataaars/svg?seed=CoachAdmission&backgroundColor=b6e3f4&clothing=blazerAndShirt&eyes=surprised&eyebrows=angry&mouth=serious&skinColor=f2d3b1"
              alt="Coach"
              className="w-12 h-12 rounded-full border border-gray-300 bg-white"
            />
            <div>
              <h2 className="text-lg font-bold text-gray-800">Coach Admission</h2>
              <p className="text-xs text-red-600 font-semibold uppercase tracking-wider">Mode Études</p>
            </div>
          </div>

          <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-white">
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
            {!aiLoading && userInteractions === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-text-secondary opacity-50">
                <div className="text-4xl mb-2"><FaUserTie className="w-8 h-8" /></div>
                <p>En attente du candidat...</p>
              </div>
            )}
          </div>

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
              Interactions : {userInteractions}/{MAX_INTERACTIONS}
              {interactionLimitReached && ' — bien joué, ta simulation a été enregistrée automatiquement.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
