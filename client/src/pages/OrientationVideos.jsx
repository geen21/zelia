import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { usersAPI } from '../lib/api'
import {
  ORIENTATION_VIDEO_COMPLETION_ID,
  ORIENTATION_VIDEO_ITEMS
} from '../lib/videoToolSequence'

function getEntryIds(entries = []) {
  return new Set(entries.map((entry) => String(entry?.question_id || '').toLowerCase()).filter(Boolean))
}

export default function OrientationVideos() {
  const navigate = useNavigate()
  const [activeLevel, setActiveLevel] = useState(ORIENTATION_VIDEO_ITEMS[0]?.level || 2)
  const [watchedIds, setWatchedIds] = useState(() => new Set())
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState('')
  const [error, setError] = useState('')

  const activeVideo = useMemo(
    () => ORIENTATION_VIDEO_ITEMS.find((video) => video.level === activeLevel) || ORIENTATION_VIDEO_ITEMS[0],
    [activeLevel]
  )
  const activeIndex = ORIENTATION_VIDEO_ITEMS.findIndex((video) => video.level === activeVideo?.level)
  const nextVideo = ORIENTATION_VIDEO_ITEMS[activeIndex + 1] || null
  const watchedCount = ORIENTATION_VIDEO_ITEMS.filter((video) => watchedIds.has(video.questionId.toLowerCase())).length
  const allComplete = watchedCount === ORIENTATION_VIDEO_ITEMS.length
  const progress = Math.round((watchedCount / ORIENTATION_VIDEO_ITEMS.length) * 100)
  const currentWatched = activeVideo ? watchedIds.has(activeVideo.questionId.toLowerCase()) : false

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const response = await usersAPI.getExtraInfo()
        if (!active) return
        const ids = getEntryIds(response?.data?.entries || [])
        if (ids.has(ORIENTATION_VIDEO_COMPLETION_ID)) {
          ORIENTATION_VIDEO_ITEMS.forEach((video) => ids.add(video.questionId.toLowerCase()))
        }
        setWatchedIds(ids)
      } catch (loadError) {
        console.warn('Orientation videos progress load failed:', loadError)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [])

  async function markWatched(video, { continueAfter = false } = {}) {
    if (!video || savingId) return

    const nextWatched = new Set(watchedIds)
    nextWatched.add(video.questionId.toLowerCase())
    const nextVideoCount = ORIENTATION_VIDEO_ITEMS.filter((item) => nextWatched.has(item.questionId.toLowerCase())).length
    const completesPlaylist = nextVideoCount === ORIENTATION_VIDEO_ITEMS.length
    const entries = [
      {
        question_id: video.questionId,
        question_text: video.questionText,
        answer_text: JSON.stringify({
          videoId: video.videoId,
          watchedAt: new Date().toISOString(),
          source: 'orientation-videos'
        })
      }
    ]

    if (completesPlaylist && !watchedIds.has(ORIENTATION_VIDEO_COMPLETION_ID)) {
      nextWatched.add(ORIENTATION_VIDEO_COMPLETION_ID)
      entries.push({
        question_id: ORIENTATION_VIDEO_COMPLETION_ID,
        question_text: 'Playlist vidéos orientation terminée',
        answer_text: new Date().toISOString()
      })
    }

    setSavingId(video.questionId)
    setError('')
    try {
      await usersAPI.saveExtraInfo(entries)
      setWatchedIds(nextWatched)
      if (continueAfter && nextVideo) {
        setActiveLevel(nextVideo.level)
      } else if (continueAfter && !nextVideo) {
        navigate('/app', { replace: true })
      }
    } catch (saveError) {
      console.error('Orientation video save failed:', saveError)
      setError("Impossible d'enregistrer la vidéo pour le moment.")
    } finally {
      setSavingId('')
    }
  }

  function handlePrimaryAction() {
    if (!activeVideo) return
    if (currentWatched) {
      if (nextVideo) setActiveLevel(nextVideo.level)
      else navigate('/app', { replace: true })
      return
    }
    markWatched(activeVideo, { continueAfter: true })
  }

  const primaryLabel = currentWatched
    ? nextVideo ? 'Vidéo suivante' : 'Terminer'
    : nextVideo ? 'Valider et continuer' : 'Valider et terminer'

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Chargement des vidéos...</div>
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Module vidéo</p>
          <h1 className="text-2xl font-semibold tracking-normal text-gray-950">Vidéos orientation</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Un seul parcours vidéo pour retrouver les contenus orientation, métiers, études, oral et motivation.
          </p>
        </div>
        <Link
          to="/app/outils"
          className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-900 hover:border-black"
        >
          Retour aux outils
        </Link>
      </div>

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-card">
        <div className="mb-2 flex items-center justify-between gap-3 text-sm">
          <span className="font-semibold text-gray-900">Progression</span>
          <span className="text-gray-500">{watchedCount}/{ORIENTATION_VIDEO_ITEMS.length}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full rounded-full bg-[#c1ff72] transition-all" style={{ width: `${progress}%` }} />
        </div>
      </section>

      {error && (
        <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[330px_minmax(0,1fr)]">
        <aside className="space-y-2">
          {ORIENTATION_VIDEO_ITEMS.map((video, index) => {
            const watched = watchedIds.has(video.questionId.toLowerCase())
            const active = video.level === activeVideo.level
            return (
              <button
                key={video.level}
                type="button"
                onClick={() => setActiveLevel(video.level)}
                className={`w-full rounded-lg border p-3 text-left transition ${active ? 'border-black bg-white' : 'border-gray-200 bg-white hover:border-gray-300'} ${watched ? 'shadow-sm' : ''}`}
              >
                <div className="flex items-start gap-3">
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-bold ${watched ? 'bg-[#c1ff72] text-black' : 'bg-gray-100 text-gray-500'}`}>
                    {watched ? <i className="ph ph-check" aria-hidden="true" /> : index + 1}
                  </span>
                  <span className="min-w-0">
                    <strong className="block text-sm font-semibold text-gray-950">{video.title}</strong>
                    <small className="mt-1 block text-xs leading-relaxed text-gray-500">{video.description}</small>
                  </span>
                </div>
              </button>
            )
          })}
        </aside>

        <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-card">
          <div className="aspect-video w-full bg-black">
            <iframe
              key={activeVideo.videoId}
              className="h-full w-full"
              src={`https://www.youtube.com/embed/${activeVideo.videoId}?rel=0&modestbranding=1&playsinline=1`}
              title={activeVideo.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
          <div className="space-y-4 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase text-gray-500">Vidéo {activeIndex + 1}</p>
                <h2 className="mt-1 text-xl font-semibold text-gray-950">{activeVideo.title}</h2>
                <p className="mt-1 text-sm text-gray-500">{activeVideo.description}</p>
              </div>
              {currentWatched && (
                <span className="inline-flex h-8 items-center rounded-full bg-[#c1ff72] px-3 text-xs font-bold text-black">
                  Vue
                </span>
              )}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              {!currentWatched && (
                <button
                  type="button"
                  onClick={() => markWatched(activeVideo)}
                  disabled={Boolean(savingId)}
                  className="inline-flex h-11 items-center justify-center rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-900 hover:border-black disabled:opacity-60"
                >
                  {savingId === activeVideo.questionId ? 'Validation...' : 'Marquer comme vue'}
                </button>
              )}
              <button
                type="button"
                onClick={handlePrimaryAction}
                disabled={Boolean(savingId)}
                className="inline-flex h-11 items-center justify-center rounded-lg bg-black px-4 text-sm font-semibold text-white hover:bg-gray-900 disabled:opacity-60"
              >
                {savingId === activeVideo.questionId ? 'Validation...' : primaryLabel}
              </button>
            </div>
          </div>
        </section>
      </div>

      {allComplete && (
        <section className="rounded-lg border border-[#c1ff72] bg-[#f8fff0] p-4 text-sm text-gray-800">
          <strong className="block text-gray-950">Module terminé</strong>
          Tes vidéos orientation sont validées. Tu peux revenir dessus depuis la boîte à outils quand tu veux.
        </section>
      )}
    </div>
  )
}