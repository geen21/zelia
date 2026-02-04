import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import supabase from '../../lib/supabase'
import apiClient, { usersAPI } from '../../lib/api'
import { buildAvatarFromProfile } from '../../lib/avatar'
import { XP_PER_LEVEL, levelUp } from '../../lib/progression'

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

export default function Niveau23() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [profile, setProfile] = useState(null)
  const [avatarUrl, setAvatarUrl] = useState('')
  const [showSuccess, setShowSuccess] = useState(false)
  const [saving, setSaving] = useState(false)

  const [phase, setPhase] = useState('loading')
  const [schools, setSchools] = useState([])
  const [selectedSchools, setSelectedSchools] = useState([])
  const [contactAccepted, setContactAccepted] = useState(null)

  const firstName = profile?.first_name || 'toi'

  const dialogueText = (() => {
    if (phase === 'loading') return 'Chargement des écoles...'
    if (phase === 'intro') return `Bon avec tout ce qu'on s'est dit ${firstName}, je peux désormais te proposer une liste d'écoles qui te correspondent bien !`
    if (phase === 'list') return 'Voici la liste :'
    if (phase === 'selected') return 'Super, si ces écoles te plaisent, on peut te mettre directement en lien avec elles !'
    if (phase === 'contact') return "Tu acceptes qu'on donne quelques informations à ces écoles afin qu'elles te contactent ?"
    if (phase === 'end') return 'Très bien, bon on avance bien, tu as désormais les écoles, les métiers que tu veux faire, on avance super bien !'
    return ''
  })()

  const { text: typed, done: typedDone, skip } = useTypewriter(dialogueText, 2000)

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

        // Get user's extra info (niveau 21-22)
        const extraRes = await usersAPI.getExtraInfo().catch(() => null)
        const extraInfo = extraRes?.data?.entries || []

        // Get user's fields (niveau 21)
        const fieldsRes = await usersAPI.getFields().catch(() => null)
        const userFields = fieldsRes?.data?.fields || []

        // Build context for Gemini
        const contextParts = []

        // From user_fields
        userFields.forEach(f => {
          if (f.field_type || f.field_degree) {
            contextParts.push(`Filière choisie: ${f.field_type || ''} - ${f.field_degree || ''}`)
          }
        })

        // From informations_complementaires
        extraInfo.forEach(e => {
          if (e.question_id?.includes('niveau21') || e.question_id?.includes('niveau22')) {
            if (e.answer_text && e.answer_text !== '{}' && e.answer_text !== '[]') {
              contextParts.push(`${e.question_text}: ${e.answer_text}`)
            }
          }
        })

        // Get department from profile
        const userDepartment = (prof?.department || '').trim()

        // Ask Gemini to generate search keywords
        const geminiPrompt = `Tu es un expert en orientation scolaire. Voici le profil d'un étudiant:

${contextParts.join('\n')}
Département de l'étudiant: ${userDepartment || 'Non renseigné'}

La base de données formation_france contient des écoles avec ces colonnes:
- etab_nom: nom de l'établissement (ex: "Y SCHOOLS - Ecole Supérieure de Tourisme")
- nmc: nom court de la formation
- tc: type de cursus (ex: "Licence", "Master", "BTS", "BUT", "Ecole d'ingénieur", "Privés enseignement supérieur")
- departement: département (ex: "Paris", "Rhône", "Aube")

Génère des mots-clés pour une recherche SQL LIKE qui trouvera des écoles adaptées.
IMPORTANT: Choisis des mots-clés PERTINENTS au domaine (commerce, informatique, tourisme, ingénieur, etc.) PAS des mots génériques.
Le département doit correspondre au département de l'étudiant.

Renvoie UNIQUEMENT un JSON avec ce format exact:
{
  "keywords": ["mot1", "mot2", "mot3"],
  "department": "${userDepartment || ''}"
}

Réponds UNIQUEMENT avec le JSON, rien d'autre.`

        let keywords = []
        let searchDepartment = userDepartment

        try {
          const aiRes = await apiClient.post('/chat/ai', {
            mode: 'advisor',
            advisorType: 'school-search',
            message: geminiPrompt,
            history: []
          })
          const reply = aiRes?.data?.reply || ''
          const jsonMatch = reply.match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0])
            if (Array.isArray(parsed.keywords) && parsed.keywords.length > 0) {
              keywords = parsed.keywords.map(k => String(k || '').trim()).filter(Boolean)
            }
            if (parsed.department) {
              searchDepartment = parsed.department
            }
          }
        } catch (err) {
          console.warn('Gemini query generation failed:', err)
        }

        // Fallback if no keywords from Gemini
        if (keywords.length === 0) {
          userFields.forEach(f => {
            if (f?.field_type) {
              const words = f.field_type.toLowerCase().split(/\s+/)
              keywords.push(...words.filter(w => w.length > 3))
            }
          })
          if (keywords.length === 0) {
            keywords = ['licence', 'master', 'bts']
          }
        }

        console.log('Niveau23 search:', { keywords, department: searchDepartment })

        // Search formations using API
        try {
          const searchRes = await apiClient.post('/formations/search', {
            keywords: keywords.slice(0, 5),
            department: searchDepartment,
            limit: 20
          })
          const formations = searchRes?.data?.formations || []
          console.log('Niveau23 formations found:', formations.length)
          setSchools(formations)
        } catch (searchErr) {
          console.error('Formation search error:', searchErr)
          setSchools([])
        }

        setPhase('intro')
      } catch (err) {
        console.error('Niveau23 init error', err)
        setError('Erreur lors du chargement.')
      } finally {
        if (mounted) setLoading(false)
      }
    })()

    return () => { mounted = false }
  }, [navigate])

  const toggleSchool = (id) => {
    setSelectedSchools(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id)
      return [...prev, id]
    })
  }

  const onShowList = () => {
    setPhase('list')
  }

  const onValidateSchools = () => {
    if (selectedSchools.length === 0) return
    setPhase('selected')
  }

  const onContinueToContact = () => {
    setPhase('contact')
  }

  const onContactChoice = (accepted) => {
    setContactAccepted(accepted)
    setPhase('end')
  }

  const onValidate = async () => {
    if (saving) return
    setSaving(true)
    try {
      const selectedSchoolsData = schools
        .filter(s => selectedSchools.includes(s.id))
        .map(s => ({
          formation_id: s.id,
          school_name: s.etab_nom,
          school_data: s
        }))

      await usersAPI.saveSchools(selectedSchoolsData, contactAccepted)

      const entries = [
        {
          question_id: 'niveau23_schools',
          question_text: 'Écoles sélectionnées (Niveau 23)',
          answer_text: JSON.stringify(selectedSchoolsData.map(s => s.school_name))
        },
        {
          question_id: 'niveau23_contact',
          question_text: 'Accepte contact écoles (Niveau 23)',
          answer_text: contactAccepted ? 'Oui' : 'Non'
        }
      ]

      await usersAPI.saveExtraInfo(entries)
      await levelUp({ minLevel: 23, xpReward: XP_PER_LEVEL })
      setShowSuccess(true)
    } catch (err) {
      console.error('Niveau23 save error', err)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 text-center">
        <div className="inline-block w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
        <p className="mt-2 text-text-secondary">Chargement des écoles…</p>
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
        {/* Avatar & Dialogue */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-card">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
            <img
              src={avatarUrl}
              alt="Avatar"
              className="w-28 h-28 sm:w-36 sm:h-36 md:w-44 md:h-44 lg:w-52 lg:h-52 rounded-2xl border border-gray-100 shadow-sm object-contain bg-white mx-auto md:mx-0"
            />
            <div className="flex-1 w-full">
              <div 
                className="relative bg-black text-white rounded-2xl p-4 md:p-5 w-full cursor-pointer"
                onClick={skip}
              >
                <div className="text-base md:text-lg leading-relaxed whitespace-pre-wrap min-h-[3.5rem]">
                  {typed}
                </div>
                <div className="absolute -left-2 top-6 w-0 h-0 border-t-8 border-b-8 border-r-8 border-t-transparent border-b-transparent border-r-black" />
              </div>

              {phase === 'intro' && typedDone && (
                <button
                  type="button"
                  onClick={onShowList}
                  className="mt-4 px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200 font-medium"
                >
                  Voir les écoles
                </button>
              )}

              {phase === 'selected' && typedDone && (
                <button
                  type="button"
                  onClick={onContinueToContact}
                  className="mt-4 px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200 font-medium"
                >
                  Continuer
                </button>
              )}

              {phase === 'contact' && typedDone && (
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => onContactChoice(true)}
                    className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200 font-medium"
                  >
                    Accepter
                  </button>
                  <button
                    type="button"
                    onClick={() => onContactChoice(false)}
                    className="px-4 py-2 rounded-lg bg-white text-gray-900 border border-gray-200 font-medium"
                  >
                    Pas de suite
                  </button>
                </div>
              )}

              {phase === 'end' && typedDone && (
                <button
                  type="button"
                  onClick={onValidate}
                  disabled={saving}
                  className="mt-4 px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200 font-medium disabled:opacity-60"
                >
                  {saving ? 'Validation…' : 'Continuer'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Liste des écoles - col lg-6 */}
        {(phase === 'list' || phase === 'selected' || phase === 'contact' || phase === 'end') && (
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-card">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center text-white">🏫</div>
              <h2 className="text-xl font-bold">Écoles recommandées</h2>
            </div>

            {schools.length === 0 ? (
              <div className="text-text-secondary">Aucune école trouvée pour ton profil.</div>
            ) : (
              <>
                <div className="space-y-3 max-h-[400px] overflow-y-auto">
                  {schools.map((school) => (
                    <label
                      key={school.id}
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                        selectedSchools.includes(school.id)
                          ? 'bg-[#c1ff72]/20 border-[#c1ff72]'
                          : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedSchools.includes(school.id)}
                        onChange={() => toggleSchool(school.id)}
                        disabled={phase !== 'list'}
                        className="mt-1 w-5 h-5 accent-[#c1ff72]"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 truncate">{school.etab_nom}</div>
                        <div className="text-sm text-text-secondary">
                          {school.commune}{school.departement ? `, ${school.departement}` : ''}
                        </div>
                        {school.nmc && (
                          <div className="text-xs text-gray-500 mt-1 truncate">{school.nmc}</div>
                        )}
                        {school.tc && (
                          <div className="text-xs text-blue-600 mt-1">{school.tc}</div>
                        )}
                        {school.fiche && (
                          <a
                            href={school.fiche}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Voir la fiche Parcoursup
                          </a>
                        )}
                      </div>
                    </label>
                  ))}
                </div>

                {phase === 'list' && (
                  <button
                    type="button"
                    onClick={onValidateSchools}
                    disabled={selectedSchools.length === 0}
                    className="mt-4 w-full px-4 py-3 rounded-lg bg-[#c1ff72] text-black border border-gray-200 font-medium disabled:opacity-50"
                  >
                    Valider ma sélection ({selectedSchools.length})
                  </button>
                )}

                {phase !== 'list' && selectedSchools.length > 0 && (
                  <div className="mt-4 p-3 bg-gray-50 rounded-xl">
                    <div className="text-sm font-medium text-gray-700">
                      {selectedSchools.length} école{selectedSchools.length > 1 ? 's' : ''} sélectionnée{selectedSchools.length > 1 ? 's' : ''}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Success Popup */}
      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="relative bg-white border border-gray-200 rounded-2xl p-8 shadow-2xl text-center max-w-md w-11/12">
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 w-10 h-10 bg-[#c1ff72] rounded-full flex items-center justify-center shadow-md animate-bounce">🏆</div>
            <h3 className="text-2xl font-extrabold mb-2">Niveau 23 réussi !</h3>
            <p className="text-text-secondary mb-4">Tes écoles sont enregistrées.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button onClick={() => navigate('/app/activites')} className="px-4 py-2 rounded-lg bg-white text-gray-900 border border-gray-200">Retour aux activités</button>
              <button onClick={() => navigate('/app/niveau/24')} className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200">Passer au niveau suivant</button>
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