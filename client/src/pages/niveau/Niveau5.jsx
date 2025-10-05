import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import supabase from '../../lib/supabase'
import apiClient, { usersAPI } from '../../lib/api'
import { levelUp } from '../../lib/progression'

// Reuse helper from other levels (simplified fallback only to avoid duplication)
function buildAvatarFromProfile(profile, seed = 'zelia') {
  try {
    if (profile?.avatar_url && typeof profile.avatar_url === 'string') return profile.avatar_url
    if (profile?.avatar && typeof profile.avatar === 'string') return profile.avatar
    if (profile?.avatar_json) {
      let conf = profile.avatar_json
      if (typeof conf === 'string') { try { conf = JSON.parse(conf) } catch {} }
      if (conf && typeof conf === 'object') {
        if (conf.url && typeof conf.url === 'string') {
          try { const u = new URL(conf.url); if (u.protocol.startsWith('http')) return u.toString() } catch {}
        }
        const params = new URLSearchParams()
        params.set('seed', String(seed))
        Object.entries(conf).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') params.set(k, String(v)) })
        if (!params.has('size')) params.set('size', '300')
        return `https://api.dicebear.com/9.x/lorelei/svg?${params.toString()}`
      }
    }
  } catch {}
  const p = new URLSearchParams({ seed: String(seed), size: '300', radius: '15' })
  return `https://api.dicebear.com/9.x/lorelei/svg?${p.toString()}`
}

// Typewriter hook
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

