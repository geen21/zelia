import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ecolesAPI } from '../lib/api'
import { FaLocationDot, FaGraduationCap, FaPaperPlane, FaCheck, FaArrowLeft } from 'react-icons/fa6'
import { PiGraduationCapBold } from 'react-icons/pi'

const DESCRIPTION_MARKERS = [
  'Objectif',
  'Compétences développées',
  'Débouchés',
  'Poursuite possible',
  'Poursuites possibles',
  'Options filière',
  'Options transverses',
  'Certification',
  'Formation accessible',
  'Formation certifiante accessible'
]

function splitDescriptionIntoSections(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim()
  if (!clean) return []

  const escaped = DESCRIPTION_MARKERS
    .sort((a, b) => b.length - a.length)
    .map((marker) => marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')
  const markerRegex = new RegExp(`\\b(${escaped})\\s*:`, 'gi')
  const matches = [...clean.matchAll(markerRegex)]

  if (matches.length === 0) return [{ title: 'La formation', body: clean }]

  const sections = []
  const intro = clean.slice(0, matches[0].index).trim()
  if (intro) sections.push({ title: 'La formation', body: intro })

  matches.forEach((match, index) => {
    const start = match.index + match[0].length
    const end = matches[index + 1]?.index ?? clean.length
    const body = clean.slice(start, end).trim()
    if (body) sections.push({ title: match[1], body })
  })

  return sections
}

export default function FormationDetail() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [formation, setFormation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const [formRes, myRes] = await Promise.all([
          ecolesAPI.formation(id),
          ecolesAPI.mySubmissions().catch(() => ({ data: { submissions: [] } }))
        ])
        if (!mounted) return
        setFormation(formRes?.data?.formation || null)
        const subs = (myRes?.data?.submissions || []).map((s) => s.formation_id)
        setSubmitted(subs.includes(id))
      } catch (e) {
        console.error('FormationDetail load error', e)
        if (mounted) setError('Formation introuvable.')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [id])

  const handleSubmit = async () => {
    if (submitted || submitting) return
    setSubmitting(true)
    try {
      await ecolesAPI.submit(id)
      setSubmitted(true)
    } catch (e) {
      console.error('Submit error', e)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 text-center">
        <div className="inline-block w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
        <p className="mt-2 text-gray-500">Chargement...</p>
      </div>
    )
  }

  if (error || !formation) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-xl mb-4">
          {error || 'Formation introuvable.'}
        </div>
        <button
          onClick={() => navigate('/app/ecoles-partenaires')}
          className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-black"
        >
          <FaArrowLeft className="w-3.5 h-3.5" /> Retour aux formations
        </button>
      </div>
    )
  }

  const raw = formation.description || ''
  const prereqIdx = raw.indexOf('Pré-requis:')
  const mainDesc = prereqIdx > 0 ? raw.slice(0, prereqIdx).trim() : (raw.startsWith('Pré-requis:') ? '' : raw.trim())
  const prereqLine = prereqIdx >= 0 ? raw.slice(prereqIdx).trim() : null
  const descriptionSections = splitDescriptionIntoSections(mainDesc)

  return (
    <div className="p-2 md:p-6">
      <div className="mb-6">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors mb-4"
        >
          <FaArrowLeft className="w-3.5 h-3.5" />
          Retour
        </button>

        <div className="flex items-start gap-3">
          <div className="w-14 h-14 shrink-0 bg-gray-100 rounded-xl flex items-center justify-center">
            <PiGraduationCapBold className="w-8 h-8 text-gray-700" />
          </div>
          <div className="min-w-0">
            <p className="text-gray-500 text-sm mb-1">{formation.school_name}</p>
            <h1 className="text-xl md:text-2xl font-black mb-2 leading-tight">{formation.formation_name}</h1>
            <div className="flex flex-wrap gap-2">
              {formation.diploma_level && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-white text-gray-700 border border-gray-200">
                  <FaGraduationCap className="w-3 h-3" />
                  {formation.diploma_level}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-white text-gray-700 border border-gray-200">
                <FaLocationDot className="w-3 h-3" />
                {formation.city}
              </span>
              {formation.match_score != null && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-[#c1ff72] text-black border border-black/10">
                  {formation.match_score}% match
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-2 space-y-4">
          {descriptionSections.map((section) => (
            <section key={section.title} className="bg-white border border-gray-200 rounded-2xl p-4 md:p-5">
              <h2 className="text-sm font-black text-gray-900 mb-2">{section.title}</h2>
              <p className="text-sm leading-relaxed text-gray-600">{section.body}</p>
            </section>
          ))}

          {prereqLine && (
            <section className="bg-white border border-gray-200 rounded-2xl p-4 md:p-5">
              <h2 className="text-sm font-black text-gray-900 mb-2">Pré-requis</h2>
              <p className="text-sm leading-relaxed text-gray-600">
                {prereqLine.replace('Pré-requis:', '').trim()}
              </p>
            </section>
          )}
        </div>

        <aside className="bg-white border border-gray-200 rounded-2xl p-4 md:p-5 lg:sticky lg:top-6">
          <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mb-4">
            <FaPaperPlane className="w-5 h-5 text-gray-700" />
          </div>
          <h2 className="text-sm font-black text-gray-900 mb-1">Demande d'informations</h2>
          <p className="text-xs text-gray-500 mb-4">
            {formation.school_name} te recontactera après ta demande.
          </p>
          <button
            onClick={handleSubmit}
            disabled={submitted || submitting}
            className={`w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold transition-colors disabled:opacity-70 ${
              submitted
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-black text-white hover:bg-gray-800'
            }`}
          >
            {submitted ? (
              <><FaCheck className="w-3.5 h-3.5" /> Demande envoyée</>
            ) : submitting ? (
              'Envoi...'
            ) : (
              <><FaPaperPlane className="w-3.5 h-3.5" /> Demande d'informations</>
            )}
          </button>
        </aside>
      </div>
    </div>
  )
}