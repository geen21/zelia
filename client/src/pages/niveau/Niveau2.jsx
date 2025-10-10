import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usersAPI } from '../../lib/api'
import { levelUp } from '../../lib/progression'
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

export default function Niveau2() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [baseAvatarUrl, setBaseAvatarUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [idx, setIdx] = useState(0)
  const [phase, setPhase] = useState('intro') // intro -> watch -> success
  const playerRef = useRef(null)
  const playerReadyRef = useRef(false)
  const [mouthAlt, setMouthAlt] = useState(false)
  const [userId, setUserId] = useState('')

  // Load profile + set avatar
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { navigate('/login'); return }
        setUserId(user.id)
        const pRes = await usersAPI.getProfile().catch(() => null)
        if (!mounted) return
        const prof = pRes?.data?.profile || null
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

  const messages = useMemo(() => ([
    { text: "Bon t'es passé au niveau 2, c'était assez simple mais ça se corsera plus tard, pour l'instant on a besoin de comprendre à qui on a affaire et t'expliquer tous les futurs niveaux", durationMs: 8000 },
    { text: "On va te faire rencontrer une personne qui était plus ou moins dans ton cas", durationMs: 3000 },
    { text: "C'est nicolas, le fondateur de la plateforme Zélia qui a fait une vidéo pour toi", durationMs: 3000 },
    { text: "Le but c'est de t'expliquer les bases de l'orientation, de pourquoi c'est important, même si tu le sais probablement déjà", durationMs: 7500 },
    { text: "Je te laisse voir cette vidéo, tu pourras avoir son retour d'expérience avec l'orientation et comment il s'en est sorti", durationMs: 4000 },
    { text: "Bon faut vraiment que j'arrête de parler moi", durationMs: 1500 },
  ]), [])

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
      // ensure size default for consistency
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

    // Eyes: if on the last dialogue line, switch to variant16
    if (phase === 'intro' && idx === 5) {
      url = modifyDicebearUrl(url, { eyes: 'variant16' })
    } else {
      // keep original eyes
      url = modifyDicebearUrl(url, {})
    }

    // Mouth animation: while typing, toggle between default and happy08
    if (phase === 'intro' && !typedDone) {
      url = modifyDicebearUrl(url, { mouth: mouthAlt ? 'happy08' : null })
    } else {
      // ensure we don't force an animated mouth once finished
      url = modifyDicebearUrl(url, { mouth: null })
    }
    return url
  }, [baseAvatarUrl, phase, idx, typedDone, mouthAlt])

  // Setup YouTube Player API when entering watch phase
  useEffect(() => {
    if (phase !== 'watch') return

    function onYouTubeIframeAPIReady() {
      if (playerRef.current || playerReadyRef.current) return
      try {
        // eslint-disable-next-line no-undef
        const YTGlobal = window.YT
        if (!YTGlobal || !YTGlobal.Player) return
        playerRef.current = new YTGlobal.Player('niv2Player', {
          height: '100%',
          width: '100%',
          videoId: 'JBEFI62HPsE',
          playerVars: {
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
          },
          events: {
            onReady: () => {
              playerReadyRef.current = true
              try {
                const iframe = playerRef.current?.getIframe?.()
                if (iframe) {
                  iframe.style.width = '100%'
                  iframe.style.height = '100%'
                  iframe.style.position = 'absolute'
                  iframe.style.top = '0'
                  iframe.style.left = '0'
                }
              } catch {}
            },
            onStateChange: (event) => {
              // eslint-disable-next-line no-undef
              if (event.data === window.YT.PlayerState.ENDED) {
                finishLevel()
              }
            }
          }
        })
      } catch (e) {
        console.warn('YT init failed', e)
      }
    }

    // Load API if needed
    if (!window.YT || !window.YT.Player) {
      const existing = document.getElementById('youtube-iframe-api')
      if (!existing) {
        const tag = document.createElement('script')
        tag.src = 'https://www.youtube.com/iframe_api'
        tag.id = 'youtube-iframe-api'
        document.body.appendChild(tag)
      }
      const prev = window.onYouTubeIframeAPIReady
      window.onYouTubeIframeAPIReady = function () {
        if (typeof prev === 'function') try { prev() } catch {}
        onYouTubeIframeAPIReady()
      }
    } else {
      onYouTubeIframeAPIReady()
    }

    return () => {
      try {
        const p = playerRef.current
        if (p && p.destroy) p.destroy()
      } catch {}
      playerRef.current = null
      playerReadyRef.current = false
    }
  }, [phase])

  function next() {
    if (!typedDone) { skip(); return }
    if (idx + 1 < messages.length) setIdx((v) => v + 1)
    else setPhase('watch')
  }

  const [showSuccess, setShowSuccess] = useState(false)

  function finishLevel() {
    setShowSuccess(true)
    // Award XP + increment by exactly one level (or enforce minimum level 2 if user somehow below)
    ;(async () => {
      try {
        const baseXpReward = 120
        await levelUp({ minLevel: 2, xpReward: baseXpReward })
      } catch (e) {
        console.warn('Progression update failed (non-blocking):', e)
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Left: Avatar + Dialogue */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-card">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
            <img src={displayedAvatarUrl} alt="Avatar" className="w-40 h-40 sm:w-48 sm:h-48 md:w-64 md:h-64 rounded-2xl border border-gray-100 shadow-sm object-contain bg-white mx-auto md:mx-0" />
            <div className="flex-1 w-full">
              <div className="relative bg-black text-white rounded-2xl p-4 md:p-5 w-full">
                <div className="text-base md:text-lg leading-relaxed whitespace-pre-wrap min-h-[3.5rem]">
                  {phase === 'intro' ? (
                    <>{typed}</>
                  ) : phase === 'watch' ? (
                    <>Regarde la vidéo à droite, puis on continue.</>
                  ) : null}
                </div>
                <div className="absolute -left-2 top-6 w-0 h-0 border-t-8 border-b-8 border-r-8 border-t-transparent border-b-transparent border-r-black" />
              </div>

              {phase === 'intro' && (
                <div className="mt-4">
                  <button onClick={next} className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200 w-full sm:w-auto">
                    {idx === messages.length - 1 ? 'Oui laisse moi voir la vidéo' : 'Suivant'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Video */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-card">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center text-white">🎬</div>
            <h2 className="text-xl font-bold">Vidéo</h2>
          </div>
          {phase !== 'watch' ? (
            <div className="text-text-secondary">La vidéo apparaîtra ici.</div>
          ) : (
            <div>
              {/* API-rendered player for end detection */}
              <div className="relative w-full overflow-hidden rounded-xl" style={{ paddingTop: '56.25%' }}>
                <div id="niv2Player" className="absolute inset-0 w-full h-full" />
              </div>
              {/* Fallback iframe display (no end detection) */}
              <noscript>
                <iframe
                  width="560"
                  height="315"
                  src="https://www.youtube.com/embed/JBEFI62HPsE?si=KuNhAbh9S4bRYbX2"
                  title="YouTube video player"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              </noscript>
              <div className="mt-4">
                <button onClick={finishLevel} className="px-4 py-2 rounded-lg bg-white text-gray-900 border border-gray-300 w-full sm:w-auto">J'ai terminé la vidéo</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Success overlay for Level 2 completion */}
      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="relative bg-white border border-gray-200 rounded-2xl p-8 shadow-2xl text-center max-w-md w-11/12">
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 w-10 h-10 bg-[#c1ff72] rounded-full flex items-center justify-center shadow-md animate-bounce">🏆</div>
            <h3 className="text-2xl font-extrabold mb-2">Niveau 2 réussi !</h3>
            <p className="text-text-secondary mb-4">Bravo, tu as regardé la vidéo d'introduction à l'orientation.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button onClick={() => navigate('/app/activites')} className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200">Retour aux activités</button>
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
