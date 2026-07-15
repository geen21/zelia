import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import apiClient, { usersAPI } from '../../lib/api'
import { XP_PER_LEVEL, levelUp } from '../../lib/progression'
import { supabase } from '../../lib/supabase'

export default function Niveau33() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [authEmail, setAuthEmail] = useState('')
  const [letter, setLetter] = useState('')
  const [sending, setSending] = useState(false)
  const [formError, setFormError] = useState('')
  const [completed, setCompleted] = useState(false)

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

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { navigate('/login'); return }
        if (!mounted) return
        setAuthEmail(user.email || '')
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

  const handleSend = async () => {
    if (!letter.trim() || sending || completed) {
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
      await usersAPI.saveExtraInfo([
        {
          question_id: 'niveau33_letter_completed',
          question_text: 'Lettre à soi-même',
          answer_text: JSON.stringify({
            didWriteLetter: true,
            sendDate: futureDate.toISOString(),
            completedAt: new Date().toISOString()
          })
        }
      ])
      await levelUp({ minLevel: 33, xpReward: XP_PER_LEVEL })
      setCompleted(true)
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
    <div className="mx-auto max-w-4xl space-y-5 p-2 md:p-6">
      <header className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-black text-xl text-[#c1ff72]">
          <i className="ph ph-envelope-simple" aria-hidden="true" />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase text-gray-500">Prendre du recul</p>
          <h1 className="mt-1 text-2xl font-semibold text-gray-950">Lettre à soi-même</h1>
          <p className="mt-1 text-sm text-gray-500">Écris à la personne que tu seras dans cinq ans.</p>
        </div>
      </header>

      <section className="grid overflow-hidden rounded-lg border border-gray-200 bg-white shadow-card lg:grid-cols-[minmax(220px,0.7fr)_minmax(0,1.3fr)]">
        <aside className="space-y-4 bg-black p-5 text-white">
          <div>
            <p className="text-xs font-semibold uppercase text-gray-300">Envoi prévu</p>
            <p className="mt-2 text-xl font-semibold text-[#c1ff72]">{futureDateLabel}</p>
          </div>
          <div className="border-t border-white/20 pt-4">
            <p className="text-xs font-semibold uppercase text-gray-300">Adresse du compte</p>
            <p className="mt-2 break-words text-sm text-white">{authEmail || 'Chargement...'}</p>
          </div>
        </aside>

        <form
          className="space-y-4 p-5 md:p-6"
          onSubmit={(event) => {
            event.preventDefault()
            handleSend()
          }}
        >
          <div>
            <label htmlFor="future-letter-content" className="text-sm font-semibold text-gray-950">Ta lettre</label>
            <textarea
              id="future-letter-content"
              value={letter}
              onChange={(event) => setLetter(event.target.value)}
              rows={11}
              maxLength={5000}
              disabled={completed}
              className="mt-2 w-full resize-y rounded-lg border border-gray-200 p-3 text-sm text-gray-950 outline-none transition focus:border-black disabled:bg-gray-50"
              placeholder="Ce que tu aimerais te rappeler, tes envies, tes objectifs..."
            />
            <p className="mt-1 text-right text-xs text-gray-500">{letter.length}/5000</p>
          </div>

          {formError && (
            <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
              {formError}
            </div>
          )}

          {!completed && (
            <button type="submit" disabled={sending || !letter.trim()} className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-black px-4 text-sm font-semibold text-white hover:bg-gray-900 disabled:opacity-50">
              {sending ? 'Programmation...' : 'Programmer ma lettre'}
            </button>
          )}
        </form>
      </section>

      {completed && (
        <section className="flex flex-col gap-4 rounded-lg border border-[#c1ff72] bg-[#f8fff0] p-4 sm:flex-row sm:items-center sm:justify-between" role="status">
          <div className="flex items-start gap-3">
            <i className="ph ph-check-circle mt-0.5 text-xl text-green-700" aria-hidden="true" />
            <div>
              <h2 className="font-semibold text-gray-950">Ta lettre est programmée</h2>
              <p className="mt-1 text-sm text-gray-600">Elle sera envoyée le {futureDateLabel}.</p>
            </div>
          </div>
          <Link to="/app" className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-black px-4 text-sm font-semibold text-white hover:bg-gray-900">
            Retour au parcours
          </Link>
        </section>
      )}
    </div>
  )
}