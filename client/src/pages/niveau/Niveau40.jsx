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

const LEVELS_SUMMARY = [
  { level: 31, title: 'Marché du travail et débouchés', type: 'jeu' },
  { level: 32, title: 'Mini-projets étudiants', type: 'idées' },
  { level: 33, title: 'Lettre à soi-même', type: 'écriture' },
  { level: 34, title: 'Gestion du stress', type: 'questionnaire' },
  { level: 35, title: 'Vidéo motivation', type: 'vidéo' },
  { level: 36, title: 'Soft skill : intelligence émotionnelle', type: 'questionnaire' },
  { level: 37, title: 'Soft skill : résolution de problème', type: 'questionnaire' },
  { level: 38, title: 'Soft skill : adaptabilité', type: 'questionnaire' },
  { level: 39, title: 'Retours utilisateurs', type: 'feedback' }
]

export default function Niveau40() {
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
          return id.startsWith('niveau31') || id.startsWith('niveau_31') ||
            id.startsWith('niveau32') || id.startsWith('niveau_32') ||
            id.startsWith('niveau33') || id.startsWith('niveau_33') ||
            id.startsWith('niveau34') || id.startsWith('niveau_34') ||
            id.startsWith('niveau35') || id.startsWith('niveau_35') ||
            id.startsWith('niveau36') || id.startsWith('niveau_36') ||
            id.startsWith('niveau37') || id.startsWith('niveau_37') ||
            id.startsWith('niveau38') || id.startsWith('niveau_38') ||
            id.startsWith('niveau39') || id.startsWith('niveau_39')
        })
        setExtraInfos(filtered)
      } catch (e) {
        console.error('Niveau40 load error', e)
        if (!mounted) return
        setError('Erreur de chargement')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [navigate])

  const bubble = useMemo(() => {
    if (phase === STEP_INTRO) return { text: 'C’est le moment du bilan final. Tu arrives au bout du parcours.', durationMs: 2200 }
    return { text: 'Voici ton bilan complet', durationMs: 900 }
  }, [phase])

  const { text: typed, done: typedDone, skip } = useTypewriter(bubble.text, bubble.durationMs)

  async function loadBilan() {
    setBilanError('')
    setBilanLoading(true)
    try {
      const context = extraInfos.length > 0
        ? formatExtraInfos(extraInfos)
        : 'Aucune donnée spécifique enregistrée pour les niveaux 31-39.'

      const summaryContext = LEVELS_SUMMARY.map(l => `- Niveau ${l.level}: ${l.title} (${l.type})`).join('\n')

      const message =
        `Tu dois produire un bilan final du parcours Zélia pour les niveaux 31 à 39.\n` +
        `Modules traversés:\n${summaryContext}\n\n` +
        `Données utilisateur:\n${context}\n\n` +
        `Réponds UNIQUEMENT en JSON valide au format:\n` +
        `{"sections":[{"title":"","content":""}]}` +
        `\nContraintes:\n` +
        `- 5 sections maximum, 2 à 4 phrases par section.\n` +
        `- Inclure: progression personnelle, soft skills, motivation, retours utilisateur, prochaines étapes.\n` +
        `- Ton encourageant et clair.`

      const resp = await apiClient.post('/chat/ai', {
        mode: 'advisor',
        advisorType: 'bilan-niveau40',
        message,
        history: []
      })

      const parsed = extractJson(resp?.data?.reply || '')
      const sections = Array.isArray(parsed?.sections) ? parsed.sections : []
      setBilan({ sections })
    } catch (e) {
      console.error('Niveau40 bilan fetch failed', e)
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
      await levelUp({ minLevel: 40, xpReward: XP_PER_LEVEL })
      setShowSuccess(true)
    } catch (e) {
      console.error('Niveau40 levelUp failed', e)
      setError('Impossible de valider le niveau.')
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

  return (
    <div className="p-4 md:p-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-card">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
            <img src={avatarUrl} alt="Avatar" className="w-28 h-28 sm:w-36 sm:h-36 md:w-44 md:h-44 lg:w-52 lg:h-52 rounded-2xl border border-gray-100 shadow-sm object-contain bg-white mx-auto md:mx-0" />
            <div className="flex-1 w-full">
              <div className="relative bg-black text-white rounded-2xl p-4 md:p-5 w-full">
                <div className="text-base md:text-lg leading-relaxed whitespace-pre-wrap min-h-[3.5rem]">
                  {phase === STEP_INTRO && typed}
                  {phase === STEP_BILAN && 'Découvre ton bilan final et garde ces points pour la suite.'}
                </div>
                <div className="absolute -left-2 top-6 w-0 h-0 border-t-8 border-b-8 border-r-8 border-t-transparent border-b-transparent border-r-black" />
              </div>

              <div className="mt-4 flex flex-col gap-3">
                {phase === STEP_INTRO && (
                  <button onClick={onIntroContinue} className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200 w-full sm:w-auto">
                    Voir le bilan final
                  </button>
                )}
                {phase === STEP_BILAN && (
                  <button onClick={onFinish} disabled={finishing} className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200 w-full sm:w-auto disabled:opacity-50">
                    Terminer le niveau
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-4 md:p-6 shadow-card">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center text-white font-bold">40</div>
            <h2 className="text-lg md:text-xl font-bold">Bilan final</h2>
          </div>

          {phase === STEP_INTRO && (
            <div className="text-text-secondary text-center py-8">Ton bilan apparaîtra ici.</div>
          )}

          {phase === STEP_BILAN && (
            <div className="space-y-4">
              {bilanLoading && (
                <div className="text-center py-6">
                  <div className="inline-block w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  <p className="mt-2 text-text-secondary">Génération du bilan...</p>
                </div>
              )}

              {bilanError && (
                <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded-lg text-sm">{bilanError}</div>
              )}

              {!bilanLoading && bilan && Array.isArray(bilan.sections) && (
                <div className="space-y-4">
                  {bilan.sections.map((section, idx) => (
                    <div key={idx} className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                      <h3 className="font-semibold mb-2">{section.title || `Section ${idx + 1}`}</h3>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{section.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="relative w-[92%] max-w-2xl rounded-[2.5rem] p-10 bg-gradient-to-br from-[#c1ff72] via-white to-[#a7f3d0] shadow-[0_0_80px_rgba(193,255,114,0.6)] text-center overflow-hidden">
            <div className="absolute inset-0 opacity-30">
              <div className="absolute -top-24 -left-24 w-64 h-64 bg-white rounded-full blur-3xl animate-pulse" />
              <div className="absolute top-10 right-10 w-32 h-32 bg-white/70 rounded-full blur-2xl animate-pulse" />
              <div className="absolute -bottom-20 right-0 w-72 h-72 bg-white/60 rounded-full blur-3xl animate-pulse" />
            </div>
            <div className="relative">
              <div className="mx-auto mb-6 w-20 h-20 rounded-full bg-black text-white flex items-center justify-center text-2xl font-extrabold shadow-lg animate-bounce">40</div>
              <h3 className="text-3xl md:text-4xl font-extrabold mb-3">Félicitations !</h3>
              <p className="text-gray-800 text-base md:text-lg mb-6">Tu as terminé tout le parcours Zélia. C'est un vrai accomplissement.</p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button onClick={() => navigate('/app/activites')} className="px-4 py-2 rounded-lg bg-white text-gray-900 border border-gray-200">Retour aux activités</button>
                <button onClick={() => navigate('/app/profile')} className="px-4 py-2 rounded-lg bg-black text-white">Voir mon profil</button>
              </div>
            </div>
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="absolute w-2 h-2 bg-pink-400 rounded-full left-8 top-10 animate-ping" />
              <div className="absolute w-2 h-2 bg-yellow-400 rounded-full right-10 top-12 animate-ping" />
              <div className="absolute w-2 h-2 bg-blue-400 rounded-full left-16 bottom-12 animate-ping" />
              <div className="absolute w-2 h-2 bg-green-400 rounded-full right-12 bottom-10 animate-ping" />
              <div className="absolute w-3 h-3 bg-white rounded-full left-1/2 top-6 animate-ping" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}