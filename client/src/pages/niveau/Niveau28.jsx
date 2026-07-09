import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import apiClient, { usersAPI } from '../../lib/api'
import { XP_PER_LEVEL, levelUp } from '../../lib/progression'
import { supabase } from '../../lib/supabase'
import { FaMicrophone } from 'react-icons/fa6'

export default function Niveau28() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [jobTitleFromResults, setJobTitleFromResults] = useState('')

  const mediaRecorderRef = useRef(null)
  const [recording, setRecording] = useState(false)
  const chunksRef = useRef([])
  const [audioUrl, setAudioUrl] = useState('')
  const [rating, setRating] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

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

        try {
          const anal = await apiClient.get('/analysis/my-results', { headers: { 'Cache-Control': 'no-cache' }, params: { _: Date.now() } })
          const r = anal?.data?.results || {}
          const list = r.jobRecommendations || r.job_recommandations || []
          if (Array.isArray(list) && list.length > 0) setJobTitleFromResults(list[0]?.title || '')
        } catch {}
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
      `Ce qui me motive profondément dans le métier de ${jobTitle}, c'est de comprendre comment les choses fonctionnent et comment les améliorer. ` +
      `Je ne me contente jamais de la première réponse ; ma curiosité me pousse à explorer différentes perspectives avant d'agir.\n\n` +
      `J'aborde chaque nouveau défi avec la même méthode : j'écoute, j'apprends vite, et je connecte les idées et les gens pour construire quelque chose qui a du sens. ` +
      `Je crois fermement que les meilleures solutions naissent de la collaboration et d'une vision d'ensemble.\n\n` +
      `Mon objectif n'est pas simplement d'accomplir des tâches, mais d'apporter une énergie positive et une volonté de faire avancer les projets. ` +
      `Je cherche à m'investir dans un environnement où je pourrai continuer à apprendre et avoir un impact concret.`
    )
  }, [profile, jobTitleFromResults])

  const startRecording = async () => {
    try {
      setAudioUrl('')
      setSaved(false)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/wav', ''].find(
        (t) => !t || MediaRecorder.isTypeSupported(t)
      ) || ''
      const mr = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      const chosenType = mr.mimeType || mimeType || 'audio/wav'
      chunksRef.current = []
      mr.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: chosenType })
        const url = URL.createObjectURL(blob)
        setAudioUrl(url)
        setRecording(false)
        stream.getTracks().forEach((t) => t.stop())
      }
      mediaRecorderRef.current = mr
      mr.start()
      setRecording(true)
    } catch (e) {
      console.error('Recording start failed', e)
      alert("Impossible d'accéder au micro. Autorise le micro puis réessaie.")
    }
  }

  const stopRecording = () => {
    try { mediaRecorderRef.current?.stop() } catch {}
  }

  const resetPractice = () => {
    setAudioUrl('')
    setRating(null)
    setSaved(false)
  }

  async function saveRating() {
    if (rating === null || saving) return
    setSaving(true)
    try {
      await usersAPI.saveExtraInfo([
        {
          question_id: 'niveau28_pitch_rating',
          question_text: 'Note auto-évaluation du pitch',
          answer_text: `${rating}/10`
        }
      ])
      await levelUp({ minLevel: 28, xpReward: XP_PER_LEVEL })
      setSaved(true)
    } catch (e) {
      console.warn('Progression update failed (non-blocking):', e)
      setSaved(true)
    } finally {
      setSaving(false)
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
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center text-white"><FaMicrophone className="w-5 h-5" /></div>
            <h1 className="text-xl md:text-2xl font-bold">Entraînement pitch</h1>
          </div>
          <p className="text-text-secondary">
            Prépare-toi à te présenter en 1 minute. Lis (ou adapte) le texte d'exemple ci-dessous, enregistre-toi, puis note ta prestation.
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-card">
          <h2 className="text-lg font-bold mb-3">Texte d'exemple</h2>
          <div className="text-text-primary whitespace-pre-wrap">{pitchText}</div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-card">
          <h2 className="text-lg font-bold mb-4">Enregistre-toi</h2>
          <div className="flex flex-wrap items-center gap-3">
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
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-card">
          <h2 className="text-lg font-bold mb-4">Note ta prestation</h2>
          <div className="flex flex-wrap justify-center gap-2 mb-3">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => { setRating(val); setSaved(false) }}
                className={`w-9 h-9 md:w-10 md:h-10 rounded-full font-bold text-sm md:text-base transition-all border ${
                  rating === val
                    ? (val >= 8 ? 'bg-[#F68FFF] border-black' : 'bg-[#c1ff72] border-black')
                    : 'bg-white border-gray-300 hover:border-black'
                }`}
              >
                {val}
              </button>
            ))}
          </div>
          <div className="relative h-2 bg-gray-200 rounded-full overflow-hidden mb-4">
            <div
              className="absolute top-0 left-0 h-full bg-[#c1ff72] rounded-full transition-all duration-300"
              style={{ width: `${rating !== null ? rating * 10 : 0}%` }}
            />
          </div>
          <button
            onClick={saveRating}
            disabled={rating === null || saving}
            className="px-4 py-2 rounded-lg bg-black text-white border border-gray-200 disabled:opacity-50"
          >
            {saving ? 'Enregistrement…' : 'Enregistrer ma note'}
          </button>

          {saved && rating !== null && (
            <p className="mt-4 text-sm text-text-secondary">
              {rating >= 8
                ? 'Belle prestation ! Ta note a été enregistrée.'
                : "Note enregistrée. N'hésite pas à te réenregistrer et à retenter jusqu'à ce que tu sois vraiment fier·ère de toi."}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