export default function Niveau5() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [baseAvatarUrl, setBaseAvatarUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [userId, setUserId] = useState('')

  // flow
  // sequence: messages and input steps interleaved
  // indexes referencing items in dialogue array
  const [idx, setIdx] = useState(0)
  const [inputs, setInputs] = useState({})
  const [saving, setSaving] = useState(false)
  const [mouthAlt, setMouthAlt] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [englishLevel, setEnglishLevel] = useState('')

  // TTS function
  const speakText = (text) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = 'en-US' // English
      utterance.rate = 0.8
      window.speechSynthesis.speak(utterance)
    }
  }

  // Load profile
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { navigate('/login'); return }
        setUserId(user.id)
        const pRes = await usersAPI.getProfile().catch(() => null)
        if (!mounted) return
        const prof = pRes?.data?.profile || pRes?.data || null
        setProfile(prof)
        setBaseAvatarUrl(buildAvatarFromProfile(prof, user.id))
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

  const dialogue = useMemo(() => ([
    { type: 'text', text: "Hey! Welcome to Level 5. We're going to test your English skills in a fun conversation. I'll ask you questions, play some audio, and at the end, I'll tell you your CEFR level from A1 to C2. Ready?", durationMs: 6000 },
    { type: 'text', text: "First, let's test your listening. I'll play a short audio. Listen carefully and answer the question after.", durationMs: 4000 },
    { type: 'audio', text: "Listen: 'Hello, my name is John. I live in London and I work as a teacher. I like reading books and playing football.' What is John's job?", audioText: "Hello, my name is John. I live in London and I work as a teacher. I like reading books and playing football." },
    { type: 'input', id: 'listening1', placeholder: 'Your answer...' },
    { type: 'text', text: "Good! Now, another listening test. Listen: 'The weather is sunny today. I am going to the park with my friends. We will have a picnic and play games.' Where are they going?", durationMs: 4000 },
    { type: 'audio', text: "Listen carefully.", audioText: "The weather is sunny today. I am going to the park with my friends. We will have a picnic and play games." },
    { type: 'input', id: 'listening2', placeholder: 'Your answer...' },
    { type: 'text', text: "Great listening! Now, speaking. Describe your favorite hobby in English. Be as detailed as you can.", durationMs: 3000 },
    { type: 'input', id: 'speaking1', placeholder: 'Describe your hobby...' },
    { type: 'text', text: "Nice! Reading test. Read this: 'Cats are popular pets. They are independent and playful. Many people love cats because they are cute and fun.' What are cats described as?", durationMs: 5000 },
    { type: 'input', id: 'reading1', placeholder: 'Your answer...' },
    { type: 'text', text: "Good. Writing test. Write a short paragraph about your daily routine. Use at least 5 sentences.", durationMs: 3000 },
    { type: 'input', id: 'writing1', placeholder: 'Write your paragraph...' },
    { type: 'text', text: "Vocabulary: What does 'happy' mean? Choose: a) sad, b) joyful, c) angry", durationMs: 3000 },
    { type: 'input', id: 'vocab1', placeholder: 'a, b, or c...' },
    { type: 'text', text: "Grammar: Fill in the blank: 'I ___ to school every day.' (go, goes, going)", durationMs: 3000 },
    { type: 'input', id: 'grammar1', placeholder: 'Your answer...' },
    { type: 'text', text: "Conversation: What do you think about learning English? Why is it important?", durationMs: 3000 },
    { type: 'input', id: 'conversation1', placeholder: 'Your opinion...' },
    { type: 'text', text: "Thanks for participating! Now, let's calculate your English level based on your answers.", durationMs: 3000 },
    { type: 'result' },
  ]), [])

  const current = dialogue[idx] || { type: 'text', text: '', durationMs: 1000 }
  const { text: typed, done: typedDone, skip } = useTypewriter((current.type === 'text' || current.type === 'audio') ? current.text : '', current.durationMs || 1500)

  // mouth animation while typing
  useEffect(() => {
    if ((current.type !== 'text' && current.type !== 'audio') || typedDone) return
    const int = setInterval(() => setMouthAlt(v => !v), 200)
    return () => clearInterval(int)
  }, [current, typedDone])

  function modifyDicebearUrl(urlStr, params = {}) {
    try {
      const u = new URL(urlStr)
      const isDice = /api\.dicebear\.com/.test(u.host) && /\/lorelei\/svg/.test(u.pathname)
      if (!isDice) return urlStr
      Object.entries(params).forEach(([k, v]) => {
        if (v === null || v === undefined || v === '') u.searchParams.delete(k)
        else u.searchParams.set(k, String(v))
      })
      if (!u.searchParams.has('size')) u.searchParams.set('size', '300')
      return u.toString()
    } catch { return urlStr }
  }

  const displayedAvatarUrl = useMemo(() => {
    let url = baseAvatarUrl
    if (!url) return url
    const isDice = (() => { try { const u = new URL(url); return /api\.dicebear\.com/.test(u.host) && /\/lorelei\/svg/.test(u.pathname) } catch { return false } })()
    if (!isDice) return url
    if (current.type === 'text' && !typedDone) {
      url = modifyDicebearUrl(url, { mouth: mouthAlt ? 'happy08' : null })
    } else {
      url = modifyDicebearUrl(url, { mouth: null })
    }
    return url
  }, [baseAvatarUrl, current, typedDone, mouthAlt])

  const canProceed = () => {
    if (current.type === 'text' || current.type === 'audio') return typedDone
    if (current.type === 'input') return inputs[current.id] && inputs[current.id].trim().length > 0
    if (current.type === 'result') return true
    return true
  }

  const onNext = () => {
    if (current.type === 'text' && !typedDone) { skip(); return }
    if (!canProceed()) return
    if (idx + 1 < dialogue.length) {
      const nextIdx = idx + 1
      setIdx(nextIdx)
      const nextItem = dialogue[nextIdx]
      if (nextItem && nextItem.type === 'audio') {
        speakText(nextItem.audioText)
      }
      if (nextItem && nextItem.type === 'result') {
        setEnglishLevel(calculateEnglishLevel(inputs))
      }
    } else {
      finishLevel()
    }
  }

  function getLevelMessage(level) {
    const messages = {
      A1: "Your English level is: A1 (Beginner)\n\nL'anglais est essentiel pour votre avenir professionnel car c'est la langue internationale des affaires. À ce niveau débutant, concentrez-vous sur les bases : vocabulaire quotidien, phrases simples. Avec de la pratique régulière, vous progresserez rapidement vers des niveaux plus avancés qui ouvriront des opportunités internationales.",
      A2: "Your English level is: A2 (Elementary)\n\nL'anglais est essentiel pour votre avenir professionnel car c'est la langue internationale des affaires et de la technologie. À ce niveau élémentaire, vous pouvez déjà communiquer sur des sujets familiers. Continuez à pratiquer pour atteindre B1 et améliorer votre employabilité sur le marché international.",
      B1: "Your English level is: B1 (Intermediate)\n\nL'anglais est essentiel pour votre avenir professionnel car c'est la langue internationale des affaires, de la technologie et de la communication. À ce niveau intermédiaire, vous pouvez discuter de sujets variés et comprendre des textes complexes. Cela vous donne déjà un avantage compétitif ; visez B2 pour des opportunités plus élevées.",
      B2: "Your English level is: B2 (Upper Intermediate)\n\nL'anglais est essentiel pour votre avenir professionnel car c'est la langue internationale des affaires, de la technologie et de la communication. À ce niveau avancé, vous maîtrisez la langue couramment. Cela ouvre des portes vers des postes internationaux et des carrières dans des entreprises multinationales. Continuez à perfectionner pour atteindre C1.",
      C1: "Your English level is: C1 (Advanced)\n\nL'anglais est essentiel pour votre avenir professionnel car c'est la langue internationale des affaires, de la technologie et de la communication. À ce niveau avancé, vous utilisez l'anglais avec aisance et précision. Cela vous positionne pour des rôles de leadership international et des opportunités dans des secteurs de pointe. Visez C2 pour une maîtrise totale.",
      C2: "Your English level is: C2 (Proficient)\n\nL'anglais est essentiel pour votre avenir professionnel car c'est la langue internationale des affaires, de la technologie et de la communication. À ce niveau expert, vous maîtrisez parfaitement l'anglais. Cela vous donne accès aux meilleures opportunités professionnelles mondiales, y compris dans des domaines spécialisés et innovants. Félicitations pour ce niveau exceptionnel !"
    }
    return messages[level] || "Your English level is: " + level + "\n\nL'anglais est essentiel pour votre avenir professionnel. Continuez à pratiquer !"
  }

  function calculateEnglishLevel(answers) {
    let score = 0
    // Listening: check for key words
    if (answers.listening1?.toLowerCase().includes('teacher') || answers.listening1?.toLowerCase().includes('professor')) score += 25
    if (answers.listening2?.toLowerCase().includes('park') || answers.listening2?.toLowerCase().includes('garden')) score += 25
    // Speaking: length, structure, vocabulary
    const speak = answers.speaking1 || ''
    const speakWords = speak.split(/\s+/).length
    if (speakWords > 20) score += 15
    if (speak.includes('I') && speak.includes('like')) score += 10
    if (speak.includes('because') || speak.includes('so')) score += 5
    // Reading: comprehension
    const read = answers.reading1?.toLowerCase() || ''
    if (read.includes('independent') || read.includes('playful') || read.includes('cute') || read.includes('fun')) score += 20
    // Writing: length, structure, grammar
    const write = answers.writing1 || ''
    const writeWords = write.split(/\s+/).length
    const sentences = write.split(/[.!?]+/).filter(s => s.trim().length > 0).length
    if (sentences >= 5) score += 15
    if (writeWords > 50) score += 10
    if (write.includes('I ') && write.includes('my ')) score += 5
    // Vocab: exact
    if (answers.vocab1?.toLowerCase().trim() === 'b') score += 15
    // Grammar: exact
    if (answers.grammar1?.toLowerCase().trim() === 'go') score += 15
    // Conversation: length, opinion
    const conv = answers.conversation1 || ''
    const convWords = conv.split(/\s+/).length
    if (convWords > 30) score += 10
    if (conv.includes('important') || conv.includes('because') || conv.includes('future')) score += 10

    // Map to CEFR with more levels
    if (score <= 30) return 'A1'
    if (score <= 60) return 'A2'
    if (score <= 90) return 'B1'
    if (score <= 120) return 'B2'
    if (score <= 150) return 'C1'
    return 'C2'
  }

  function finishLevel() {
    const level = calculateEnglishLevel(inputs)
    setEnglishLevel(level)
    setSaving(true)
    ;(async () => {
      try {
        // Save answers and level (fire and forget)
        try {
          await apiClient.post('/questionnaire/niveau5', { answers: inputs, englishLevel: level })
        } catch {}
        // progression
        try {
          await levelUp({ minLevel: 5, xpReward: 180 })
        } catch (e) { console.warn('Progression update failed', e) }
        setCompleted(true)
      } finally {
        setSaving(false)
      }
    })()
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
      <div className="max-w-4xl mx-auto">
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-card">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
            <img src={displayedAvatarUrl} alt="Avatar" className="w-40 h-40 sm:w-48 sm:h-48 md:w-64 md:h-64 rounded-2xl border border-gray-100 shadow-sm object-contain bg-white mx-auto md:mx-0" />
            <div className="flex-1 w-full">
              {(current.type === 'text' || current.type === 'audio') && (
                <div className="relative bg-black text-white rounded-2xl p-4 md:p-5 w-full">
                  <div className="text-base md:text-lg leading-relaxed whitespace-pre-wrap min-h-[3.5rem]">{typed}</div>
                  <div className="absolute -left-2 top-6 w-0 h-0 border-t-8 border-b-8 border-r-8 border-t-transparent border-b-transparent border-r-black" />
                </div>
              )}
              {current.type === 'result' && (
                <div className="relative bg-black text-white rounded-2xl p-4 md:p-5 w-full">
                  <div className="text-base md:text-lg leading-relaxed whitespace-pre-wrap min-h-[3.5rem]">{getLevelMessage(englishLevel)}</div>
                  <div className="absolute -left-2 top-6 w-0 h-0 border-t-8 border-b-8 border-r-8 border-t-transparent border-b-transparent border-r-black" />
                </div>
              )}
              {current.type === 'input' && (
                <div className="space-y-3">
                  <label className="font-medium text-text-primary block">Réponse</label>
                  <textarea
                    className="w-full rounded-xl border border-gray-300 p-3 focus:outline-none focus:ring-2 focus:ring-black min-h-[140px]"
                    placeholder={current.placeholder || 'Ta réponse...'}
                    value={inputs[current.id]}
                    onChange={(e) => setInputs(prev => ({ ...prev, [current.id]: e.target.value }))}
                  />
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  onClick={onNext}
                  disabled={!canProceed() || saving}
                  className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200 disabled:opacity-50"
                >
                  {idx + 1 < dialogue.length ? ((current.type === 'text' || current.type === 'audio') && !typedDone ? 'Passer' : 'Suivant') : 'Terminer'}
                </button>
                <button onClick={() => navigate('/app/activites')} className="px-4 py-2 rounded-lg bg-white text-gray-900 border border-gray-300">Quitter</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {completed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="relative bg-white border border-gray-200 rounded-2xl p-8 shadow-2xl text-center max-w-md w-11/12">
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 w-10 h-10 bg-[#c1ff72] rounded-full flex items-center justify-center shadow-md animate-bounce">🎯</div>
            <h3 className="text-2xl font-extrabold mb-2">Niveau 5 terminé !</h3>
            <p className="text-text-secondary mb-4">Ton niveau d'anglais est : <strong>{englishLevel}</strong>. Continue à pratiquer pour progresser !</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button onClick={() => navigate('/app/activites')} className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200">Retour aux activités</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
