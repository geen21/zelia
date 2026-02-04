import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import apiClient, { usersAPI } from '../../lib/api'
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

export default function Niveau33() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [profile, setProfile] = useState(null)
  const [avatarUrl, setAvatarUrl] = useState('')
  const [authEmail, setAuthEmail] = useState('')

  const [dialogueIdx, setDialogueIdx] = useState(0)
  const [phase, setPhase] = useState('intro') // intro -> decision -> write -> sending
  const [showSuccess, setShowSuccess] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [letter, setLetter] = useState('')
  const [sending, setSending] = useState(false)
  const [formError, setFormError] = useState('')
  const [didWriteLetter, setDidWriteLetter] = useState(false)

  const futureDate = useMemo(() => {
    const d = new Date()
    d.setFullYear(d.getFullYear() + 5)
    return d
  }, [])

  const futureDateLabel = useMemo(() => {
    try {
      return futureDate.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
    } catch {
      return futureDate.toISOString().split('T')[0]
    }
  }, [futureDate])

  const firstName = profile?.first_name || 'toi'

  const dialogues = useMemo(() => [
    { text: `Pour te motiver ${firstName}, j'ai pensé à un truc sympa.`, durationMs: 2000 },
    { text: `Je te laisse écrire une lettre à toi même, on te l'envoie dans 5 ans ! (vraiment)`, durationMs: 2600 },
    { text: `Il faudra juste que tu gardes ton adresse mail : ${authEmail || '...'}`, durationMs: 2200 },
    { text: `Écris ce que tu veux, sur tes objectifs, n'importe quoi. Tu acceptes ?`, durationMs: 2200 }
  ], [firstName, authEmail])

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
        if (!mounted) return
        setAuthEmail(user.email || '')

        const pRes = await usersAPI.getProfile().catch(() => null)
        if (!mounted) return
        const prof = pRes?.data?.profile || pRes?.data || null
        setProfile(prof)
        setAvatarUrl(buildAvatarFromProfile(prof, user.id))
      } catch (e) {
        console.error('Niveau33 load error', e)
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
      setPhase('decision')
    }
  }

  const finishLevel = async () => {
    if (finishing) return
    setFinishing(true)
    try {
      // Save letter status to extra info
      await usersAPI.saveExtraInfo([
        {
          question_id: 'niveau33_letter_completed',
          question_text: 'Lettre à soi-même',
          answer_text: JSON.stringify({
            didWriteLetter,
            sendDate: futureDate.toISOString(),
            completedAt: new Date().toISOString()
          })
        }
      ]).catch(e => console.warn('saveExtraInfo N33 failed', e))
      
      await levelUp({ minLevel: 33, xpReward: XP_PER_LEVEL })
      setShowSuccess(true)
    } catch (e) {
      console.error('Niveau33 levelUp failed', e)
      setError('Impossible de valider le niveau.')
    } finally {
      setFinishing(false)
    }
  }

  const handleRefuse = () => {
    setDidWriteLetter(false)
    setPhase('sending')
    finishLevel()
  }

  const handleSend = async () => {
    if (!letter.trim()) {
      setFormError('Écris quelques mots avant d’envoyer.')
      return
    }

    setSending(true)
    setFormError('')

    try {
      await apiClient.post('/letter/future', {
        content: letter.trim(),
        sendAt: futureDate.toISOString()
      })
      setDidWriteLetter(true)
      setPhase('sending')
      await finishLevel()
    } catch (e) {
      console.error('Letter send error', e)
      setFormError('Impossible d’envoyer la lettre. Réessaie dans un instant.')
    } finally {
      setSending(false)
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
        {/* Left: Avatar + Dialogue */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-card">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
            <img src={avatarUrl} alt="Avatar" className="w-28 h-28 sm:w-36 sm:h-36 md:w-44 md:h-44 lg:w-52 lg:h-52 rounded-2xl border border-gray-100 shadow-sm object-contain bg-white mx-auto md:mx-0" />
            <div className="flex-1 w-full">
              <div className="relative bg-black text-white rounded-2xl p-4 md:p-5 w-full">
                <div className="text-base md:text-lg leading-relaxed whitespace-pre-wrap min-h-[3.5rem]">
                  {phase === 'intro' && typed}
                  {phase === 'decision' && 'Dis-moi si tu veux écrire ta lettre.'}
                  {phase === 'write' && `Tu recevras cette lettre le ${futureDateLabel}.`}
                  {phase === 'sending' && 'Parfait, on s’occupe du reste !'}
                </div>
                <div className="absolute -left-2 top-6 w-0 h-0 border-t-8 border-b-8 border-r-8 border-t-transparent border-b-transparent border-r-black" />
              </div>

              <div className="mt-4 flex flex-col gap-3">
                {phase === 'intro' && (
                  <button onClick={onDialogueNext} className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200 w-full sm:w-auto">
                    {dialogueIdx < dialogues.length - 1 ? 'Suivant' : 'Continuer'}
                  </button>
                )}
                {phase === 'decision' && (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button onClick={() => setPhase('write')} className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200 flex-1">
                      Oui
                    </button>
                    <button onClick={handleRefuse} className="px-4 py-2 rounded-lg bg-white text-black border border-gray-200 flex-1">
                      Non
                    </button>
                  </div>
                )}
                {phase === 'write' && null}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Letter */}
        <div className="bg-white border border-gray-200 rounded-2xl p-4 md:p-6 shadow-card">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center text-white font-bold">33</div>
            <h2 className="text-lg md:text-xl font-bold">On t’envoie un email dans 5 ans !</h2>
          </div>

          {phase === 'intro' && (
            <div className="text-text-secondary text-center py-8">Tu pourras écrire ta lettre après le dialogue.</div>
          )}

          {phase === 'decision' && (
            <div className="text-text-secondary text-center py-8">Dis-moi si tu veux écrire ta lettre 😊</div>
          )}

          {(phase === 'write' || phase === 'sending') && (
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                <p className="text-sm text-text-secondary mb-1">Adresse mail :</p>
                <p className="font-semibold">{authEmail || '—'}</p>
              </div>

              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded-lg text-sm">
                  {formError}
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Lettre à toi même que tu recevras le {futureDateLabel}
                </label>
                <textarea
                  value={letter}
                  onChange={(e) => setLetter(e.target.value)}
                  rows={8}
                  className="w-full p-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#c1ff72]"
                  placeholder="Écris ici ce que tu veux..."
                />
              </div>

              {phase === 'write' && (
                <button onClick={handleSend} disabled={sending} className="w-full px-4 py-3 rounded-lg bg-[#c1ff72] text-black border border-gray-200 font-medium disabled:opacity-50">
                  {sending ? 'Envoi...' : 'Envoyer'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Success Popup */}
      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="relative bg-white border border-gray-200 rounded-2xl p-8 shadow-2xl text-center max-w-md w-11/12">
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 w-10 h-10 bg-[#c1ff72] rounded-full flex items-center justify-center shadow-md animate-bounce font-bold">33</div>
            <h3 className="text-2xl font-extrabold mb-2">Niveau 33 terminé !</h3>
            <p className="text-text-secondary mb-4">
              {didWriteLetter
                ? 'Ta lettre est bien programmée. Rendez-vous dans 5 ans !'
                : 'Bravo pour ta progression. Tu peux revenir écrire ta lettre plus tard !'}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button onClick={() => navigate('/app/activites')} className="px-4 py-2 rounded-lg bg-white text-gray-900 border border-gray-200">Retour aux activités</button>
              <button onClick={() => navigate('/app/niveau/34')} className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200">Niveau suivant</button>
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