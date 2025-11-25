import React, { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'

function SideAvatar({ size = 90 }) {
  const [url, setUrl] = useState(() => localStorage.getItem('avatar_url') || null)
  useEffect(() => {
    if (!url) {
      try {
        const cfgStr = localStorage.getItem('avatar_cfg')
        if (cfgStr) {
          const cfg = JSON.parse(cfgStr)
          const rebuilt = buildLoreleiUrl(cfg, 256)
          setUrl(rebuilt)
          localStorage.setItem('avatar_url', rebuilt)
        }
      } catch {}
    }
  }, [url])
  if (!url) {
    return <div style={{width:size, height:size, borderRadius:8, background:'#f5f5f5', display:'grid', placeItems:'center', color:'#999', boxShadow:'0 0 0 1px rgba(0,0,0,.06)'}}>🙂</div>
  }
  return <img src={url} alt="avatar" width={size} height={size} style={{borderRadius:8, background:'#fff', boxShadow:'0 0 0 1px rgba(0,0,0,.06)'}} />
}

function hexNoHash(hex) { return (hex || '').replace('#','') }
function buildLoreleiUrl(cfg, size) {
  const base = 'https://api.dicebear.com/9.x/lorelei/svg'
  const q = new URLSearchParams()
  q.set('seed', cfg.seed || 'zelia')
  q.set('size', String(size))
  q.set('radius', String(cfg.radius ?? 30))
  if (cfg.bg) {
    q.set('backgroundType', 'solid')
    q.set('backgroundColor', hexNoHash(cfg.bg))
  }
  if (cfg.skin) q.set('skinColor', hexNoHash(cfg.skin))
  if (cfg.hair) q.set('hairColor', hexNoHash(cfg.hair))
  if (cfg.glasses === true) {
    q.set('accessories', 'glasses')
    q.set('accessoriesProbability', '100')
  } else {
    q.set('accessoriesProbability', '0')
  }
  return `${base}?${q.toString()}`
}

export default function Questionnaire() {
  const [questions, setQuestions] = useState([])
  const [idx, setIdx] = useState(0)
  const [answers, setAnswers] = useState(() => {
    try { return JSON.parse(localStorage.getItem('answers_progress')||'{}') } catch { return {} }
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    (async () => {
      try {
  const { data } = await axios.get('/api/questionnaire/questions')
        setQuestions(data)
      } catch (e) {
        setError('Impossible de charger les questions')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const current = questions[idx]
  const displayText = useMemo(() => {
    const raw = current?.contenu
    if (typeof raw !== 'string') return raw
    if (raw.startsWith('(')) {
      const i1 = raw.indexOf('"')
      const i2 = raw.indexOf('"', i1 + 1)
      if (i1 !== -1 && i2 !== -1) return raw.slice(i1 + 1, i2)
    }
    return raw
  }, [current])
  const choices = useMemo(()=>['Oui','Un peu','Je ne sais pas','Pas trop','Non'],[])

  async function finishSubmit() {
    const payload = { answers: Object.entries(answers).map(([qid, ans]) => ({ question_id: Number(qid), answer: ans })) }
    
    // Check if user is actually authenticated (has valid session)
    const token = localStorage.getItem('supabase_auth_token') || localStorage.getItem('token')
    let isAuthenticated = false
    
    if (token) {
      try {
        // Verify token is valid by making a test call
        const headers = { Authorization: `Bearer ${token}` }
        await axios.get('/api/users/me', { headers })
        isAuthenticated = true
      } catch (e) {
        // Token is invalid or expired, remove it
        localStorage.removeItem('supabase_auth_token')
        localStorage.removeItem('token')
        isAuthenticated = false
      }
    }
    
    if (isAuthenticated) {
      try {
        const headers = { Authorization: `Bearer ${token}` }
        await axios.post('/api/questionnaire/submit', payload, { headers })
        await axios.post('/api/results/generate', {}, { headers })
        // optional: persist a cache for resilience
        localStorage.setItem('answers_cache', JSON.stringify(payload))
        navigate('/app/results')
        return
      } catch (e) {
        console.warn('Failed to submit authenticated questionnaire:', e)
        // fallback to registration path if API failed
      }
    }
    
    // Cache answers for registration
    localStorage.setItem('answers_cache', JSON.stringify(payload))
    // Continue the onboarding to the registration step (Avatar → Questionnaire → Registration)
    navigate('/register?after=results')
  }

  function choose(ans) {
    const qid = current?.id
    if (!qid) return
    const next = idx + 1
    const newAnswers = { ...answers, [qid]: ans }
    setAnswers(newAnswers)
    localStorage.setItem('answers_progress', JSON.stringify(newAnswers))
    if (next < questions.length) setIdx(next)
  }

  const progress = questions.length ? Math.round(((idx + 1) / questions.length) * 100) : 0
  const answered = current ? answers[current.id] != null : false

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center text-text-secondary">Chargement…</div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen grid place-items-center text-red-600">{error}</div>
    )
  }

  return (
    <div className="min-h-screen bg-white text-text-primary flex items-center justify-center px-4">
      <div className="w-full max-w-3xl py-10">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Questionnaire</h1>
            <p className="text-text-secondary">Répondez pour affiner votre profil et vos recommandations.</p>
          </div>
          <div className="hidden sm:block"><SideAvatar size={72} /></div>
        </div>

        <div className="mb-4">
          <div className="w-full bg-line h-2 rounded-full overflow-hidden">
            <div className="h-full bg-black" style={{width:`${progress}%`}}></div>
          </div>
          <div className="flex items-center justify-between mt-2 text-sm text-text-secondary">
            <span>{Math.min(idx+1, questions.length)} / {questions.length}</span>
            <span>{progress}%</span>
          </div>
        </div>

        <div className="bg-surface border border-line rounded-xl shadow-card p-6">
          <h2 className="text-lg font-semibold mb-3">{displayText}</h2>
          <div className="flex flex-wrap gap-2">
            {choices.map((opt, i) => (
              <button
                key={i}
                type="button"
                className={`px-3 py-2 rounded-lg border ${answers[current?.id]===opt ? 'border-black':'border-line'}`}
                onClick={() => choose(opt)}
              >
                {opt}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between mt-6">
            <button
              type="button"
              className="h-10 px-4 rounded-lg border border-line disabled:opacity-50"
              onClick={() => setIdx(i => Math.max(0, i-1))}
              disabled={idx===0}
            >
              Précédent
            </button>
            {idx === questions.length - 1 && (
              <button
                type="button"
                className="h-10 px-4 rounded-lg bg-black text-white disabled:opacity-50"
                onClick={finishSubmit}
                disabled={!answered}
              >
                Terminer
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
