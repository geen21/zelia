import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import apiClient, { usersAPI } from '../../lib/api'
import { buildAvatarFromProfile } from '../../lib/avatar'
import { extractBilanJson, formatBilanExtraInfos, normalizeLevelSummaries } from '../../lib/levelBilan'
import { XP_PER_LEVEL, completeQuest, levelUp } from '../../lib/progression'
import { supabase } from '../../lib/supabase'
import { FaDownload } from 'react-icons/fa6'

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

const LEVELS_SUMMARY = [
  { level: 31, title: 'Explorer ses options : compétences', type: 'recherche' },
  { level: 32, title: 'Compétences recommandées par métier', type: 'idées' },
  { level: 33, title: 'Lettre à soi-même', type: 'écriture' },
  { level: 34, title: 'Gestion du stress', type: 'questionnaire' },
  { level: 35, title: 'Vidéo motivation', type: 'vidéo' },
  { level: 36, title: 'Soft skill : intelligence émotionnelle', type: 'questionnaire' },
  { level: 37, title: 'Quiz compétences', type: 'questionnaire' },
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
        ? formatBilanExtraInfos(extraInfos)
        : 'Aucune donnée spécifique enregistrée pour les niveaux 31-39.'

      const summaryContext = LEVELS_SUMMARY.map(l => `- Niveau ${l.level}: ${l.title} (${l.type})`).join('\n')

      const message =
        `Tu dois produire un bilan final du parcours Zélia pour les niveaux 31 à 39.\n` +
        `Modules traversés:\n${summaryContext}\n\n` +
        `Données utilisateur:\n${context}\n\n` +
        `Réponds UNIQUEMENT en JSON valide au format:\n` +
        `{"levelSummaries":[{"level":31,"title":"Explorer ses options : compétences","summary":""}]}` +
        `\nContraintes:\n` +
        `- Retourne 9 objets, un pour chaque niveau de 31 a 39.\n` +
        `- Garde exactement les numeros de niveau.\n` +
        `- Chaque summary doit faire 1 ou 2 phrases courtes, concretes et personnalisees.\n` +
        `- Fais ressortir ce qui a ete travaille sur le niveau concerne.\n` +
        `- Ton encourageant et clair.`

      const resp = await apiClient.post('/chat/ai', {
        mode: 'advisor',
        advisorType: 'bilan-niveau40',
        message,
        history: []
      })

      const parsed = extractBilanJson(resp?.data?.reply || '')
      setBilan({
        levelSummaries: normalizeLevelSummaries(parsed?.levelSummaries, LEVELS_SUMMARY, extraInfos)
      })
    } catch (e) {
      console.error('Niveau40 bilan fetch failed', e)
      setBilan({ levelSummaries: normalizeLevelSummaries([], LEVELS_SUMMARY, extraInfos) })
      if (extraInfos.length === 0) {
        setBilanError("Impossible de générer ton bilan pour le moment.")
      }
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
      await completeQuest('level_40')
      // Save diploma completion date
      await usersAPI.saveExtraInfo([{
        question_id: 'niveau40_diploma_date',
        answer_text: new Date().toISOString()
      }]).catch(() => {})
      setShowSuccess(true)
    } catch (e) {
      console.error('Niveau40 levelUp failed', e)
      setError('Impossible de valider le niveau.')
    } finally {
      setFinishing(false)
    }
  }

  const downloadBilan = async () => {
    if (downloading || !Array.isArray(bilan?.levelSummaries)) return
    setDownloading(true)
    try {
      const JsPDF = await loadJsPdf()
      const doc = new JsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })
      const margin = 15
      const usable = doc.internal.pageSize.getWidth() - margin * 2
      let y = margin

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(18)
      doc.text('Bilan final Zélia — Niveaux 31 à 39', margin, y)
      y += 10

      bilan.levelSummaries.forEach((section) => {
        if (y > 260) { doc.addPage(); y = margin }
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(12)
        doc.text(`Niveau ${section.level} - ${section.title || 'Section'}`, margin, y)
        y += 6
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(10)
        const lines = doc.splitTextToSize(String(section.summary || ''), usable)
        doc.text(lines, margin, y)
        y += lines.length * 5 + 6
      })

      doc.save('zelia-bilan-final-niveaux-31-39.pdf')
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

  const levelSummaries = Array.isArray(bilan?.levelSummaries) ? bilan.levelSummaries : []

  return (
    <div className="p-2 md:p-6">
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

        <div className="bg-white border border-gray-200 rounded-2xl p-2 md:p-6 shadow-card">
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

              {!bilanLoading && levelSummaries.length > 0 && (
                <div className="space-y-4">
                  {levelSummaries.map((section) => (
                    <div key={section.level} className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                      <h3 className="font-semibold mb-2">Niveau {section.level} · {section.title}</h3>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{section.summary}</p>
                    </div>
                  ))}

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
          )}
        </div>
      </div>

      {showSuccess && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm transition-opacity duration-500">
          <style>{`
            @keyframes fall {
              0% { transform: translateY(-10vh) rotate(0deg); opacity: 1; }
              100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
            }
            @keyframes scaleIn {
              0% { transform: scale(0.9); opacity: 0; }
              100% { transform: scale(1); opacity: 1; }
            }
            .confetti-piece {
              position: fixed;
              top: -20px;
              z-index: 50;
              animation: fall linear forwards;
            }
          `}</style>

          {/* Confetti Generator (Brand Colors) */}
          <div className="pointer-events-none fixed inset-0 overflow-hidden">
            {[...Array(60)].map((_, i) => {
              const left = Math.random() * 100
              const animDuration = 3 + Math.random() * 4
              const delay = Math.random() * 2
              const size = 6 + Math.random() * 6
              // Zélia Palette: Lime, Black, White, Gray
              const colors = ['#c1ff72', '#000000', '#ffffff', '#9ca3af']
              const color = colors[Math.floor(Math.random() * colors.length)]
              return (
                <div
                  key={i}
                  className="confetti-piece"
                  style={{
                    left: `${left}%`,
                    width: `${size}px`,
                    height: `${size}px`,
                    backgroundColor: color,
                    animationDuration: `${animDuration}s`,
                    animationDelay: `${delay}s`,
                    borderRadius: Math.random() > 0.5 ? '50%' : '0px',
                  }}
                />
              )
            })}
          </div>

          <div className="relative w-full max-w-sm mx-6 animate-[scaleIn_0.4s_ease-out_forwards]">
            {/* Main Card - Zélia Style (White card, black text, lime accents) */}
            <div className="bg-white rounded-[2rem] p-8 text-center shadow-2xl relative overflow-hidden">
              
              {/* Decorative Lime Gradient */}
              <div className="absolute -top-24 -right-24 w-48 h-48 bg-[#c1ff72] rounded-full blur-[60px] opacity-40 pointer-events-none"></div>
              <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-[#c1ff72] rounded-full blur-[60px] opacity-40 pointer-events-none"></div>

              {/* Avatar Display */}
              <div className="relative mx-auto mb-6 w-24 h-24">
                <div className="absolute inset-0 bg-[#c1ff72] rounded-full animate-ping opacity-20"></div>
                <div className="relative w-24 h-24 rounded-full p-[3px] bg-gradient-to-tr from-[#c1ff72] to-transparent">
                  <img 
                    src={avatarUrl} 
                    alt="Zelia Avatar" 
                    className="w-full h-full rounded-full object-cover border-2 border-white bg-gray-100"
                  />
                </div>
                {/* Level Badge */}
                <div className="absolute -bottom-2 -right-2 bg-black text-[#c1ff72] text-xs font-bold px-3 py-1 rounded-full border-[3px] border-white">
                  NIV 40
                </div>
              </div>

              <h2 className="text-3xl font-black text-black mb-2 tracking-tight uppercase">
                Félicitations
              </h2>
              <p className="text-gray-500 font-medium mb-8 leading-relaxed">
                Tu as complété l'intégralité du parcours. Ton diplôme Zélia est disponible sur ton profil !
              </p>

              <div className="flex flex-col gap-3">
                <button 
                  onClick={() => navigate('/app/profile')}
                  className="group w-full py-4 px-6 rounded-xl bg-black text-[#c1ff72] font-bold text-lg hover:bg-gray-900 active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg hover:shadow-xl"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17v3a2 2 0 002 2h14a2 2 0 002-2v-3" />
                  </svg>
                  <span>Télécharger mon diplôme</span>
                </button>

                <button 
                  onClick={() => navigate('/app/activites')}
                  className="w-full py-3 px-6 rounded-xl border border-gray-200 text-gray-600 font-medium hover:bg-gray-50 transition-all"
                >
                  Retour aux activités
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}