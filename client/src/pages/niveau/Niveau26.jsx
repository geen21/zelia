import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usersAPI } from '../../lib/api'
import { XP_PER_LEVEL, levelUp } from '../../lib/progression'
import { supabase } from '../../lib/supabase'
import { FaCalendarDays, FaBullseye, FaEnvelope, FaClipboardList } from 'react-icons/fa6'

// Table data from Parcoursup 2026 synthesis
const TABLES = [
  {
    id: 1,
    title: 'Calendrier chronologique',
    icon: <FaCalendarDays className="w-5 h-5" />,
    headers: ['Phase', 'Dates clés', 'Ce que tu dois faire'],
    rows: [
      ['1. Information', 'Décembre - Janvier', "Explore le moteur de recherche. Regarde les critères d'examen des vœux."],
      ['2. Inscription', '20 Janvier - Mi-Mars', 'Crée ton dossier. Saisis tes 10 vœux (max) sans les classer.'],
      ['3. Finalisation', 'Mi-Mars - Début Avril', 'Deadline fatidique. Complète tes dossiers et confirme chaque vœu.'],
      ['4. Résultats', 'Début Juin - Mi-Juillet', 'Reçois les réponses. Réponds aux propositions dans les délais impartis.'],
      ['5. Complémentaire', 'Mi-Juin - Septembre', "Pour ceux qui n'ont pas de proposition : postule sur les places restantes."]
    ]
  },
  {
    id: 2,
    title: 'Structure des choix',
    icon: <FaBullseye className="w-5 h-5" />,
    headers: ['Concept', 'Limite / Règle', 'Détail stratégique'],
    rows: [
      ['Vœux', '10 maximum', 'Ils ne sont pas classés par préférence (ordre secret).'],
      ['Sous-vœux', '20 au total', 'Pour les vœux multiples (ex: plusieurs lycées pour 1 BTS).'],
      ['Apprentissage', '10 vœux en plus', 'Les vœux en alternance comptent pour une liste séparée.'],
      ['Sélectivité', '2 types de filières', 'Les licences (non-sélectif) vs BTS/Prépa/Écoles (sélectif).']
    ]
  },
  {
    id: 3,
    title: 'Comprendre les réponses',
    icon: <FaEnvelope className="w-5 h-5" />,
    headers: ['Réponse reçue', 'Signification', 'Action à entreprendre'],
    rows: [
      ['OUI', 'Admis sans réserve', 'Accepter (définitivement ou en attendant mieux).'],
      ['OUI-SI', 'Admis avec soutien', "Accepter et s'engager à suivre une remise à niveau."],
      ['EN ATTENTE', "Liste d'attente", 'Surveiller son rang de classement tous les matins.'],
      ['NON', 'Refus (sélectif)', "Pas d'action possible, se concentrer sur les autres vœux."]
    ]
  },
  {
    id: 4,
    title: 'Dossier de candidature',
    icon: <FaClipboardList className="w-5 h-5" />,
    headers: ['Élément du dossier', "Ce que c'est", 'Le "petit plus"'],
    rows: [
      ['Projet motivé', 'Lettre de motivation', 'Prouver que tu as lu le programme (citer une matière).'],
      ['Fiche avenir', 'Avis des professeurs', 'Tes notes comptent, mais ton sérieux et ton assiduité aussi.'],
      ['Activités', 'CV extra-scolaire', 'Valoriser le sport, le bénévolat ou le baby-sitting.'],
      ['Préférences', 'Tes vœux de cœur', 'Expliquer ton projet pro global (lu seulement par le CAES).']
    ]
  }
]

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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { navigate('/login'); return }
        const pRes = await usersAPI.getProfile().catch(() => null)
        if (!mounted) return
        setProfile(pRes?.data?.profile || pRes?.data || null)
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

  // Mark the guide as read as soon as the page is opened (no "finish" button needed).
  useEffect(() => {
    if (loading) return
    ;(async () => {
      try {
        await usersAPI.saveExtraInfo([
          {
            question_id: 'niveau26_parcoursup_read',
            question_text: 'Guide Parcoursup consulté',
            answer_text: 'Oui'
          },
          {
            question_id: 'niveau26_tables_viewed',
            question_text: 'Tableaux Parcoursup vus',
            answer_text: `${TABLES.length} tableaux consultés`
          }
        ])
        await levelUp({ minLevel: 26, xpReward: XP_PER_LEVEL })
      } catch (e) {
        console.warn('Niveau26 persist failed (non-blocking):', e)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  const firstName = profile?.first_name || 'toi'

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
    <div className="p-2 md:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-card">
          <h1 className="text-xl md:text-2xl font-bold mb-1">Infos Parcoursup</h1>
          <p className="text-text-secondary">
            Salut {firstName} ! Voici la fiche de synthèse Parcoursup 2026 : calendrier, structure des vœux, réponses possibles et dossier de candidature.
          </p>
        </div>

        {TABLES.map((table) => (
          <div key={table.id} className="bg-white border border-gray-200 rounded-2xl p-6 shadow-card">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center text-white">
                {table.icon}
              </div>
              <h2 className="text-xl font-bold">{table.title}</h2>
            </div>
            <InfoTable table={table} />
          </div>
        ))}
      </div>
    </div>
  )
}
