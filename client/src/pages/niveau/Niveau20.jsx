import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import apiClient, { usersAPI } from '../../lib/api'
import { buildAvatarFromProfile } from '../../lib/avatar'
import { XP_PER_LEVEL, levelUp } from '../../lib/progression'
import { supabase } from '../../lib/supabase'
import { FaClipboardList, FaTrophy, FaDownload } from 'react-icons/fa6'

const STEP_INTRO = 'intro'
const STEP_BILAN = 'bilan'

let jsPdfPromise = null
async function loadJsPdf() {
  if (!jsPdfPromise) jsPdfPromise = import('jspdf').then((m) => m.jsPDF)
  return jsPdfPromise
}

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

  const cleanedLines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s*→\s*Je suis d'accord\.?\s*$/i, '').trim())
    .filter((line) => line && !/^Je suis d'accord\.?$/i.test(line))

  return cleanedLines.join('\n').trim()
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
    .map((row) => `- [${row.question_id}] ${row.question_text || 'Question'}: ${row.answer_text || '—'}`)
    .join('\n')
}

function buildFallbackSummary(entries) {
  const byId = new Map()
  const list = Array.isArray(entries) ? entries : []
  list.forEach((row) => {
    const id = String(row?.question_id || '').toLowerCase()
    if (!id) return
    if (!byId.has(id)) byId.set(id, row)
  })

  const getAnswer = (id) => byId.get(id)?.answer_text || ''
  const safe = (value) => (value && String(value).trim() ? String(value).trim() : 'Non disponible')

  const n11Ranking = safe(getAnswer('niveau11_domain_ranking'))
  const n11Top3 = safe(getAnswer('niveau11_top3'))
  const n12Game = safe(getAnswer('niveau12_game_completed'))
  const n13Chat = safe(getAnswer('niveau13_chat_discovered'))
  const n14Job = safe(getAnswer('niveau14_target_job'))
  const n14Letter = safe(getAnswer('niveau14_letter_generated'))
  const n15Pos = safe(getAnswer('niveau15_positives'))
  const n15Neg = safe(getAnswer('niveau15_negatives'))
  const n16Video = safe(getAnswer('niveau16_video_watched'))

  const n17Target = safe(getAnswer('niveau17_target_job'))
  const n17Languages = safe(getAnswer('niveau17_languages'))
  const n17Pdf = safe(getAnswer('niveau17_cv_pdf_url'))

  const n18Ranks = list
    .filter((row) => String(row?.question_id || '').toLowerCase().startsWith('niveau18_rank_'))
    .sort((a, b) => {
      const ai = Number(String(a.question_id).split('_').pop()) || 0
      const bi = Number(String(b.question_id).split('_').pop()) || 0
      return ai - bi
    })
    .map((row, idx) => `${idx + 1}. ${row?.answer_text || '—'}`)

  let n18Source = ''
  const rawSource = getAnswer('niveau18_jobs_source')
  if (rawSource) {
    try {
      const parsed = JSON.parse(rawSource)
      if (Array.isArray(parsed)) n18Source = parsed.filter(Boolean).join(', ')
    } catch {
      n18Source = String(rawSource)
    }
  }

  const n19Items = list
    .filter((row) => {
      const id = String(row?.question_id || '').toLowerCase()
      return id.startsWith('niveau_19_') || id.startsWith('niveau19_')
    })
    .map((row) => String(row?.answer_text || '').trim())
    .filter((value) => value && !/^je suis d'accord\.?$/i.test(value))

  const topN18 = n18Ranks.length ? n18Ranks[0].replace(/^1\.\s*/, '') : 'Non disponible'
  const n19First = n19Items.length ? n19Items[0] : 'Non disponible'

  const summary = [
    `Tu as surtout exploré ${n11Top3} et découvert les débouchés du marché du travail.`,
    `Tu as découvert le chat communautaire, et ta lettre cible le métier ${n14Job}.`,
    `Côté CV, tu as travaillé ${n17Target} (${n17Languages})${n17Pdf !== 'Non disponible' ? ' avec un PDF exporté' : ''}.`,
    `${n18Source ? `Dans les pistes métiers (${n18Source}), ` : ''}ta priorité ressort sur ${topN18}.`,
    `Prochain axe d'amélioration: ${n19First}.`
  ].join('\n')

  return { summary: cleanBilanSummary(summary) }
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
  const [downloading, setDownloading] = useState(false)
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
          summary: 'Aucune donnée des niveaux 11 à 19 n\'a été trouvée. Termine d\'abord les niveaux précédents pour obtenir un bilan personnalisé.'
        })
        setBilanLoading(false)
        return
      }

      const context = formatExtraInfos(extraInfos)
      const levelsContext = [
        'N11: Classement des domaines professionnels',
        'N12: Débouchés et marché du travail',
        'N13: Chat communautaire',
        'N14: Lettre de motivation',
        'N15: Points positifs et négatifs',
        'N16: Vidéo : comment se vendre',
        'N17: Créer son CV',
        'N18: Classement des métiers',
        'N19: Axes d\'amélioration'
      ].join('\n')

      const message =
        `Tu dois produire un résumé très court des niveaux 11 à 19 à partir des informations ci-dessous.\n` +
        `Contexte des modules traversés:\n${levelsContext}\n\n` +
        `Réponds UNIQUEMENT en JSON valide au format suivant :\n` +
        `{"summary":""}\n` +
        `Contraintes:\n` +
        `- 5 phrases maximum, style clair et concret.\n` +
        `- Inclure brièvement: classement domaines/métiers (N11/N18), lettre de motivation (N14), CV (N17), axes d'amélioration (N19).\n` +
        `- Ne recopie pas les données brutes, synthétise.\n` +
        `- Sois encourageant et personnalisé.\n` +
        `Données:\n${context}`

      const resp = await apiClient.post('/chat/ai', {
        mode: 'advisor',
        advisorType: 'bilan-niveau20',
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
      console.error('Niveau20 bilan fetch failed', e)
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
      await levelUp({ minLevel: 20, xpReward: XP_PER_LEVEL })
      setShowSuccess(true)
    } catch (e) {
      console.error('Niveau20 levelUp failed', e)
      setBilanError('Impossible de valider le niveau pour le moment. Réessaie.')
    } finally {
      setFinishing(false)
    }
  }

  const downloadBilan = async () => {
    if (downloading || !bilan?.summary) return
    setDownloading(true)
    try {
      const JsPDF = await loadJsPdf()
      const doc = new JsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })
      const margin = 15
      const usable = doc.internal.pageSize.getWidth() - margin * 2
      let y = margin

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(18)
      doc.text('Bilan Zélia — Niveaux 11 à 19', margin, y)
      y += 10

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      const lines = doc.splitTextToSize(cleanBilanSummary(bilan.summary), usable)
      doc.text(lines, margin, y)

      doc.save('zelia-bilan-niveaux-11-19.pdf')
    } catch (e) {
      console.error('PDF generation failed', e)
    } finally {
      setDownloading(false)
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
            <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center text-white"><FaClipboardList className="w-5 h-5" /></div>
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
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="font-semibold">Résumé</div>
                <div className="mt-2 whitespace-pre-wrap text-text-secondary">
                  {summary || 'Non disponible'}
                </div>
              </div>

              <button
                onClick={downloadBilan}
                disabled={downloading}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-black text-white border border-gray-200 w-full sm:w-auto disabled:opacity-50 hover:bg-gray-800 transition-colors"
              >
                <FaDownload className="w-4 h-4" />
                {downloading ? 'Téléchargement…' : 'Télécharger le bilan'}
              </button>
            </div>
          )}
        </div>
      </div>

      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="relative bg-white border border-gray-200 rounded-2xl p-8 shadow-2xl text-center max-w-md w-11/12">
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 w-10 h-10 bg-[#c1ff72] rounded-full flex items-center justify-center shadow-md animate-bounce"><FaTrophy className="w-5 h-5 text-yellow-600" /></div>
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