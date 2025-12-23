import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import apiClient, { usersAPI } from '../../lib/api'
import { XP_PER_LEVEL, levelUp } from '../../lib/progression'
import { supabase } from '../../lib/supabase'

// Helper: build avatar URL from profile preferences, preferring explicit avatar_url
function buildAvatarFromProfile(profile, seed = 'zelia') {
  try {
    if (profile?.avatar_url && typeof profile.avatar_url === 'string') {
      return profile.avatar_url
    }
    if (profile?.avatar && typeof profile.avatar === 'string') {
      return profile.avatar
    }
    if (profile?.avatar_json) {
      let conf = profile.avatar_json
      if (typeof conf === 'string') {
        try { conf = JSON.parse(conf) } catch {}
      }
      if (conf && typeof conf === 'object') {
        if (conf.url && typeof conf.url === 'string') {
          try {
            const u = new URL(conf.url)
            if (!u.searchParams.has('seed')) u.searchParams.set('seed', String(seed))
            if (!u.searchParams.has('size')) u.searchParams.set('size', '300')
            return u.toString()
          } catch {}
        }
        const params = new URLSearchParams()
        params.set('seed', String(seed))
        Object.entries(conf).forEach(([k, v]) => {
          if (v !== undefined && v !== null && v !== '') params.set(k, String(v))
        })
        if (!params.has('size')) params.set('size', '300')
        return `https://api.dicebear.com/9.x/lorelei/svg?${params.toString()}`
      }
    }
  } catch {}
  const p = new URLSearchParams({ seed: String(seed), size: '300', radius: '15' })
  return `https://api.dicebear.com/9.x/lorelei/svg?${p.toString()}`
}

// Typewriter for a single message with adjustable overall duration
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

