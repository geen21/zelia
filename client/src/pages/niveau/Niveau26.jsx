import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usersAPI } from '../../lib/api'
import { XP_PER_LEVEL, levelUp } from '../../lib/progression'
import { supabase } from '../../lib/supabase'
import { buildAvatarFromProfile } from '../../lib/avatar'
import { FaCalendarDays, FaBullseye, FaEnvelope, FaClipboardList, FaFileLines, FaTrophy } from 'react-icons/fa6'

// Table data from Parcoursup 2026 synthesis
const TABLES = [
  {
    id: 1,
    title: 'Calendrier Chronologique',
    icon: <FaCalendarDays className="w-5 h-5" />,
    headers: ['Phase', 'Dates ClÃƒÂ©s', 'Ce que tu dois faire'],
    rows: [
      ['1. Information', 'DÃƒÂ©cembre - Janvier', "Explore le moteur de recherche. Regarde les critÃƒÂ¨res d'examen des vÃ…â€œux."],
      ['2. Inscription', '20 Janvier - Mi-Mars', 'CrÃƒÂ©e ton dossier. Saisis tes 10 vÃ…â€œux (max) sans les classer.'],
      ['3. Finalisation', 'Mi-Mars - DÃƒÂ©but Avril', 'Deadline fatidique. ComplÃƒÂ¨te tes dossiers et confirme chaque vÃ…â€œu.'],
      ['4. RÃƒÂ©sultats', 'DÃƒÂ©but Juin - Mi-Juillet', 'ReÃƒÂ§ois les rÃƒÂ©ponses. RÃƒÂ©ponds aux propositions dans les dÃƒÂ©lais impartis.'],
      ['5. ComplÃƒÂ©mentaire', 'Mi-Juin - Septembre', "Pour ceux qui n'ont pas de proposition : postule sur les places restantes."],
    ],
  },
  {
    id: 2,
    title: 'Structure des Choix',
    icon: <FaBullseye className="w-5 h-5" />,
    headers: ['Concept', 'Limite / RÃƒÂ¨gle', 'DÃƒÂ©tail StratÃƒÂ©gique'],
    rows: [
      ['VÃ…â€œux', '10 maximum', 'Ils ne sont pas classÃƒÂ©s par prÃƒÂ©fÃƒÂ©rence (ordre secret).'],
      ['Sous-vÃ…â€œux', '20 au total', 'Pour les vÃ…â€œux multiples (ex: plusieurs lycÃƒÂ©es pour 1 BTS).'],
      ['Apprentissage', '10 vÃ…â€œux en plus', 'Les vÃ…â€œux en alternance comptent pour une liste sÃƒÂ©parÃƒÂ©e.'],
      ['SÃƒÂ©lectivitÃƒÂ©', '2 types de filiÃƒÂ¨res', 'Les licences (non-sÃƒÂ©lectif) vs BTS/PrÃƒÂ©pa/Ãƒâ€°coles (sÃƒÂ©lectif).'],
    ],
  },
  {
    id: 3,
    title: 'Comprendre les RÃƒÂ©ponses',
    icon: <FaEnvelope className="w-5 h-5" />,
    headers: ['RÃƒÂ©ponse ReÃƒÂ§ue', 'Signification', 'Action ÃƒÂ  entreprendre'],
    rows: [
      ['OUI', 'Admis sans rÃƒÂ©serve', 'Accepter (dÃƒÂ©finitivement ou en attendant mieux).'],
      ['OUI-SI', 'Admis avec soutien', "Accepter et s'engager ÃƒÂ  suivre une remise ÃƒÂ  niveau."],
      ['EN ATTENTE', "Liste d'attente", 'Surveiller son rang de classement tous les matins.'],
      ['NON', 'Refus (sÃƒÂ©lectif)', "Pas d'action possible, se concentrer sur les autres vÃ…â€œux."],
    ],
  },
  {
    id: 4,
    title: 'Dossier de Candidature',
    icon: <FaClipboardList className="w-5 h-5" />,
    headers: ['Ãƒâ€°lÃƒÂ©ment du Dossier', "Ce que c'est", 'Le "Petit Plus"'],
    rows: [
      ['Projet MotivÃƒÂ©', 'Lettre de motivation', 'Prouver que tu as lu le programme (citer une matiÃƒÂ¨re).'],
      ['Fiche Avenir', 'Avis des professeurs', 'Tes notes comptent, mais ton sÃƒÂ©rieux et ton assiduitÃƒÂ© aussi.'],
      ['ActivitÃƒÂ©s', 'CV extra-scolaire', 'Valoriser le sport, le bÃƒÂ©nÃƒÂ©volat ou le baby-sitting.'],
      ['PrÃƒÂ©fÃƒÂ©rences', 'Tes vÃ…â€œux de cÃ…â€œur', 'Expliquer ton projet pro global (lu seulement par le CAES).'],
    ],
  },
]

