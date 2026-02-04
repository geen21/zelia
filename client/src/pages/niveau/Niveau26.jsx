import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usersAPI } from '../../lib/api'
import { XP_PER_LEVEL, levelUp } from '../../lib/progression'
import { supabase } from '../../lib/supabase'
import { buildAvatarFromProfile } from '../../lib/avatar'

// Table data from Parcoursup 2026 synthesis
const TABLES = [
  {
    id: 1,
    title: 'Calendrier Chronologique',
    icon: '📅',
    headers: ['Phase', 'Dates Clés', 'Ce que tu dois faire'],
    rows: [
      ['1. Information', 'Décembre - Janvier', "Explore le moteur de recherche. Regarde les critères d'examen des vœux."],
      ['2. Inscription', '20 Janvier - Mi-Mars', 'Crée ton dossier. Saisis tes 10 vœux (max) sans les classer.'],
      ['3. Finalisation', 'Mi-Mars - Début Avril', 'Deadline fatidique. Complète tes dossiers et confirme chaque vœu.'],
      ['4. Résultats', 'Début Juin - Mi-Juillet', 'Reçois les réponses. Réponds aux propositions dans les délais impartis.'],
      ['5. Complémentaire', 'Mi-Juin - Septembre', "Pour ceux qui n'ont pas de proposition : postule sur les places restantes."],
    ],
  },
  {
    id: 2,
    title: 'Structure des Choix',
    icon: '🎯',
    headers: ['Concept', 'Limite / Règle', 'Détail Stratégique'],
    rows: [
      ['Vœux', '10 maximum', 'Ils ne sont pas classés par préférence (ordre secret).'],
      ['Sous-vœux', '20 au total', 'Pour les vœux multiples (ex: plusieurs lycées pour 1 BTS).'],
      ['Apprentissage', '10 vœux en plus', 'Les vœux en alternance comptent pour une liste séparée.'],
      ['Sélectivité', '2 types de filières', 'Les licences (non-sélectif) vs BTS/Prépa/Écoles (sélectif).'],
    ],
  },
  {
    id: 3,
    title: 'Comprendre les Réponses',
    icon: '📬',
    headers: ['Réponse Reçue', 'Signification', 'Action à entreprendre'],
    rows: [
      ['OUI', 'Admis sans réserve', 'Accepter (définitivement ou en attendant mieux).'],
      ['OUI-SI', 'Admis avec soutien', "Accepter et s'engager à suivre une remise à niveau."],
      ['EN ATTENTE', "Liste d'attente", 'Surveiller son rang de classement tous les matins.'],
      ['NON', 'Refus (sélectif)', "Pas d'action possible, se concentrer sur les autres vœux."],
    ],
  },
  {
    id: 4,
    title: 'Dossier de Candidature',
    icon: '📋',
    headers: ['Élément du Dossier', "Ce que c'est", 'Le "Petit Plus"'],
    rows: [
      ['Projet Motivé', 'Lettre de motivation', 'Prouver que tu as lu le programme (citer une matière).'],
      ['Fiche Avenir', 'Avis des professeurs', 'Tes notes comptent, mais ton sérieux et ton assiduité aussi.'],
      ['Activités', 'CV extra-scolaire', 'Valoriser le sport, le bénévolat ou le baby-sitting.'],
      ['Préférences', 'Tes vœux de cœur', 'Expliquer ton projet pro global (lu seulement par le CAES).'],
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
    { text: `Re ${firstName}, je t'ai fait un petit pdf que tu pourras suivre`, durationMs: 2000 },
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

  const onTableNext = async () => {
    if (tableStep < TABLES.length - 1) {
      setTableStep((prev) => prev + 1)
    } else {
      // Finish level
      if (finishing) return
      setFinishing(true)
      try {
        await levelUp({ minLevel: 26, xpReward: XP_PER_LEVEL })
        setShowSuccess(true)
      } catch (e) {
        console.error('Niveau26 levelUp failed', e)
        setError('Impossible de valider le niveau pour le moment.')
      } finally {
        setFinishing(false)
      }
    }
  }

  const currentTable = TABLES[tableStep]
  const progress = ((tableStep + 1) / TABLES.length) * 100

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
                  {!dialogueFinished ? typed : (
                    <>Fiche de synthèse Parcoursup 2026 - {currentTable.title}</>
                  )}
                </div>
                <div className="absolute -left-2 top-6 w-0 h-0 border-t-8 border-b-8 border-r-8 border-t-transparent border-b-transparent border-r-black" />
              </div>

              {!dialogueFinished && (
                <div className="mt-4">
                  <button
                    onClick={onDialogueNext}
                    className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200"
                  >
                    {dialogueStep < dialogues.length - 1 ? 'Suivant' : 'Voir le plan'}
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
              {dialogueFinished ? currentTable.icon : '📄'}
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
              Réponds au dialogue pour découvrir la fiche de synthèse.
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
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 w-10 h-10 bg-[#c1ff72] rounded-full flex items-center justify-center shadow-md animate-bounce">🏆</div>
            <h3 className="text-2xl font-extrabold mb-2">Niveau 26 réussi !</h3>
            <p className="text-text-secondary mb-4">Tu connais maintenant les bases de Parcoursup 2026.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button onClick={() => navigate('/app/activites')} className="px-4 py-2 rounded-lg bg-white text-gray-900 border border-gray-200">Retour aux activités</button>
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