export default function Niveau13() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [baseAvatarUrl, setBaseAvatarUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [idx, setIdx] = useState(0)
  // phases: intro -> practice -> rate -> feedback|success
  const [phase, setPhase] = useState('intro')
  const [mouthAlt, setMouthAlt] = useState(false)
  const [userId, setUserId] = useState('')

  const [jobTitleFromResults, setJobTitleFromResults] = useState('')

  // recording state
  const mediaRecorderRef = useRef(null)
  const [recording, setRecording] = useState(false)
  const chunksRef = useRef([])
  const [audioUrl, setAudioUrl] = useState('')
  const [rating, setRating] = useState(null) // Start with null to force user interaction
  const [showSuccess, setShowSuccess] = useState(false)
  const [showFeedback, setShowFeedback] = useState(false)

  // Load profile + set avatar + results
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

        // Fetch results to decide preferred job title if needed
        try {
          const anal = await apiClient.get('/analysis/my-results', { headers: { 'Cache-Control': 'no-cache' }, params: { _: Date.now() } })
          const r = anal?.data?.results || {}
          const list = r.jobRecommendations || r.job_recommandations || []
          if (Array.isArray(list) && list.length > 0) setJobTitleFromResults(list[0]?.title || '')
        } catch {
          try {
            const latest = await apiClient.get('/results/latest', { headers: { 'Cache-Control': 'no-cache' }, params: { _: Date.now() } })
            const simple = latest?.data?.results?.analysis || latest?.data?.results || {}
            const list = simple.jobRecommendations || simple.job_recommandations || simple.career_matches || []
            if (Array.isArray(list) && list.length > 0) setJobTitleFromResults(list[0]?.title || '')
          } catch {}
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

  const messages = useMemo(() => {
    const prenom = (profile?.first_name || '').trim()
    const intro = `Re ! En avant pour le niveau 13${prenom ? ` ${prenom}` : ''}. On va entrer dans le vif du sujet, avec un module pour apprendre à se présenter à l’oral.`
    return ([
      { text: intro, durationMs: 3200 },
      { text: "L’idée c’est de pouvoir te présenter en 1 minute, ce qu’on appelle un “pitch”. Prends le micro et enregistre-toi jusqu’à ce que tu aies une présentation dont tu es fier/fière.", durationMs: 4200 },
      { text: "Je sais que ça peut paraître un peu complexe ou te mettre mal à l'aise. Isole-toi si c'est le cas.", durationMs: 3000 },
      { text: "Je te donne un texte d’exemple. Tu peux le répéter tel quel ou l’adapter. Tant que tu ne te donnes pas au moins 8/10, tu peux recommencer ;)", durationMs: 4000 },
    ])
  }, [profile])

  const current = messages[idx] || { text: '', durationMs: 1500 }
  const { text: typed, done: typedDone, skip } = useTypewriter(current.text, current.durationMs)

  // Animate mouth every 0.2s while typing
  useEffect(() => {
    if (phase !== 'intro' || typedDone) return
    const int = setInterval(() => setMouthAlt((v) => !v), 200)
    return () => clearInterval(int)
  }, [phase, typedDone])

  // Helper to modify DiceBear lorelei URL params
  function modifyDicebearUrl(urlStr, params = {}) {
    try {
      const u = new URL(urlStr)
      const isDice = /api\.dicebear\.com/.test(u.host) && /\/lorelei\/svg/.test(u.pathname)
      if (!isDice) return urlStr
      Object.entries(params).forEach(([k, v]) => {
        if (v === null || v === undefined || v === '') {
          u.searchParams.delete(k)
        } else {
          u.searchParams.set(k, String(v))
        }
      })
      if (!u.searchParams.has('size')) u.searchParams.set('size', '300')
      return u.toString()
    } catch {
      return urlStr
    }
  }

  const displayedAvatarUrl = useMemo(() => {
    let url = baseAvatarUrl
    if (!url) return url
    const isDicebear = (() => {
      try { const u = new URL(url); return /api\.dicebear\.com/.test(u.host) && /\/lorelei\/svg/.test(u.pathname) } catch { return false }
    })()
    if (!isDicebear) return url

    // Eyes: last intro line -> variant16
    if (phase === 'intro' && idx === 3) {
      url = modifyDicebearUrl(url, { eyes: 'variant16' })
    } else {
      url = modifyDicebearUrl(url, {})
    }

    // Mouth animation while typing
    if (phase === 'intro' && !typedDone) {
      url = modifyDicebearUrl(url, { mouth: mouthAlt ? 'happy08' : null })
    } else {
      url = modifyDicebearUrl(url, { mouth: null })
    }
    return url
  }, [baseAvatarUrl, phase, idx, typedDone, mouthAlt])

  function next() {
    if (!typedDone) { skip(); return }
    if (idx + 1 < messages.length) setIdx((v) => v + 1)
    else setPhase('practice')
  }

  // Pitch text computed from profile and results
  const pitchText = useMemo(() => {
    const fn = profile?.first_name || ''
    const ln = profile?.last_name || ''
    const dep = profile?.department || ''
    const pref = profile?.home_preference || ''
    const jobTitle = (String(pref).toLowerCase() === 'questionnaire')
      ? (jobTitleFromResults || 'un métier qui me correspond')
      : (pref || jobTitleFromResults || 'un métier qui me correspond')
    return (
      `Bonjour, je m'appelle ${fn} ${ln}, j'habite actuellement dans le ${dep}. ` +
      `Ce qui me motive profondément dans le métier de ${jobTitle}, c’est de comprendre comment les choses fonctionnent et comment les améliorer. ` +
      `Je ne me contente jamais de la première réponse ; ma curiosité me pousse à explorer différentes perspectives avant d’agir.\n\n` +
      `J'aborde chaque nouveau défi avec la même méthode : j’écoute, j’apprends vite, et je connecte les idées et les gens pour construire quelque chose qui a du sens. ` +
      `Je crois fermement que les meilleures solutions naissent de la collaboration et d'une vision d'ensemble.\n\n` +
      `Mon objectif n'est pas simplement d'accomplir des tâches, mais d'apporter une énergie positive et une volonté de faire avancer les projets. ` +
      `Je cherche à m'investir dans un environnement où je pourrai continuer à apprendre et avoir un impact concret.`
    )
  }, [profile, jobTitleFromResults])

  // Recording handlers
  const startRecording = async () => {
    try {
      setShowFeedback(false)
      setAudioUrl('')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      chunksRef.current = []
      mr.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        const url = URL.createObjectURL(blob)
        setAudioUrl(url)
        setPhase('rate')
        setRecording(false)
        // stop all tracks
        stream.getTracks().forEach(t => t.stop())
      }
      mediaRecorderRef.current = mr
      mr.start()
      setRecording(true)
    } catch (e) {
      console.error('Recording start failed', e)
      alert('Impossible d’accéder au micro. Autorisez le micro puis réessayez.')
    }
  }

  const stopRecording = () => {
    try {
      mediaRecorderRef.current?.stop()
    } catch {}
  }

  const resetPractice = () => {
    setAudioUrl('')
    setRating(null) // Reset to null
    setPhase('practice')
  }

  const submitRating = async () => {
    if (rating >= 8) {
      setShowSuccess(true)
      // Level up by +1 (ensure minimum 3)
      ;(async () => {
        try {
          await levelUp({ minLevel: 13, xpReward: XP_PER_LEVEL })
        } catch (e) { console.warn('Progression update failed (non-blocking):', e) }
      })()
    } else {
      setShowFeedback(true)
      // After showing feedback message, let user restart practice
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
            <img src={displayedAvatarUrl} alt="Avatar" className="w-28 h-28 sm:w-36 sm:h-36 md:w-44 md:h-44 lg:w-52 lg:h-52 xl:w-60 xl:h-60 2xl:w-64 2xl:h-64 rounded-2xl border border-gray-100 shadow-sm object-contain bg-white mx-auto md:mx-0" />
            <div className="flex-1 w-full">
              <div className="relative bg-black text-white rounded-2xl p-4 md:p-5 w-full">
                <div className="text-base md:text-lg leading-relaxed whitespace-pre-wrap min-h-[3.5rem]">
                  {phase === 'intro' ? (
                    <>{typed}</>
                  ) : phase === 'practice' ? (
                    <>Tu peux maintenant lire le texte d’exemple et t'enregistrer quand tu veux.</>
                  ) : phase === 'rate' ? (
                    <>
                      <div className="mb-4">Alors combien tu te noterais sur 10 ?</div>
                      
                      {/* Custom slider with visual feedback */}
                      <div className="mb-4">
                        <div className="flex flex-wrap justify-center gap-2 mb-3">
                          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((val) => (
                            <button
                              key={val}
                              type="button"
                              onClick={() => setRating(val)}
                              className={`w-9 h-9 md:w-10 md:h-10 lg:w-11 lg:h-11 rounded-full font-bold text-sm md:text-base transition-all ${
                                rating === val
                                  ? (val >= 8 ? 'bg-[#F68FFF] text-black ring-2 ring-black' : 'bg-[#c1ff72] text-black ring-2 ring-black')
                                  : rating !== null && val <= rating
                                  ? (val >= 8 ? 'bg-[#F68FFF]/40 text-black' : 'bg-[#c1ff72]/40 text-black')
                                  : 'bg-white/20 text-white/60 hover:bg-white/30'
                              }`}
                            >
                              {val}
                            </button>
                          ))}
                        </div>
                        
                        {/* Visual bar showing the rating */}
                        <div className="relative h-2 bg-white/20 rounded-full overflow-hidden mx-2">
                          <div
                            className="absolute top-0 left-0 h-full bg-[#c1ff72] rounded-full transition-all duration-300"
                            style={{ width: `${rating !== null ? (rating * 10) : 0}%` }}
                          />
                        </div>
                        
                        {rating !== null && (
                          <div className="text-center mt-2 text-[#c1ff72] font-bold text-lg">
                            {rating}/10
                          </div>
                        )}
                      </div>
                      
                      <button 
                        onClick={submitRating} 
                        disabled={rating === null}
                        className={`mt-3 px-4 py-2 rounded-lg border border-gray-200 w-full sm:w-auto transition-all ${
                          rating === null 
                            ? 'bg-gray-400 text-gray-600 cursor-not-allowed' 
                            : 'bg-[#c1ff72] text-black hover:bg-[#b3ee5f]'
                        }`}
                      >
                        Valider
                      </button>
                    </>
                  ) : showFeedback ? (
                    <>C'est déjà pas trop mal, on va essayer de le refaire, recommençons ensemble.</>
                  ) : null}
                </div>
                <div className="absolute -left-2 top-6 w-0 h-0 border-t-8 border-b-8 border-r-8 border-t-transparent border-b-transparent border-r-black" />
              </div>

              {phase === 'intro' && (
                <div className="mt-4">
                  <button onClick={next} className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200 w-full sm:w-auto">
                    {idx === messages.length - 1 ? 'Afficher le texte' : 'Suivant'}
                  </button>
                </div>
              )}

              {showFeedback && phase !== 'intro' && (
                <div className="mt-4">
                  <button onClick={resetPractice} className="px-4 py-2 rounded-lg bg-white text-gray-900 border border-gray-300 w-full sm:w-auto">Recommencer</button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Pitch + Recorder */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-card">
          {/* Controls moved above the title */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            {!recording && (
              <button onClick={startRecording} className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200">S'enregistrer</button>
            )}
            {recording && (
              <button onClick={stopRecording} className="px-4 py-2 rounded-lg bg-red-500 text-white border border-red-600">Arrêter</button>
            )}
            {audioUrl && !recording && (
              <>
                <audio controls src={audioUrl} className="w-full max-w-md" />
                <button onClick={resetPractice} className="px-4 py-2 rounded-lg bg-white text-gray-900 border border-gray-300">Réenregistrer</button>
              </>
            )}
          </div>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center text-white">🎤</div>
            <h2 className="text-xl font-bold">Pitch 60s</h2>
          </div>
          {phase !== 'intro' ? (
            <div className="text-text-primary whitespace-pre-wrap mb-4">{pitchText}</div>
          ) : (
            <div className="text-text-secondary text-sm mb-4">Le texte d’exemple s’affichera après avoir cliqué sur « Afficher le texte ».</div>
          )}
        </div>
      </div>

      {/* Success overlay for Level 13 completion */}
      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="relative bg-white border border-gray-200 rounded-2xl p-8 shadow-2xl text-center max-w-md w-11/12">
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 w-10 h-10 bg-[#c1ff72] rounded-full flex items-center justify-center shadow-md animate-bounce">🏆</div>
            <h3 className="text-2xl font-extrabold mb-2">Niveau 13 réussi !</h3>
            <p className="text-text-secondary mb-4">Félicitations, ton pitch est prêt. Tu sais te présenter efficacement.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button onClick={() => navigate('/app/activites')} className="px-4 py-2 rounded-lg bg-white text-gray-900 border border-gray-200">Retour aux activités</button>
              <button onClick={() => navigate('/app/niveau/14')} className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200">Passer au niveau suivant</button>
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
