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

function cleanBilanSummary(raw) {
  const text = sanitizeText(raw)
  if (!text) return ''
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s*Ã¢â€ â€™\s*Je suis d'accord\.?\s*$/i, '').trim())
    .filter((line) => line && !/^Je suis d'accord\.?$/i.test(line))
    .join('\n')
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
    .map((row) => `- [${row.question_id}] ${row.question_text || 'Question'}: ${row.answer_text || 'Ã¢â‚¬â€'}`)
    .join('\n')
}

function buildFallbackSummary(entries) {
  const list = Array.isArray(entries) ? entries : []
  const byLevel = new Map()

  list.forEach((row) => {
    const rawId = String(row?.question_id || '').toLowerCase()
    const match = rawId.match(/niveau[_]?(\d+)/)
    if (!match) return
    const level = Number(match[1])
    if (Number.isNaN(level) || level < 21 || level > 29) return
    if (!byLevel.has(level)) byLevel.set(level, [])
    byLevel.get(level).push(row)
  })

  const formatValue = (value) => {
    if (value == null) return 'Ã¢â‚¬â€'
    const raw = String(value).trim()
    if (!raw) return 'Ã¢â‚¬â€'
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed.map((item) => JSON.stringify(item)).join(', ')
      if (parsed && typeof parsed === 'object') return Object.entries(parsed).map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`).join(', ')
      return JSON.stringify(parsed)
    } catch {
      return raw
    }
  }

  const formatLevel = (levels) => {
    const rows = []
    levels.forEach((lvl) => {
      const items = byLevel.get(lvl) || []
      items.forEach((row) => {
        rows.push(`Niveau ${lvl} - ${row?.question_text || 'Question'}: ${formatValue(row?.answer_text)}`)
      })
    })
    return rows.length ? rows.join(' | ') : 'Non disponible'
  }

  const summary = [
    `Tu as progressÃƒÂ© sur les filiÃƒÂ¨res, le budget et la sÃƒÂ©lection d'ÃƒÂ©coles (N21-N23).`,
    `Le quiz stats (N24) et les vidÃƒÂ©os (N25, N29) ont consolidÃƒÂ© ta vision de l'orientation.`,
    `Tu as avancÃƒÂ© sur Parcoursup et les dÃƒÂ©marches concrÃƒÂ¨tes (N26).`,
    `Tu as aussi travaillÃƒÂ© ta posture via le chat communautaire et la simulation d'entretien (N27-N28).`,
    `Points marquants enregistrÃƒÂ©s: ${formatLevel([21, 22, 23, 24, 25, 26, 27, 28, 29])}.`
  ].join('\n')

  return { summary: cleanBilanSummary(summary) }
}

// Resume des niveaux 21-29 (videos et jeux)
const LEVELS_SUMMARY = [
  { level: 21, title: 'Video : Conseils Orientation', type: 'video' },
  { level: 22, title: 'Video : Les etudes superieures', type: 'video' },
  { level: 23, title: 'Video : Reussir son orientation', type: 'video' },
  { level: 24, title: 'Quiz : Statistiques orientation', type: 'quiz' },
  { level: 25, title: 'Video : Etudes post-bac', type: 'video' },
  { level: 26, title: 'Resume : Parcoursup', type: 'info' },
  { level: 27, title: 'Decouverte : Chat communautaire', type: 'chat' },
  { level: 28, title: 'Simulation : Entretien embauche', type: 'simulation' },
  { level: 29, title: 'Video : Comment se vendre', type: 'video' },
]

export default function Niveau30() {
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
        // Get all entries from niveau 21-29
        const filtered = entries.filter((row) => {
          const id = String(row?.question_id || '').toLowerCase()
          return id.startsWith('niveau21') || id.startsWith('niveau_21') ||
            id.startsWith('niveau22') || id.startsWith('niveau_22') ||
            id.startsWith('niveau23') || id.startsWith('niveau_23') ||
            id.startsWith('niveau24') || id.startsWith('niveau_24') ||
            id.startsWith('niveau25') || id.startsWith('niveau_25') ||
            id.startsWith('niveau26') || id.startsWith('niveau_26') ||
            id.startsWith('niveau27') || id.startsWith('niveau_27') ||
            id.startsWith('niveau28') || id.startsWith('niveau_28') ||
            id.startsWith('niveau29') || id.startsWith('niveau_29')
        })
        setExtraInfos(filtered)
      } catch (e) {
        console.error('Niveau30 load error', e)
        if (!mounted) return
        setError('Erreur de chargement')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [navigate])

  const bubble = useMemo(() => {
    if (phase === STEP_INTRO) return { text: "Felicitations ! Tu as complete les niveaux 21 a 29. Voici ton bilan final.", durationMs: 2000 }
    return { text: 'Voici ton bilan complet', durationMs: 900 }
  }, [phase])

  const { text: typed, done: typedDone, skip } = useTypewriter(bubble.text, bubble.durationMs)

  async function loadBilan() {
    setBilanError('')
    setBilanLoading(true)
    try {
      if (!extraInfos || extraInfos.length === 0) {
        setBilan({ summary: 'Aucune donnÃƒÂ©e des niveaux 21 ÃƒÂ  29 n\'a ÃƒÂ©tÃƒÂ© trouvÃƒÂ©e. Termine d\'abord ces niveaux pour obtenir un bilan personnalisÃƒÂ©.' })
        setBilanLoading(false)
        return
      }

      const context = extraInfos.length > 0 
        ? formatExtraInfos(extraInfos) 
        : 'Aucune donnee specifique enregistree pour les niveaux 21-29.'

      const summaryContext = LEVELS_SUMMARY.map(l => `- Niveau ${l.level}: ${l.title} (${l.type})`).join('\n')

      const message =
        `Tu dois produire un rÃƒÂ©sumÃƒÂ© trÃƒÂ¨s court et personnalisÃƒÂ© des niveaux 21 ÃƒÂ  29.\n` +
        `L'utilisateur a parcouru les modules suivants:\n${summaryContext}\n\n` +
        `Donnees enregistrees de l'utilisateur:\n${context}\n\n` +
        `Reponds UNIQUEMENT en JSON valide au format suivant :\n` +
        `{"summary":""}\n` +
        `Contraintes:\n` +
        `- 5 phrases maximum, style clair et concret.\n` +
        `- Inclure briÃƒÂ¨vement: vidÃƒÂ©os, quiz stats, Parcoursup, simulation d'entretien, prochaine ÃƒÂ©tape.\n` +
        `- Ne recopie pas les donnÃƒÂ©es brutes, synthÃƒÂ©tise.\n` +
        `- Sois encourageant et personnalisÃƒÂ©.`

      const resp = await apiClient.post('/chat/ai', {
        mode: 'advisor',
        advisorType: 'bilan-niveau30',
        message,
        history: []
      })

      const parsed = extractJson(resp?.data?.reply || '')
      const summary = cleanBilanSummary(parsed?.summary || '')
      if (!summary) {
        setBilan(buildFallbackSummary(extraInfos))
      } else {
        setBilan({ summary })
      }
    } catch (e) {
      console.error('Niveau30 bilan fetch failed', e)
      setBilan(buildFallbackSummary(extraInfos))
      setBilanError('')
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
      await levelUp({ minLevel: 30, xpReward: XP_PER_LEVEL })
      setShowSuccess(true)
    } catch (e) {
      console.error('Niveau30 levelUp failed', e)
      setBilanError('Impossible de valider le niveau pour le moment. Reessaie.')
    } finally {
      setFinishing(false)
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

  const summary = cleanBilanSummary(bilan?.summary || '')
  const showBilan = phase === STEP_BILAN

  return (
    <div className="p-2 md:p-6">
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
                    Voir mon bilan
                  </button>
                )}

                {showBilan && (
                  <button
                    type="button"
                    onClick={onFinish}
                    disabled={bilanLoading || finishing}
                    className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200 w-full sm:w-auto disabled:opacity-60"
                  >
                    Terminer le module
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-card">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center text-white text-lg">30</div>
            <h2 className="text-xl font-bold">Bilan Niveaux 21-29</h2>
          </div>

          {/* Resume des modules */}
          {!showBilan && (
            <div className="space-y-2">
              <p className="text-text-secondary mb-3">Modules completes :</p>
              {LEVELS_SUMMARY.map((lvl) => (
                <div key={lvl.level} className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 border border-gray-100">
                  <div className="w-8 h-8 bg-[#c1ff72] rounded-full flex items-center justify-center text-sm font-bold">{lvl.level}</div>
                  <div className="flex-1">
                    <div className="font-medium text-sm">{lvl.title}</div>
                    <div className="text-xs text-text-secondary capitalize">{lvl.type}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {showBilan && bilanLoading && (
            <div className="text-center py-8">
              <div className="inline-block w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
              <p className="mt-2 text-text-secondary">Generation de ton bilan personnalise...</p>
            </div>
          )}

          {showBilan && bilanError && (
            <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-lg">{bilanError}</div>
          )}

          {showBilan && !bilanLoading && !bilanError && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="font-semibold">RÃƒÂ©sumÃƒÂ©</div>
              <div className="mt-2 whitespace-pre-wrap text-text-secondary text-sm">
                {summary || 'Bilan non disponible'}
              </div>
            </div>
          )}
        </div>
      </div>

      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="relative bg-white border border-gray-200 rounded-2xl p-8 shadow-2xl text-center max-w-md w-11/12">
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 w-10 h-10 bg-[#c1ff72] rounded-full flex items-center justify-center shadow-md animate-bounce text-xl">30</div>
            <h3 className="text-2xl font-extrabold mb-2">Niveau 30 termine !</h3>
            <p className="text-text-secondary mb-4">Tu as complete le module d'orientation. Bravo pour ton parcours !</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button onClick={() => navigate('/app/activites')} className="px-4 py-2 rounded-lg bg-white text-gray-900 border border-gray-200">Retour aux activites</button>
              <button onClick={() => navigate('/app/niveau/31')} className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200">Continuer l'aventure</button>
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