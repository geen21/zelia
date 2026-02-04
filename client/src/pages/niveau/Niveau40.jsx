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

function buildFallbackBilan(entries) {
  if (!entries || entries.length === 0) {
    return { sections: [{ title: 'Bilan', content: 'Aucune donnée disponible pour ce bilan.' }] }
  }

  const sections = []

  // --- Section 1: Marché du travail (N31) ---
  const n31 = entries.find(e => (e.question_id || '').toLowerCase().includes('niveau31'))
  if (n31) {
    try {
      const data = JSON.parse(n31.answer_text || '{}')
      sections.push({
        title: 'Marché du travail et débouchés',
        content: `Score obtenu : ${data.score || 'N/A'}. ${data.correctJobs ? `Métiers bien classés : ${data.correctJobs}.` : ''}`
      })
    } catch {
      sections.push({ title: 'Marché du travail et débouchés', content: 'Niveau complété.' })
    }
  }

  // --- Section 2: Mini-projets (N32) ---
  const n32 = entries.find(e => (e.question_id || '').toLowerCase().includes('niveau32'))
  if (n32) {
    try {
      const data = JSON.parse(n32.answer_text || '{}')
      const projectsList = Array.isArray(data.projectIdeas) ? data.projectIdeas.join(', ') : ''
      sections.push({
        title: 'Mini-projets étudiants',
        content: `Métier ciblé : ${data.targetJob || 'N/A'}. ${projectsList ? `Idées de projets : ${projectsList}.` : ''}`
      })
    } catch {
      sections.push({ title: 'Mini-projets étudiants', content: 'Niveau complété.' })
    }
  }

  // --- Section 3: Lettre à soi-même (N33) ---
  const n33 = entries.find(e => (e.question_id || '').toLowerCase().includes('niveau33'))
  if (n33) {
    try {
      const data = JSON.parse(n33.answer_text || '{}')
      sections.push({
        title: 'Lettre à soi-même',
        content: data.didWriteLetter ? `Lettre écrite et programmée pour envoi.` : 'Niveau complété sans écrire de lettre.'
      })
    } catch {
      sections.push({ title: 'Lettre à soi-même', content: 'Niveau complété.' })
    }
  }

  // --- Section 4: Gestion du stress (N34) ---
  const n34 = entries.find(e => (e.question_id || '').toLowerCase().includes('niveau34'))
  if (n34) {
    try {
      const data = JSON.parse(n34.answer_text || '{}')
      sections.push({
        title: 'Gestion du stress',
        content: `Profil identifié : ${data.profileTitle || data.profile || 'N/A'}.`
      })
    } catch {
      sections.push({ title: 'Gestion du stress', content: 'Niveau complété.' })
    }
  }

  // --- Section 5: Vidéo motivation (N35) ---
  const n35 = entries.find(e => (e.question_id || '').toLowerCase().includes('niveau35'))
  if (n35) {
    try {
      const data = JSON.parse(n35.answer_text || '{}')
      sections.push({
        title: 'Vidéo motivation',
        content: `Vidéo "${data.videoTitle || 'motivation'}" regardée.`
      })
    } catch {
      sections.push({ title: 'Vidéo motivation', content: 'Vidéo regardée.' })
    }
  }

  // --- Section 6: Soft skills (N36, N37, N38) ---
  const softSkillsContent = []
  
  const n36 = entries.find(e => (e.question_id || '').toLowerCase().includes('niveau36'))
  if (n36) {
    try {
      const data = JSON.parse(n36.answer_text || '{}')
      softSkillsContent.push(`Adaptabilité : ${data.situationsCompleted || 5} situations travaillées.`)
    } catch {
      softSkillsContent.push('Adaptabilité : niveau complété.')
    }
  }

  const n37 = entries.find(e => (e.question_id || '').toLowerCase().includes('niveau37'))
  if (n37) {
    try {
      const data = JSON.parse(n37.answer_text || '{}')
      softSkillsContent.push(`Résolution de problème : ${data.profileTitle || data.profile || 'profil identifié'}.`)
    } catch {
      softSkillsContent.push('Résolution de problème : niveau complété.')
    }
  }

  const n38 = entries.find(e => (e.question_id || '').toLowerCase().includes('niveau38'))
  if (n38) {
    try {
      const data = JSON.parse(n38.answer_text || '{}')
      softSkillsContent.push(`Résolution de problèmes (situations) : ${data.situationsCompleted || 5} situations analysées.`)
    } catch {
      softSkillsContent.push('Résolution de problèmes : niveau complété.')
    }
  }

  if (softSkillsContent.length > 0) {
    sections.push({
      title: 'Soft skills développés',
      content: softSkillsContent.join(' ')
    })
  }

  // --- Section 7: Feedback (N39) ---
  const n39Entries = entries.filter(e => (e.question_id || '').toLowerCase().includes('niveau39'))
  if (n39Entries.length > 0) {
    const feedbackParts = []
    n39Entries.forEach(entry => {
      const qid = entry.question_id || ''
      if (qid.includes('favorite_level')) feedbackParts.push(`Niveau préféré : ${entry.answer_text || 'N/A'}`)
      if (qid.includes('rating')) feedbackParts.push(`Note globale : ${entry.answer_text || 'N/A'}/5`)
    })
    if (feedbackParts.length > 0) {
      sections.push({
        title: 'Retours utilisateur',
        content: feedbackParts.join('. ') + '.'
      })
    }
  }

  // If no sections were created, add a generic one
  if (sections.length === 0) {
    sections.push({
      title: 'Parcours complété',
      content: 'Tu as terminé les niveaux 31 à 39. Bravo pour ton parcours !'
    })
  }

  return { sections }
}

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
      
      if (sections.length === 0) {
        // Use fallback bilan if AI parsing failed
        setBilan(buildFallbackBilan(extraInfos))
      } else {
        setBilan({ sections })
      }
    } catch (e) {
      console.error('Niveau40 bilan fetch failed', e)
      // Use fallback bilan on error
      setBilan(buildFallbackBilan(extraInfos))
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
                Tu as complété l'intégralité du parcours. Ton bilan final est prêt.
              </p>

              <button 
                onClick={() => navigate('/app/profile')}
                className="group w-full py-4 px-6 rounded-xl bg-black text-[#c1ff72] font-bold text-lg hover:bg-gray-900 active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg hover:shadow-xl"
              >
                <span>Accéder à mon Profil</span>
                <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}