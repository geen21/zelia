import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import supabase from '../../lib/supabase'
import {
  PAYWALL_LEVEL,
  XP_PER_LEVEL,
  computeNextPlayableLevel,
  fetchProgression,
  isLevelAccessible,
  levelUp
} from '../../lib/progression'
import { usersAPI } from '../../lib/api'

const STATUS_COLORS = {
  locked: 'bg-red-50 text-red-700 border-red-200',
  info: 'bg-blue-50 text-blue-700 border-blue-200',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200'
}

export default function NiveauTemplate({
  level,
  xpReward = XP_PER_LEVEL,
  title,
  subtitle,
  description,
  tasks = [],
  comingSoon = true,
  arcLabel
}) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lockedReason, setLockedReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [completed, setCompleted] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await supabase.auth.getUser()
        const user = data?.user
        if (!user) {
          navigate('/login')
          return
        }

        const [progression, profileRes] = await Promise.all([
          fetchProgression(),
          usersAPI.getProfile().catch(() => null)
        ])

        if (cancelled) return

        const profilePayload = profileRes?.data?.profile || profileRes?.data || {}
        const hasPaid = Boolean(profilePayload?.has_paid)
        const accessible = isLevelAccessible({
          targetLevel: level,
          progression,
          hasPaid
        })

        if (!accessible) {
          const currentLevel = Number(progression?.level) || 1
          const nextPlayable = computeNextPlayableLevel({ progression, hasPaid })
          if (level > PAYWALL_LEVEL && !hasPaid && level > nextPlayable) {
            setLockedReason('Ce niveau fait partie du contenu premium. Il sera accessible après activation de l\'abonnement Zélia+.')
          } else if (level > currentLevel + 1) {
            setLockedReason(`Tu dois d'abord terminer le niveau ${currentLevel + 1} pour débloquer celui-ci.`)
          } else {
            setLockedReason(`Tu dois d'abord finaliser le niveau ${Math.max(1, level - 1)}.`)
          }
        }
      } catch (err) {
        console.error('[NiveauTemplate] setup failed', err)
        if (cancelled) return
        setError('Impossible de charger les informations de progression.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [level, navigate])

  const statusMessage = useMemo(() => {
    if (lockedReason) {
      return { tone: 'locked', text: lockedReason }
    }
    if (comingSoon) {
      return { tone: 'info', text: 'Ce niveau est en préparation. Tes retours nous aideront à le finaliser !' }
    }
    return null
  }, [comingSoon, lockedReason])

  async function handleFinishLevel() {
    if (lockedReason) return
    setSaving(true)
    setError('')
    try {
      await levelUp({ minLevel: level, xpReward })
      setCompleted(true)
    } catch (err) {
      console.error('[NiveauTemplate] levelUp failed', err)
      setError('Impossible de valider le niveau pour le moment. Réessaie dans un instant.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 text-center">
        <div className="inline-block w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
        <p className="mt-2 text-text-secondary">Chargement du niveau…</p>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="bg-white border border-gray-200 rounded-3xl shadow-card p-6 md:p-8">
          <div className="flex flex-col gap-2 mb-6">
            <div className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-gray-500">
              <span className="inline-flex h-6 min-w-[2rem] items-center justify-center rounded-full bg-black text-white text-xs font-bold">
                Niv. {level}
              </span>
              {arcLabel && <span>{arcLabel}</span>}
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900">
              {title || `Niveau ${level}`}
            </h1>
            {subtitle && <p className="text-base text-gray-500">{subtitle}</p>}
            {description && (
              <p className="text-lg leading-relaxed text-gray-700 whitespace-pre-line">
                {description}
              </p>
            )}
          </div>

          {statusMessage && (
            <div className={`rounded-2xl border px-4 py-3 text-sm ${STATUS_COLORS[statusMessage.tone]}`}>
              {statusMessage.text}
            </div>
          )}

          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {Array.isArray(tasks) && tasks.length > 0 && (
            <div className="mt-6 space-y-3">
              <h2 className="text-lg font-semibold text-gray-900">Objectifs à venir</h2>
              <ul className="space-y-2">
                {tasks.map((task, index) => (
                  <li key={task.id || index} className="flex items-start gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                    <span className="mt-1 inline-flex h-6 w-6 flex-none items-center justify-center rounded-full bg-black text-xs font-bold text-white">
                      {index + 1}
                    </span>
                    <div>
                      <p className="font-medium text-gray-900">{task.title}</p>
                      {task.hint && <p className="text-sm text-gray-500">{task.hint}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={handleFinishLevel}
              disabled={Boolean(lockedReason) || saving}
              className="inline-flex items-center justify-center rounded-xl bg-[#c1ff72] px-5 py-3 text-base font-semibold text-black transition hover:bg-[#b3ff5d] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Enregistrement…' : 'Je valide ce niveau'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/app/activites')}
              className="inline-flex items-center justify-center rounded-xl border border-gray-200 px-5 py-3 text-base font-semibold text-gray-700 transition hover:bg-gray-100"
            >
              Retour aux activités
            </button>
            <div className="text-sm text-gray-400 sm:ml-auto">
              {xpReward > 0 ? `${xpReward} XP` : 'Gain d\'XP à confirmer'}
            </div>
          </div>
        </div>
      </div>

      {completed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="relative w-full max-w-md rounded-3xl border border-gray-200 bg-white p-8 text-center shadow-2xl">
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 flex h-12 w-12 items-center justify-center rounded-full bg-[#c1ff72] text-2xl shadow-lg">
              🎉
            </div>
            <h3 className="mt-4 text-2xl font-extrabold text-gray-900">Niveau {level} validé !</h3>
            <p className="mt-2 text-gray-500">Ton avancée est prise en compte. Continue sur ta lancée pour débloquer la suite du parcours.</p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={() => navigate('/app/activites')}
                className="inline-flex items-center justify-center rounded-xl bg-[#c1ff72] px-5 py-3 text-base font-semibold text-black transition hover:bg-[#b3ff5d]"
              >
                Retour aux activités
              </button>
              <button
                type="button"
                onClick={() => setCompleted(false)}
                className="inline-flex items-center justify-center rounded-xl border border-gray-200 px-5 py-3 text-base font-semibold text-gray-700 transition hover:bg-gray-100"
              >
                Rester sur la page
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
