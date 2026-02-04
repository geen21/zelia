import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usersAPI } from '../../lib/api'
import apiClient from '../../lib/api'
import { XP_PER_LEVEL, levelUp } from '../../lib/progression'
import { supabase } from '../../lib/supabase'
import { buildAvatarFromProfile } from '../../lib/avatar'

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

const ADMIN_EMAILS = new Set(['joris.geerdes@zelia.io', 'nicolas.wiegele@zelia.io'])

export default function Niveau27() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [avatarUrl, setAvatarUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [dialogueStep, setDialogueStep] = useState(0)
  const [showSuccess, setShowSuccess] = useState(false)
  const [finishing, setFinishing] = useState(false)

  // Chat state
  const [user, setUser] = useState(null)
  const [mode, setMode] = useState('student') // 'student' | 'ai'
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [aiHistory, setAiHistory] = useState([])
  const [aiInput, setAiInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const listRef = useRef(null)

  const firstName = profile?.first_name || 'toi'
  const dialogueFinished = dialogueStep >= 3
  const showSecondDialogue = dialogueStep >= 4

  const dialogues = useMemo(() => [
    { text: 'Bon on a que des cadors ici !', durationMs: 1500 },
    { text: 'On te propose de te présenter rapidement sur le chat global de Zélia', durationMs: 2200 },
    { text: "Le but est de créer un espace d'échange", durationMs: 1800 },
  ], [])

  const secondDialogues = useMemo(() => [
    { text: "Tu peux envoyer un message pour te présenter, dire ce que tu penses, essayer de voir si d'autres aimeraient faire le même métier que toi ?", durationMs: 3500 },
    { text: "Tu peux également discuter avec notre conseillère d'orientation virtuelle si tu veux !", durationMs: 2500 },
  ], [])

  const currentDialogue = dialogueStep < 3 
    ? dialogues[dialogueStep] 
    : dialogueStep < 5 
      ? secondDialogues[dialogueStep - 3]
      : { text: '', durationMs: 1000 }

  const { text: typed, done: typedDone, skip } = useTypewriter(
    dialogueStep < 5 ? currentDialogue?.text || '' : '',
    currentDialogue?.durationMs || 1500
  )

  // Load profile and chat data
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser()
        if (!authUser) { navigate('/login'); return }
        
        setUser({ id: authUser.id, email: authUser.email })
        
        const pRes = await usersAPI.getProfile().catch(() => null)
        if (!mounted) return
        const prof = pRes?.data?.profile || pRes?.data || null
        setProfile(prof)
        setAvatarUrl(buildAvatarFromProfile(prof, authUser.id))

        // Load chat messages
        const { data: initial } = await supabase
          .from('global_chat')
          .select('*')
          .order('created_at', { ascending: true })
          .limit(100)
        if (!mounted) return
        setMessages(initial || [])

        // Subscribe realtime
        const channel = supabase
          .channel('global_chat_n27')
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'global_chat' }, (payload) => {
            setMessages((prev) => [...prev, payload.new])
          })
          .subscribe()

        return () => {
          supabase.removeChannel(channel)
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
  }, [messages, aiHistory])

  const onDialogueNext = () => {
    if (!typedDone) { skip(); return }
    setDialogueStep((prev) => prev + 1)
  }

  // Send global message
  const handleSendGlobal = async () => {
    const text = input.trim()
    if (!text || !user) return
    setInput('')
    const optimistic = {
      id: Date.now(),
      user_id: user.id,
      user_email: user.email,
      content: text,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, optimistic])
    const { error: insErr } = await supabase
      .from('global_chat')
      .insert({ user_id: user.id, user_email: user.email, content: text })
    if (insErr) {
      setMessages((prev) => prev.filter((m) => m !== optimistic))
      setInput(text)
    }
  }

  // Send AI message
  const handleSendAI = async () => {
    const text = aiInput.trim()
    if (!text) return
    const newHistory = [...aiHistory, { role: 'user', content: text }]
    setAiHistory(newHistory)
    setAiInput('')
    setAiLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const headers = token ? { Authorization: `Bearer ${token}` } : {}
      const res = await apiClient.post('/chat/ai', {
        mode: 'advisor',
        message: text,
        history: newHistory.slice(-10),
        advisorType: 'conseiller-orientation'
      }, { headers })
      const reply = res?.data?.reply || "Je n'ai pas pu générer de réponse."
      setAiHistory((prev) => [...prev, { role: 'assistant', content: reply }])
    } catch (e) {
      setAiHistory((prev) => [...prev, { role: 'assistant', content: 'Erreur IA: ' + (e?.response?.data?.error || e.message) }])
    } finally {
      setAiLoading(false)
    }
  }

  const isAdminMsg = (email) => email && ADMIN_EMAILS.has(email.toLowerCase())

  const finishLevel = async () => {
    if (finishing) return
    setFinishing(true)
    try {
      await levelUp({ minLevel: 27, xpReward: XP_PER_LEVEL })
      setShowSuccess(true)
    } catch (e) {
      console.error('Niveau27 levelUp failed', e)
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
    <div className="p-4 md:p-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Left: Avatar + Dialogue */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-card">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
            <img src={avatarUrl} alt="Avatar" className="w-28 h-28 sm:w-36 sm:h-36 md:w-44 md:h-44 lg:w-52 lg:h-52 rounded-2xl border border-gray-100 shadow-sm object-contain bg-white mx-auto md:mx-0" />
            <div className="flex-1 w-full">
              <div className="relative bg-black text-white rounded-2xl p-4 md:p-5 w-full">
                <div className="text-base md:text-lg leading-relaxed whitespace-pre-wrap min-h-[3.5rem]">
                  {dialogueStep < 5 ? typed : 'Le chat est débloqué ! Tu peux y accéder à tout moment depuis le menu.'}
                </div>
                <div className="absolute -left-2 top-6 w-0 h-0 border-t-8 border-b-8 border-r-8 border-t-transparent border-b-transparent border-r-black" />
              </div>

              <div className="mt-4 flex flex-col sm:flex-row gap-2">
                {dialogueStep < 3 && (
                  <button
                    onClick={onDialogueNext}
                    className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200"
                  >
                    {dialogueStep < 2 ? 'Suivant' : 'Voir le chat'}
                  </button>
                )}

                {dialogueFinished && dialogueStep < 5 && (
                  <button
                    onClick={onDialogueNext}
                    className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200"
                  >
                    Suivant
                  </button>
                )}

                {dialogueStep >= 5 && (
                  <button
                    onClick={finishLevel}
                    disabled={finishing}
                    className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200 disabled:opacity-50"
                  >
                    Terminer le niveau
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Chat */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-card overflow-hidden">
          {!dialogueFinished ? (
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center text-white">💬</div>
                <h2 className="text-xl font-bold">Chat Zélia</h2>
              </div>
              <div className="text-text-secondary text-center py-8">
                Réponds au dialogue pour débloquer le chat.
              </div>
            </div>
          ) : (
            <>
              {/* Chat header with toggle */}
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center text-white">💬</div>
                    <h2 className="text-xl font-bold">Chat Zélia</h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className={`px-3 py-1.5 rounded-full border text-sm ${mode==='student' ? 'bg-black text-white border-black' : 'bg-white border-gray-200'}`}
                      onClick={() => setMode('student')}
                    >Étudiants</button>
                    <button
                      className={`px-3 py-1.5 rounded-full border text-sm ${mode==='ai' ? 'bg-black text-white border-black' : 'bg-white border-gray-200'}`}
                      onClick={() => setMode('ai')}
                    >IA</button>
                  </div>
                </div>
              </div>

              {mode === 'student' ? (
                <>
                  <div ref={listRef} className="h-[40vh] overflow-y-auto p-4 space-y-3 bg-gray-50">
                    {messages.length === 0 && (
                      <div className="text-center text-text-secondary py-8">Sois le premier à envoyer un message !</div>
                    )}
                    {messages.map((m) => (
                      <div key={m.id} className={`flex ${m.user_id === user?.id ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[75%] px-3 py-2 rounded-lg border ${m.user_id === user?.id ? 'bg-black text-white border-black' : 'bg-white border-gray-200'}`}>
                          <div className="text-xs mb-1 flex items-center gap-2">
                            {isAdminMsg(m.user_email) ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#f68fff] text-white">Admin</span>
                            ) : (
                              <span className={m.user_id === user?.id ? 'text-gray-300' : 'text-gray-600'}>{m.user_email || 'Utilisateur'}</span>
                            )}
                          </div>
                          <div className="whitespace-pre-wrap break-words">{m.content}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="p-4 border-t border-gray-200 bg-white">
                    <div className="flex gap-2">
                      <input
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-2 outline-none"
                        placeholder="Écrire un message…"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSendGlobal() }}
                      />
                      <button className="px-4 py-2 rounded-lg bg-black text-white" onClick={handleSendGlobal}>Envoyer</button>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div ref={listRef} className="h-[40vh] overflow-y-auto p-4 space-y-3 bg-gray-50">
                    {aiHistory.length === 0 && (
                      <div className="text-center text-text-secondary py-8">Pose une question à notre conseillère d'orientation !</div>
                    )}
                    {aiHistory.map((m, i) => (
                      <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[75%] px-3 py-2 rounded-lg border ${m.role === 'user' ? 'bg-black text-white border-black' : 'bg-white border-gray-200'}`}>
                          <div className="text-xs mb-1 text-gray-600">{m.role === 'user' ? 'Vous' : 'Conseillère IA'}</div>
                          <div className="whitespace-pre-wrap break-words">{m.content}</div>
                        </div>
                      </div>
                    ))}
                    {aiLoading && (
                      <div className="text-sm text-gray-500">L'IA rédige une réponse…</div>
                    )}
                  </div>
                  <div className="p-4 border-t border-gray-200 bg-white">
                    <div className="flex gap-2">
                      <input
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-2 outline-none"
                        placeholder="Poser une question d'orientation…"
                        value={aiInput}
                        onChange={(e) => setAiInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSendAI() }}
                      />
                      <button disabled={aiLoading} className="px-4 py-2 rounded-lg bg-black text-white disabled:opacity-60" onClick={handleSendAI}>Envoyer</button>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Success Popup */}
      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="relative bg-white border border-gray-200 rounded-2xl p-8 shadow-2xl text-center max-w-md w-11/12">
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 w-10 h-10 bg-[#c1ff72] rounded-full flex items-center justify-center shadow-md animate-bounce">🏆</div>
            <h3 className="text-2xl font-extrabold mb-2">Niveau 27 réussi !</h3>
            <p className="text-text-secondary mb-4">Le chat est maintenant débloqué dans le menu !</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button onClick={() => navigate('/app/activites')} className="px-4 py-2 rounded-lg bg-white text-gray-900 border border-gray-200">Retour aux activités</button>
              <button onClick={() => navigate('/app/niveau/28')} className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200">Passer au niveau suivant</button>
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