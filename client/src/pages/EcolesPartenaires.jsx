import { useEffect, useState } from 'react'
import { ecolesAPI } from '../lib/api'
import { FaLocationDot, FaGraduationCap, FaPaperPlane, FaCheck } from 'react-icons/fa6'

const CITIES = [
  'Angers', 'Bordeaux', 'Clermont-Ferrand', 'Grenoble', 'Laval',
  'Lille', 'Lyon', 'Montpellier', 'Nantes', 'Nice',
  'Paris', 'Rennes', 'Rouen', 'Saint-Quentin-en-Yvelines', 'Strasbourg',
  'Toulon', 'Toulouse'
]

export default function EcolesPartenaires() {
  const [formations, setFormations] = useState([])
  const [matched, setMatched] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [cityFilter, setCityFilter] = useState('')
  const [submitted, setSubmitted] = useState(new Set())
  const [submitting, setSubmitting] = useState(null)
  const [tab, setTab] = useState('matched')

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const [allRes, matchedRes, myRes] = await Promise.all([
          ecolesAPI.partenaires().catch(() => ({ data: { formations: [] } })),
          ecolesAPI.matched().catch(() => ({ data: { matched: [] } })),
          ecolesAPI.mySubmissions().catch(() => ({ data: { submissions: [] } }))
        ])
        if (!mounted) return
        setFormations(Array.isArray(allRes?.data?.formations) ? allRes.data.formations : [])
        setMatched(Array.isArray(matchedRes?.data?.matched) ? matchedRes.data.matched : [])
        const subs = (myRes?.data?.submissions || []).map((s) => s.formation_id)
        setSubmitted(new Set(subs))
      } catch (e) {
        console.error('EcolesPartenaires load error', e)
        if (mounted) setError('Erreur de chargement')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [])

  const handleSubmit = async (formationId) => {
    if (submitted.has(formationId) || submitting === formationId) return
    setSubmitting(formationId)
    try {
      await ecolesAPI.submit(formationId)
      setSubmitted((prev) => new Set([...prev, formationId]))
    } catch (e) {
      console.error('Submit error', e)
    } finally {
      setSubmitting(null)
    }
  }

  const displayList = tab === 'matched' ? matched : formations
  const filtered = cityFilter
    ? displayList.filter((f) => f.city === cityFilter)
    : displayList

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
    <div className="p-2 md:p-6">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-black mb-2">Écoles partenaires</h1>
        <p className="text-gray-500">Découvre les formations de nos écoles partenaires et candidate directement.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTab('matched')}
          className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
            tab === 'matched'
              ? 'bg-black text-white border-black'
              : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
          }`}
        >
          Recommandées pour toi {matched.length > 0 && `(${matched.length})`}
        </button>
        <button
          onClick={() => setTab('all')}
          className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
            tab === 'all'
              ? 'bg-black text-white border-black'
              : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
          }`}
        >
          Toutes les formations
        </button>
      </div>

      {/* City filter */}
      <div className="mb-6">
        <select
          value={cityFilter}
          onChange={(e) => setCityFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white"
        >
          <option value="">Toutes les villes</option>
          {CITIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* Formation cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((f) => (
          <div key={f.id} className="bg-white border border-gray-200 rounded-2xl p-5 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div>
                <h3 className="font-bold text-sm">{f.school_name}</h3>
                <p className="text-xs text-gray-500 mt-0.5">{f.formation_name}</p>
              </div>
              {f.match_score != null && (
                <span className="shrink-0 text-xs font-bold bg-[#c1ff72] text-black px-2 py-1 rounded-full">
                  {f.match_score}% match
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-2 mb-3 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <FaLocationDot className="w-3 h-3" />
                {f.city}
              </span>
              {f.diploma_level && (
                <span className="flex items-center gap-1">
                  <FaGraduationCap className="w-3 h-3" />
                  {f.diploma_level}
                </span>
              )}
            </div>

            {f.description && (
              <p className="text-xs text-gray-600 mb-3 line-clamp-2">{f.description}</p>
            )}

            <button
              onClick={() => handleSubmit(f.id)}
              disabled={submitted.has(f.id) || submitting === f.id}
              className={`w-full px-3 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                submitted.has(f.id)
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : 'bg-black text-white hover:bg-gray-800'
              } disabled:opacity-70`}
            >
              {submitted.has(f.id) ? (
                <><FaCheck className="w-3.5 h-3.5" /> Candidature envoyée</>
              ) : submitting === f.id ? (
                'Envoi...'
              ) : (
                <><FaPaperPlane className="w-3.5 h-3.5" /> Postuler</>
              )}
            </button>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          {tab === 'matched'
            ? 'Complète plus de niveaux pour obtenir des recommandations personnalisées.'
            : 'Aucune formation trouvée pour cette ville.'}
        </div>
      )}
    </div>
  )
}
