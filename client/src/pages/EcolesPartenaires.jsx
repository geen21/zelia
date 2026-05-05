import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ecolesAPI } from '../lib/api'
import { FaLocationDot, FaGraduationCap, FaPaperPlane, FaCheck } from 'react-icons/fa6'
import { PiGraduationCapBold } from 'react-icons/pi'

const CITIES = [
  'Angers', 'Annecy', 'Bordeaux', 'Caen', 'Grenoble',
  'Lille', 'Lyon', 'Melun', 'Montpellier', 'Nancy',
  'Nantes', 'Nice', 'Paris', 'Rennes', 'St-Quentin-en-Yvelines',
  'Toulouse', 'Vannes'
]

export default function EcolesPartenaires() {
  const [formations, setFormations] = useState([])
  const [matched, setMatched] = useState([])
  const [userCity, setUserCity] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [cityFilter, setCityFilter] = useState('')
  const [submitted, setSubmitted] = useState(new Set())
  const [submitting, setSubmitting] = useState(null)
  const [tab, setTab] = useState('all')
  const [highlightId, setHighlightId] = useState(null)
  const location = useLocation()
  const navigate = useNavigate()

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
        const matchedList = Array.isArray(matchedRes?.data?.matched) ? matchedRes.data.matched : []
        setMatched(matchedList)
        const city = matchedRes?.data?.userCity || ''
        setUserCity(city)
        if (city) setCityFilter(city)
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

  useEffect(() => {
    if (loading) return
    const hash = location.hash || ''
    const match = hash.match(/^#formation-(.+)$/)
    if (!match) return
    const id = match[1]
    const inMatched = matched.some((f) => f.id === id)
    if (inMatched) setTab('matched')
    setHighlightId(id)
    requestAnimationFrame(() => {
      const el = document.getElementById(`formation-${id}`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    const t = setTimeout(() => setHighlightId(null), 2500)
    return () => clearTimeout(t)
  }, [loading, location.hash, matched])

  const handleSubmit = async (e, formationId) => {
    e.stopPropagation()
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
        <p className="mt-2 text-gray-500">Chargement...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-xl">{error}</div>
      </div>
    )
  }

  return (
    <div className="p-2 md:p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl md:text-2xl font-black mb-1">Formations</h1>
        <p className="text-gray-500 text-sm">Découvre les formations de nos écoles partenaires.</p>
      </div>

      {/* Tabs — pill style like the rest of the app */}
      <div className="flex flex-wrap gap-2 mb-5">
        <button
          onClick={() => { setTab('matched'); if (userCity) setCityFilter(userCity) }}
          className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
            tab === 'matched'
              ? 'bg-black text-white border-black'
              : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
          }`}
        >
          ✨ Pour toi{matched.length > 0 ? ` (${matched.length})` : ''}
        </button>
        <button
          onClick={() => { setTab('all'); setCityFilter('') }}
          className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
            tab === 'all'
              ? 'bg-black text-white border-black'
              : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
          }`}
        >
          Toutes
        </button>
      </div>

      {/* City filter — pill chips */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setCityFilter('')}
          className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
            cityFilter === ''
              ? 'bg-black text-white border-black'
              : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
          }`}
        >
          Toutes les villes
        </button>
        {CITIES.map((c) => (
          <button
            key={c}
            onClick={() => setCityFilter(cityFilter === c ? '' : c)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              cityFilter === c
                ? 'bg-black text-white border-black'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {c === userCity ? `📍 ${c}` : c}
          </button>
        ))}
      </div>

      {/* Formation cards — same style as BoiteAOutils */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          {tab === 'matched'
            ? 'Complète les quêtes "Domaines" et "Études & ville" pour activer les recommandations personnalisées.'
            : 'Aucune formation pour cette ville.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((f) => (
            <button
              key={f.id}
              id={`formation-${f.id}`}
              onClick={() => navigate(`/app/ecoles-partenaires/${f.id}`)}
              className={`bg-white border rounded-2xl p-4 text-left hover:shadow-lg hover:border-gray-300 transition-all group focus:outline-none focus:ring-2 focus:ring-[#c1ff72] ${
                highlightId === f.id
                  ? 'border-[#c1ff72] ring-2 ring-[#c1ff72] shadow-lg'
                  : 'border-gray-200'
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Icon box */}
                <div className="w-12 h-12 shrink-0 bg-gray-100 rounded-xl flex items-center justify-center group-hover:bg-[#c1ff72] transition-colors">
                  <PiGraduationCapBold className="w-6 h-6 text-gray-600 group-hover:text-black transition-colors" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="font-bold text-sm leading-tight line-clamp-2 flex-1">{f.formation_name}</h3>
                    {f.match_score != null && (
                      <span className="shrink-0 text-[10px] font-bold bg-[#c1ff72] text-black px-1.5 py-0.5 rounded-full border border-black/10">
                        {f.match_score}%
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {f.diploma_level && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                        {f.diploma_level}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
                      <FaLocationDot className="w-2.5 h-2.5" />{f.city}
                    </span>
                  </div>

                  {f.description && !f.description.startsWith('Pré-requis:') && (
                    <p className="text-[11px] text-gray-500 line-clamp-2 mb-2">{f.description}</p>
                  )}

                  {/* Quick submit button */}
                  <button
                    onClick={(e) => handleSubmit(e, f.id)}
                    disabled={submitted.has(f.id) || submitting === f.id}
                    title={submitted.has(f.id) ? 'Demande envoyée' : "Demande d'informations rapide"}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors disabled:opacity-60 ${
                      submitted.has(f.id)
                        ? 'bg-green-50 text-green-700 border border-green-200'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {submitted.has(f.id) ? (
                      <><FaCheck className="w-3 h-3" /> Demande envoyée</>
                    ) : submitting === f.id ? (
                      'Envoi...'
                    ) : (
                      <><FaPaperPlane className="w-3 h-3" /> Demande d'infos</>
                    )}
                  </button>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
