import React, { useEffect, useMemo, useRef, useState } from 'react'
import supabase from '../lib/supabase'
import apiClient from '../lib/api'

const ADMIN_EMAILS = new Set(['joris.geerdes@zelia.io', 'nicolas.wiegele@zelia.io'])

export default function Chat() {
  const [mode, setMode] = useState('student') // 'student' | 'ai'
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Global chat state
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const listRef = useRef(null)

  // AI chat state
  const [aiHistory, setAiHistory] = useState([]) // {role: 'user'|'assistant', content: string}[]
  const [aiInput, setAiInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [jobs, setJobs] = useState([]) // [{title, skills[]}]
  const [persona, setPersona] = useState(null) // {title, skills[]}

  // Fetch current user and initial data
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        setLoading(true)
        // Get auth user from Supabase persisted session (no manual token)
        let resolvedUser = null
        const { data: { user: authUser }, error: userErr } = await supabase.auth.getUser()
        if (authUser && !userErr) {
          resolvedUser = { id: authUser.id, email: authUser.email }
        } else {
          // Fallback to API using bearer from localStorage
          try {
            const me = await apiClient.get('/users/me')
            resolvedUser = { id: me.data.user.id, email: me.data.user.email }
          } catch (e) {
            throw new Error('Non authentifié')
          }
        }
        if (!mounted) return
        setUser(resolvedUser)

        // Load last messages
        const { data: initial, error: selErr } = await supabase
          .from('global_chat')
          .select('*')
          .order('created_at', { ascending: true })
          .limit(200)
        if (selErr) throw selErr
        if (!mounted) return
        setMessages(initial || [])

        // Load job recommendations for personas (prefer results by userId; fallback to auth route)
        try {
          let recos = []
          try {
            const res1 = await apiClient.get(`/analysis/results/${resolvedUser.id}`)
            recos = res1?.data?.results?.jobRecommendations || []
          } catch (e1) {
            try {
              const res2 = await apiClient.get('/analysis/my-results')
              recos = res2?.data?.results?.jobRecommendations || []
            } catch (e2) {
              // ignore
            }
          }
          setJobs(recos)
          if (recos.length > 0) setPersona(recos[0])
        } catch (e) {
          // Optional; ignore if not yet generated
        }

        // Subscribe realtime
        const channel = supabase
          .channel('global_chat_changes')
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'global_chat' }, (payload) => {
            setMessages((prev) => [...prev, payload.new])
          })
          .subscribe()

        return () => {
          supabase.removeChannel(channel)
        }
      } catch (e) {
        if (mounted) setError(e.message || 'Erreur de chargement')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [])

  // Auto scroll
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages, aiHistory])

  const handleSendGlobal = async () => {
    const text = input.trim()
    if (!text || !user) return
    setInput('')
    // Optimistic
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
      setError(insErr.message)
      // rollback optimistic
      setMessages((prev) => prev.filter((m) => m !== optimistic))
      setInput(text)
    }
  }

  const isAdminMsg = (email) => email && ADMIN_EMAILS.has(email.toLowerCase())

  // AI chat
  const handleSendAI = async () => {
    const text = aiInput.trim()
    if (!text) return
    const newHistory = [...aiHistory, { role: 'user', content: text }]
    setAiHistory(newHistory)
    setAiInput('')
    setAiLoading(true)
    try {
  // Ensure we always send a valid bearer token to the API
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token || localStorage.getItem('supabase_auth_token') || localStorage.getItem('token')
  const headers = token ? { Authorization: `Bearer ${token}` } : {}

      const res = await apiClient.post('/chat/ai', {
        mode: persona ? 'persona' : 'advisor',
        persona: persona || undefined,
  message: text,
  history: newHistory.slice(-10), // send last turns
  jobTitles: (jobs || []).map(j => j?.title).filter(Boolean),
  advisorType: persona?.title || 'conseiller-ia'
  }, { headers })
      const reply = res?.data?.reply || "Je n'ai pas pu générer de réponse."
      setAiHistory((prev) => [...prev, { role: 'assistant', content: reply }])
    } catch (e) {
      setAiHistory((prev) => [...prev, { role: 'assistant', content: 'Erreur IA: ' + (e?.response?.data?.error || e.message) }])
    } finally {
      setAiLoading(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-white">
      <div className="text-center">
        <div className="mx-auto mb-4 h-12 w-12 rounded-full border-4 border-gray-200 relative">
          <div className="absolute inset-1 rounded-full border-4" style={{ borderColor: '#c1ff72' }} />
          <div className="absolute right-0 bottom-0 h-3 w-3 rounded-full" style={{ background: '#f68fff' }} />
        </div>
        <div className="text-lg font-semibold text-gray-800">Chargement du chat…</div>
      </div>
    </div>
  )
  if (error) return <div className="p-6 text-red-600">{error}</div>

  return (
    <div className="min-h-screen bg-white p-4 flex flex-col">
      <div className="w-full space-y-6 flex flex-col">
        {/* Header card with toggle */}
        <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-card">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex items-center justify-center gap-2">
              <button
                className={`px-4 py-2 rounded-full border text-sm ${mode==='student' ? 'bg-black text-white border-black' : 'bg-white border-gray-200'}`}
                onClick={() => setMode('student')}
              >Étudiant</button>
              <span className="text-gray-400">/</span>
              <button
                className={`px-4 py-2 rounded-full border text-sm ${mode==='ai' ? 'bg-black text-white border-black' : 'bg-white border-gray-200'}`}
                onClick={() => setMode('ai')}
              >IA</button>
            </div>
          </div>
        </div>

        {mode === 'student' ? (
          <section className="bg-white rounded-3xl border border-gray-200 shadow-card overflow-hidden flex flex-col">
            <header className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-800">Chat global</h2>
              <span className="text-xs px-2 py-1 rounded-full bg-[#c1ff72] text-black border border-gray-200">Tous les utilisateurs</span>
            </header>
            <div ref={listRef} className="h-[50vh] overflow-y-auto p-4 space-y-3 bg-white">
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.user_id === user.id ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] px-3 py-2 rounded-lg border ${m.user_id === user.id ? 'bg-black text-white border-black' : 'bg-white border-gray-200'}`}>
                    <div className="text-xs mb-1 flex items-center gap-2">
                      {isAdminMsg(m.user_email) ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#f68fff] text-white">Admin</span>
                      ) : (
                        <span className="text-gray-600">{m.user_email || 'Utilisateur'}</span>
                      )}
                      <span className="text-gray-400">· {new Date(m.created_at).toLocaleTimeString()}</span>
                    </div>
                    <div className="whitespace-pre-wrap break-words">{m.content}</div>
                  </div>
                </div>
              ))}
            </div>
            <footer className="p-4 border-t border-gray-200 bg-white">
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
            </footer>
          </section>
        ) : (
          <section className="bg-white rounded-3xl border border-gray-200 shadow-card overflow-hidden flex flex-col">
            <header className="px-6 py-4 border-b border-gray-200 flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold text-gray-800 text-center">Conseiller IA</h2>
              {jobs.length > 0 ? (
                <div className="mt-3 w-full flex flex-wrap items-center justify-center gap-2">
                  <button
                    key="general"
                    className={`text-sm px-3 py-1.5 rounded-full border ${!persona ? 'bg-black text-white border-black' : 'bg-white border-line'}`}
                    onClick={() => setPersona(null)}
                    title="Conseiller général"
                  >Général</button>
                  {jobs.map((j, idx) => (
                    <button
                      key={idx}
                      className={`text-sm px-3 py-1.5 rounded-full border ${persona?.title===j.title ? 'bg-black text-white border-black' : 'bg-white border-line'}`}
                      onClick={() => setPersona(j)}
                      title={j.skills?.join(', ')}
                    >{j.title}</button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-text-secondary text-center mt-1">Conseiller d'orientation</p>
              )}
            </header>
            <div ref={listRef} className="h-[50vh] overflow-y-auto p-4 space-y-3 bg-white">
              {aiHistory.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] px-3 py-2 rounded-lg border ${m.role === 'user' ? 'bg-black text-white border-black' : 'bg-white border-gray-200'}`}>
                    <div className="text-xs mb-1 text-gray-600">{m.role === 'user' ? 'Vous' : (persona ? persona.title : 'Conseiller IA')}</div>
                    <div className="whitespace-pre-wrap break-words">{m.content}</div>
                  </div>
                </div>
              ))}
              {aiLoading && (
                <div className="text-sm text-gray-500">L'IA rédige une réponse…</div>
              )}
            </div>
            <footer className="p-4 border-t border-gray-200 bg-white">
              <div className="flex gap-2">
                <input
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 outline-none"
                  placeholder={persona ? `Parler avec ${persona.title}…` : "Poser une question d'orientation…"}
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSendAI() }}
                />
                <button disabled={aiLoading} className="px-4 py-2 rounded-lg bg-black text-white disabled:opacity-60" onClick={handleSendAI}>Envoyer</button>
              </div>
            </footer>
          </section>
        )}
      </div>
    </div>
  )
}
