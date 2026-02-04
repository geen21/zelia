import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usersAPI } from '../../lib/api'
import { XP_PER_LEVEL, levelUp } from '../../lib/progression'
import { supabase } from '../../lib/supabase'
import { buildAvatarFromProfile } from '../../lib/avatar'

const VIDEO_ID = 'QMwfhMb6cxA'
const VIDEO_TITLE = 'Se motiver et avancer'

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

export default function Niveau35() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [avatarUrl, setAvatarUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [idx, setIdx] = useState(0)
  const [phase, setPhase] = useState('intro') // intro -> watch -> success
  const playerRef = useRef(null)
  const playerReadyRef = useRef(false)
  const [showSuccess, setShowSuccess] = useState(false)

  const firstName = profile?.first_name || 'toi'

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

  const messages = useMemo(() => ([
    { text: `On va t'aider à te motiver, Nicolas de Zélia va te donner quelques conseils !`, durationMs: 2600 },
    { text: `Je te laisse avec la vidéo : ${VIDEO_TITLE}, ça t'aidera peut-être.`, durationMs: 2400 },
  ]), [])

  const current = messages[idx] || { text: '', durationMs: 1500 }
  const { text: typed, done: typedDone, skip } = useTypewriter(current.text, current.durationMs)

  useEffect(() => {
    if (phase !== 'watch') return

    function onYouTubeIframeAPIReady() {
      if (playerRef.current || playerReadyRef.current) return
      try {
        const YTGlobal = window.YT
        if (!YTGlobal || !YTGlobal.Player) return
        playerRef.current = new YTGlobal.Player('niv35Player', {
          height: '100%',
          width: '100%',
          videoId: VIDEO_ID,
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

  function finishLevel() {
    setShowSuccess(true)
    ;(async () => {
      try {
        // Save video watched to extra info
        await usersAPI.saveExtraInfo([
          {
            question_id: 'niveau35_video_completed',
            question_text: 'Vidéo motivation',
            answer_text: JSON.stringify({
              videoId: VIDEO_ID,
              videoTitle: VIDEO_TITLE,
              completedAt: new Date().toISOString()
            })
          }
        ]).catch(e => console.warn('saveExtraInfo N35 failed', e))
        
        await levelUp({ minLevel: 35, xpReward: XP_PER_LEVEL })
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
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-card">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
            <img src={avatarUrl} alt="Avatar" className="w-28 h-28 sm:w-36 sm:h-36 md:w-44 md:h-44 lg:w-52 lg:h-52 rounded-2xl border border-gray-100 shadow-sm object-contain bg-white mx-auto md:mx-0" />
            <div className="flex-1 w-full">
              <div className="relative bg-black text-white rounded-2xl p-4 md:p-5 w-full">
                <div className="text-base md:text-lg leading-relaxed whitespace-pre-wrap min-h-[3.5rem]">
                  {phase === 'intro' ? typed : phase === 'watch' ? 'Regarde la vidéo à droite, puis termine le niveau.' : null}
                </div>
                <div className="absolute -left-2 top-6 w-0 h-0 border-t-8 border-b-8 border-r-8 border-t-transparent border-b-transparent border-r-black" />
              </div>

              {phase === 'intro' && (
                <div className="mt-4">
                  <button onClick={next} className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200 w-full sm:w-auto">
                    {idx === messages.length - 1 ? 'Voir la vidéo' : 'Suivant'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-card">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center text-white font-bold">35</div>
            <h2 className="text-xl font-bold">Vidéo</h2>
          </div>
          {phase !== 'watch' ? (
            <div className="text-text-secondary">La vidéo apparaîtra ici.</div>
          ) : (
            <div>
              <div className="relative w-full overflow-hidden rounded-xl" style={{ paddingTop: '56.25%' }}>
                <div id="niv35Player" className="absolute inset-0 w-full h-full" />
              </div>
              <noscript>
                <iframe
                  width="560"
                  height="315"
                  src={`https://www.youtube.com/embed/${VIDEO_ID}`}
                  title={VIDEO_TITLE}
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

      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="relative bg-white border border-gray-200 rounded-2xl p-8 shadow-2xl text-center max-w-md w-11/12">
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 w-10 h-10 bg-[#c1ff72] rounded-full flex items-center justify-center shadow-md animate-bounce font-bold">35</div>
            <h3 className="text-2xl font-extrabold mb-2">Niveau 35 terminé !</h3>
            <p className="text-text-secondary mb-4">Bravo, tu as regardé la vidéo.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button onClick={() => navigate('/app/activites')} className="px-4 py-2 rounded-lg bg-white text-gray-900 border border-gray-200">Retour aux activités</button>
              <button onClick={() => navigate('/app/niveau/36')} className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200">Niveau suivant</button>
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