function useTypewriter(message, durationMs) {
  const [text, setText] = useState('')
  const [done, setDone] = useState(false)
  const intervalRef = useRef(null)
  const timeoutRef = useRef(null)

  useEffect(() => {
    setText('')
    setDone(false)
    const full = message || ''
    let i = 0
    const step = Math.max(15, Math.floor((durationMs || 1500) / Math.max(1, full.length)))
    intervalRef.current = setInterval(() => {
      i++
      setText(full.slice(0, i))
      if (i >= full.length) {
        clearInterval(intervalRef.current)
      }
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

// Table component
function InfoTable({ table }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {table.headers.map((header, idx) => (
              <th
                key={idx}
                className="bg-[#c1ff72] text-black font-semibold px-4 py-3 text-left border border-gray-300 text-sm"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, rowIdx) => (
            <tr key={rowIdx} className={rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
              {row.map((cell, cellIdx) => (
                <td
                  key={cellIdx}
                  className={`px-4 py-3 border border-gray-300 text-sm ${cellIdx === 0 ? 'font-medium' : 'text-text-secondary'}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function Niveau26() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [avatarUrl, setAvatarUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [dialogueStep, setDialogueStep] = useState(0)
  const [tableStep, setTableStep] = useState(0)
  const [showSuccess, setShowSuccess] = useState(false)
  const [finishing, setFinishing] = useState(false)

  const dialogueFinished = dialogueStep >= 2
  const firstName = profile?.first_name || 'toi'

  // Dialogue messages
  const dialogues = useMemo(() => [
    { text: `Re ${firstName}, je t'ai fait un petit PDF spÃƒÂ©cial lycÃƒÂ©ens que tu pourras suivre`, durationMs: 2200 },
    { text: 'Voici le plan !', durationMs: 1000 },
  ], [firstName])

  const currentDialogue = dialogues[dialogueStep] || { text: '', durationMs: 1000 }
  const { text: typed, done: typedDone, skip } = useTypewriter(
    dialogueFinished ? '' : currentDialogue.text,
    currentDialogue.durationMs
  )

  // Load profile
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
        console.error(e)
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
    setDialogueStep((prev) => prev + 1)
  }

  const completeLevel = async (mode = 'full') => {
    if (finishing) return
    setFinishing(true)
    try {
      await usersAPI.saveExtraInfo([
        {
          question_id: 'niveau26_parcoursup_read',
          question_text: 'Guide Parcoursup consultÃƒÂ© (Niveau 26)',
          answer_text: mode === 'skip' ? 'PassÃƒÂ© via dialogue' : 'Oui'
        },
        {
          question_id: 'niveau26_tables_viewed',
          question_text: 'Tableaux Parcoursup vus (Niveau 26)',
          answer_text: mode === 'skip' ? 'Niveau passÃƒÂ© sans lecture complÃƒÂ¨te' : `${TABLES.length} tableaux consultÃƒÂ©s`
        }
      ])
      await levelUp({ minLevel: 26, xpReward: XP_PER_LEVEL })
      setShowSuccess(true)
    } catch (e) {
      console.error('Niveau26 levelUp failed', e)
      setError('Impossible de valider le niveau pour le moment.')
    } finally {
      setFinishing(false)
    }
  }

  const onSkipLevel = async () => {
    if (!typedDone) {
      skip()
      return
    }
    await completeLevel('skip')
  }

  const onTableNext = async () => {
    if (tableStep < TABLES.length - 1) {
      setTableStep((prev) => prev + 1)
    } else {
      await completeLevel('full')
    }
  }

  const currentTable = TABLES[tableStep]
  const progress = ((tableStep + 1) / TABLES.length) * 100

  if (loading) {
    return (
      <div className="p-6 text-center">
        <div className="inline-block w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
        <p className="mt-2 text-text-secondary">ChargementÃ¢â‚¬Â¦</p>
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
    <div className="p-2 md:p-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Left: Avatar + Dialogue */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-card">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
            <img src={avatarUrl} alt="Avatar" className="w-28 h-28 sm:w-36 sm:h-36 md:w-44 md:h-44 lg:w-52 lg:h-52 rounded-2xl border border-gray-100 shadow-sm object-contain bg-white mx-auto md:mx-0" />
            <div className="flex-1 w-full">
              <div className="relative bg-black text-white rounded-2xl p-4 md:p-5 w-full">
                <div className="text-base md:text-lg leading-relaxed whitespace-pre-wrap min-h-[3.5rem]">
                  {!dialogueFinished ? typed : (
                    <>Fiche de synthÃƒÂ¨se Parcoursup 2026 - {currentTable.title}</>
                  )}
                </div>
                <div className="absolute -left-2 top-6 w-0 h-0 border-t-8 border-b-8 border-r-8 border-t-transparent border-b-transparent border-r-black" />
              </div>

              {!dialogueFinished && (
                <div className="mt-4 flex flex-col sm:flex-row gap-2">
                  <button
                    onClick={onDialogueNext}
                    disabled={finishing}
                    className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200 disabled:opacity-60"
                  >
                    {dialogueStep < dialogues.length - 1 ? 'Suivant' : 'Voir le plan'}
                  </button>
                  <button
                    onClick={onSkipLevel}
                    disabled={finishing}
                    className="px-4 py-2 rounded-lg bg-white text-gray-900 border border-gray-300 disabled:opacity-60"
                  >
                    {finishing ? 'ValidationÃ¢â‚¬Â¦' : 'Passer le niveau'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Tables */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-card">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center text-white text-xl">
              {dialogueFinished ? currentTable.icon : <FaFileLines className="w-5 h-5" />}
            </div>
            <h2 className="text-xl font-bold">
              {dialogueFinished ? currentTable.title : 'Fiche Parcoursup 2026'}
            </h2>
            {dialogueFinished && (
              <span className="ml-auto text-sm text-text-secondary">
                {tableStep + 1} / {TABLES.length}
              </span>
            )}
          </div>

          {!dialogueFinished ? (
            <div className="text-text-secondary text-center py-8">
              RÃƒÂ©ponds au dialogue pour dÃƒÂ©couvrir la fiche de synthÃƒÂ¨se.
            </div>
          ) : (
            <div className="space-y-4">
              {/* Progress bar */}
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-[#c1ff72] h-2 rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>

              {/* Table */}
              <InfoTable table={currentTable} />

              {/* Continue button */}
              <button
                onClick={onTableNext}
                disabled={finishing}
                className="w-full px-4 py-3 rounded-lg bg-[#c1ff72] text-black border border-gray-200 font-medium disabled:opacity-50"
              >
                {tableStep < TABLES.length - 1 ? 'Continuer' : 'Terminer'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Success Popup */}
      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="relative bg-white border border-gray-200 rounded-2xl p-8 shadow-2xl text-center max-w-md w-11/12">
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 w-10 h-10 bg-[#c1ff72] rounded-full flex items-center justify-center shadow-md animate-bounce"><FaTrophy className="w-5 h-5 text-yellow-600" /></div>
            <h3 className="text-2xl font-extrabold mb-2">Niveau 26 rÃƒÂ©ussi !</h3>
            <p className="text-text-secondary mb-4">Tu connais maintenant les bases de Parcoursup 2026.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button onClick={() => navigate('/app/activites')} className="px-4 py-2 rounded-lg bg-white text-gray-900 border border-gray-200">Retour aux activitÃƒÂ©s</button>
              <button onClick={() => navigate('/app/niveau/27')} className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200">Passer au niveau suivant</button>
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