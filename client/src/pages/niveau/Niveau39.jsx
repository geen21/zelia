import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usersAPI } from '../../lib/api'
import { buildAvatarFromProfile } from '../../lib/avatar'
import { XP_PER_LEVEL, levelUp } from '../../lib/progression'
import { supabase } from '../../lib/supabase'

function useTypewriter(message, durationMs) {
  const [text, setText] = useState('')
  const [done, setDone] = useState(false)
  const intervalRef = useRef(null)
  const timeoutRef = useRef(null)

  useEffect(() => {
    const full = message || ''
    setText('')
    setDone(false)
    let i = 0
    const step = Math.max(15, Math.floor((durationMs || 1500) / Math.max(1, full.length)))
    intervalRef.current = setInterval(() => {
      i += 1
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

export default function Niveau39() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [profile, setProfile] = useState(null)
  const [avatarUrl, setAvatarUrl] = useState('')

  const [phase, setPhase] = useState('intro')
  const [showSuccess, setShowSuccess] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const [feedback, setFeedback] = useState({
    favoriteLevel: '',
    bestPart: '',
    toImprove: '',
    rating: ''
  })

  const dialogues = useMemo(() => [
    { text: "Avant le bilan final, j'aimerais ton avis sur l'application.", durationMs: 2000 },
    { text: "Tes retours nous aident à améliorer chaque niveau.", durationMs: 1800 },
    { text: "Dis-moi ce que tu as préféré et ce qu'on doit revoir.", durationMs: 2000 },
  ], [])

  const [dialogueIdx, setDialogueIdx] = useState(0)
  const currentDialogue = dialogues[dialogueIdx] || { text: '', durationMs: 1500 }
  const { text: typed, done: typedDone, skip } = useTypewriter(
    phase === 'intro' ? currentDialogue.text : '',
    currentDialogue.durationMs
  )

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
        console.error('Niveau39 load error', e)
        if (!mounted) return
        setError('Erreur de chargement')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [navigate])

  const onDialogueNext = () => {
    if (!typedDone) { skip(); return }
    if (dialogueIdx < dialogues.length - 1) {
      setDialogueIdx(prev => prev + 1)
    } else {
      setPhase('form')
    }
  }

  const finishLevel = async () => {
    if (finishing) return
    setFinishing(true)
    try {
      await levelUp({ minLevel: 39, xpReward: XP_PER_LEVEL })
      setShowSuccess(true)
    } catch (e) {
      console.error('Niveau39 levelUp failed', e)
      setError('Impossible de valider le niveau.')
    } finally {
      setFinishing(false)
    }
  }

  const handleSubmit = async () => {
    setFormError('')
    if (!feedback.favoriteLevel.trim() || !feedback.toImprove.trim() || !feedback.rating) {
      setFormError('Merci de compléter les champs obligatoires.')
      return
    }

    setSaving(true)
    try {
      const entries = [
        {
          question_id: 'niveau39_favorite_level',
          question_text: 'Niveau préféré',
          answer_text: feedback.favoriteLevel.trim()
        },
        {
          question_id: 'niveau39_best_part',
          question_text: 'Ce que tu as préféré',
          answer_text: feedback.bestPart.trim()
        },
        {
          question_id: 'niveau39_to_improve',
          question_text: 'Ce que tu aimerais améliorer',
          answer_text: feedback.toImprove.trim()
        },
        {
          question_id: 'niveau39_rating',
          question_text: 'Note globale sur 5',
          answer_text: feedback.rating
        }
      ]
      await usersAPI.saveExtraInfo(entries)
      await finishLevel()
    } catch (e) {
      console.error('Niveau39 feedback save error', e)
      setFormError('Impossible d’enregistrer ton retour. Réessaie.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 text-center">
        <div className="inline-block w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
        <p className="mt-2 text-text-secondary">Chargement...</p>
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
                  {phase === 'intro' && typed}
                  {phase === 'form' && 'Merci pour ton retour, ça compte beaucoup.'}
                </div>
                <div className="absolute -left-2 top-6 w-0 h-0 border-t-8 border-b-8 border-r-8 border-t-transparent border-b-transparent border-r-black" />
              </div>

              <div className="mt-4 flex flex-col gap-3">
                {phase === 'intro' && (
                  <button onClick={onDialogueNext} className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200 w-full sm:w-auto">
                    {dialogueIdx < dialogues.length - 1 ? 'Suivant' : 'Donner mon avis'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-4 md:p-6 shadow-card">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center text-white font-bold">39</div>
            <h2 className="text-lg md:text-xl font-bold">Retours utilisateurs</h2>
          </div>

          {phase === 'intro' && (
            <div className="text-text-secondary text-center py-8">Le formulaire apparaîtra ici.</div>
          )}

          {phase === 'form' && (
            <div className="space-y-4">
              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded-lg text-sm">{formError}</div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Niveau préféré *</label>
                <input
                  value={feedback.favoriteLevel}
                  onChange={(e) => setFeedback(prev => ({ ...prev, favoriteLevel: e.target.value }))}
                  className="w-full p-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#c1ff72]"
                  placeholder="Ex: Niveau 12, Niveau 31..."
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Ce que tu as préféré</label>
                <textarea
                  value={feedback.bestPart}
                  onChange={(e) => setFeedback(prev => ({ ...prev, bestPart: e.target.value }))}
                  rows={4}
                  className="w-full p-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#c1ff72]"
                  placeholder="Le jeu, les vidéos, le rythme..."
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Ce que tu aimerais revoir *</label>
                <textarea
                  value={feedback.toImprove}
                  onChange={(e) => setFeedback(prev => ({ ...prev, toImprove: e.target.value }))}
                  rows={4}
                  className="w-full p-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#c1ff72]"
                  placeholder="Clarté, durée, contenu..."
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Note globale sur 5 *</label>
                <select
                  value={feedback.rating}
                  onChange={(e) => setFeedback(prev => ({ ...prev, rating: e.target.value }))}
                  className="w-full p-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#c1ff72]"
                >
                  <option value="">Sélectionner</option>
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="4">4</option>
                  <option value="5">5</option>
                </select>
              </div>

              <button
                onClick={handleSubmit}
                disabled={saving}
                className="w-full px-4 py-3 rounded-lg bg-[#c1ff72] text-black border border-gray-200 font-medium disabled:opacity-50"
              >
                {saving ? 'Envoi...' : 'Envoyer mon retour'}
              </button>
            </div>
          )}
        </div>
      </div>

      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="relative bg-white border border-gray-200 rounded-2xl p-8 shadow-2xl text-center max-w-md w-11/12">
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 w-10 h-10 bg-[#c1ff72] rounded-full flex items-center justify-center shadow-md animate-bounce font-bold">39</div>
            <h3 className="text-2xl font-extrabold mb-2">Niveau 39 terminé !</h3>
            <p className="text-text-secondary mb-4">Merci pour ton retour, il nous aide beaucoup.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button onClick={() => navigate('/app/activites')} className="px-4 py-2 rounded-lg bg-white text-gray-900 border border-gray-200">Retour aux activités</button>
              <button onClick={() => navigate('/app/niveau/40')} className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200">Niveau suivant</button>
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