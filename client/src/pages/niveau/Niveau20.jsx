import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import apiClient, { usersAPI } from '../../lib/api'
import { buildAvatarFromProfile } from '../../lib/avatar'
import { XP_PER_LEVEL, levelUp } from '../../lib/progression'
import { supabase } from '../../lib/supabase'

const STEP_INTRO = 'intro'
const STEP_BILAN = 'bilan'

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

function sanitizeText(raw) {
  if (!raw) return ''
  return String(raw)
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\*\*/g, '')
    .trim()
}

function extractJson(raw) {
  const text = sanitizeText(raw)
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  const chunk = text.slice(start, end + 1)
  try {
    return JSON.parse(chunk)
  } catch {
    return null
  }
}

function formatExtraInfos(entries) {
  return (entries || [])
    .map((row) => `- [${row.question_id}] ${row.question_text || 'Question'}: ${row.answer_text || '—'}`)
    .join('\n')
}

export default function Niveau20() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [profile, setProfile] = useState(null)
  const [avatarUrl, setAvatarUrl] = useState('')

  const [phase, setPhase] = useState(STEP_INTRO)
  const [bilanLoading, setBilanLoading] = useState(false)
  const [bilanError, setBilanError] = useState('')
  const [bilan, setBilan] = useState(null)
  const [showSuccess, setShowSuccess] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [extraInfos, setExtraInfos] = useState([])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          navigate('/login')
          return
        }
        const pRes = await usersAPI.getProfile().catch(() => null)
        if (!mounted) return
        const prof = pRes?.data?.profile || pRes?.data || null
        setProfile(prof)
        setAvatarUrl(buildAvatarFromProfile(prof, user.id))

        const extraRes = await usersAPI.getExtraInfo().catch(() => null)
        if (!mounted) return
        const entries = Array.isArray(extraRes?.data?.entries) ? extraRes.data.entries : []
        const filtered = entries.filter((row) => {
          const id = String(row?.question_id || '').toLowerCase()
          // Support both formats: niveau11 and niveau_11
          return id.startsWith('niveau11') || id.startsWith('niveau_11') ||
            id.startsWith('niveau12') || id.startsWith('niveau_12') ||
            id.startsWith('niveau13') || id.startsWith('niveau_13') ||
            id.startsWith('niveau14') || id.startsWith('niveau_14') ||
            id.startsWith('niveau15') || id.startsWith('niveau_15') ||
            id.startsWith('niveau16') || id.startsWith('niveau_16') ||
            id.startsWith('niveau17') || id.startsWith('niveau_17') ||
            id.startsWith('niveau18') || id.startsWith('niveau_18') ||
            id.startsWith('niveau19') || id.startsWith('niveau_19')
        })
        setExtraInfos(filtered)
      } catch (e) {
        console.error('Niveau20 load error', e)
        if (!mounted) return
        setError('Erreur de chargement')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [navigate])

  const bubble = useMemo(() => {
    if (phase === STEP_INTRO) return { text: "C'est le moment de faire le bilan des niveaux 11 à 19", durationMs: 1600 }
    return { text: 'Ok voici ton bilan', durationMs: 900 }
  }, [phase])

  const { text: typed, done: typedDone, skip } = useTypewriter(bubble.text, bubble.durationMs)

  async function loadBilan() {
    setBilanError('')
    setBilanLoading(true)
    try {
      // Si aucune donnée des niveaux 11-19, afficher un message explicite
      if (!extraInfos || extraInfos.length === 0) {
        setBilan({ 
          sections: [{ 
            title: 'Données manquantes', 
            content: 'Aucune donnée des niveaux 11 à 19 n\'a été trouvée. Assure-toi d\'avoir complété les niveaux précédents (notamment les niveaux 17, 18 et 19) avant de revenir faire ton bilan.' 
          }] 
        })
        setBilanLoading(false)
        return
      }

      const context = formatExtraInfos(extraInfos)
      const message =
        `Tu dois produire un bilan clair des niveaux 11 à 19 à partir des informations ci-dessous.\n` +
        `Réponds UNIQUEMENT en JSON valide au format suivant :\n` +
        `{"sections":[{"title":"","content":""}]}\n` +
        `Contraintes:\n` +
        `- 6 sections maximum, chacune avec 2 à 4 phrases.\n` +
        `- Inclure: classement métiers (N11/N18), lettre de motivation (N14), points positifs/négatifs (N15), CV (N17), points d'amélioration (N19).\n` +
        `- Si une info manque, indique "Non disponible" dans la section concernée.\n` +
        `Données:\n${context}`

      const resp = await apiClient.post('/chat/ai', {
        mode: 'advisor',
        advisorType: 'bilan-niveau20',
        message,
        history: []
      })

      const parsed = extractJson(resp?.data?.reply || '')
      const sections = Array.isArray(parsed?.sections) ? parsed.sections : []
      setBilan({ sections })
    } catch (e) {
      console.error('Niveau20 bilan fetch failed', e)
      setBilan(null)
      setBilanError("Impossible de générer ton bilan pour le moment.")
    } finally {
      setBilanLoading(false)
    }
  }

  const onIntroContinue = () => {
    if (!typedDone) { skip(); return }
    setPhase(STEP_BILAN)
    setBilan(null)
    loadBilan()
  }

  const onFinish = async () => {
    if (finishing) return
    setFinishing(true)
    try {
      await levelUp({ minLevel: 20, xpReward: XP_PER_LEVEL })
      setShowSuccess(true)
    } catch (e) {
      console.error('Niveau20 levelUp failed', e)
      setBilanError('Impossible de valider le niveau pour le moment. Réessaie.')
    } finally {
      setFinishing(false)
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

  const sections = Array.isArray(bilan?.sections) ? bilan.sections : []
  const showBilan = phase === STEP_BILAN

  return (
    <div className="p-4 md:p-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-card">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
            <img
              src={avatarUrl}
              alt="Avatar"
              className="w-28 h-28 sm:w-36 sm:h-36 md:w-44 md:h-44 lg:w-52 lg:h-52 xl:w-60 xl:h-60 2xl:w-64 2xl:h-64 rounded-2xl border border-gray-100 shadow-sm object-contain bg-white mx-auto md:mx-0"
            />
            <div className="flex-1 w-full">
              <div className="relative bg-black text-white rounded-2xl p-4 md:p-5 w-full">
                <div className="text-base md:text-lg leading-relaxed whitespace-pre-wrap min-h-[3.5rem]">
                  {typed}
                </div>
                <div className="absolute -left-2 top-6 w-0 h-0 border-t-8 border-b-8 border-r-8 border-t-transparent border-b-transparent border-r-black" />
              </div>

              <div className="mt-4 flex flex-col gap-3">
                {phase === STEP_INTRO && (
                  <button
                    type="button"
                    onClick={onIntroContinue}
                    className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200 w-full sm:w-auto"
                  >
                    Continuer
                  </button>
                )}

                {showBilan && (
                  <button
                    type="button"
                    onClick={onFinish}
                    disabled={bilanLoading || finishing}
                    className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200 w-full sm:w-auto disabled:opacity-60"
                  >
                    Continuer
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-card">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center text-white">📋</div>
            <h2 className="text-xl font-bold">Bilan</h2>
          </div>

          {!showBilan ? (
            <div className="text-text-secondary">Réponds au dialogue pour voir ton bilan.</div>
          ) : bilanLoading ? (
            <div className="text-center">
              <div className="inline-block w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
              <p className="mt-2 text-text-secondary">Génération de ton bilan…</p>
            </div>
          ) : bilanError ? (
            <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-lg">{bilanError}</div>
          ) : (
            <div className="space-y-4">
              {sections.map((section, idx) => (
                <div key={`section-${idx}`} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="font-semibold">{section?.title || `Section ${idx + 1}`}</div>
                  <div className="mt-2 whitespace-pre-wrap text-text-secondary">
                    {section?.content || 'Non disponible'}
                  </div>
                </div>
              ))}
              {!sections.length && (
                <div className="text-text-secondary">Non disponible</div>
              )}
            </div>
          )}
        </div>
      </div>

      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="relative bg-white border border-gray-200 rounded-2xl p-8 shadow-2xl text-center max-w-md w-11/12">
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 w-10 h-10 bg-[#c1ff72] rounded-full flex items-center justify-center shadow-md animate-bounce">🏆</div>
            <h3 className="text-2xl font-extrabold mb-2">Niveau 20 réussi !</h3>
            <p className="text-text-secondary mb-4">Tu as terminé cette étape avec succès.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button onClick={() => navigate('/app/activites')} className="px-4 py-2 rounded-lg bg-white text-gray-900 border border-gray-200">Retour aux activités</button>
              <button onClick={() => navigate('/app/niveau/21')} className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200">Passer au niveau suivant</button>
            </div>
            {/* Subtle confetti dots */}
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