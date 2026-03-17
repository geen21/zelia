import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import supabase from '../../lib/supabase'
import apiClient, { usersAPI } from '../../lib/api'
import { buildAvatarFromProfile } from '../../lib/avatar'
import { XP_PER_LEVEL, levelUp } from '../../lib/progression'
import { FaGraduationCap, FaXmark, FaCircleCheck, FaTriangleExclamation, FaCheck, FaTrophy } from 'react-icons/fa6'

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
    .replace(/^\*\s*/gm, '')
    .trim()
}

export default function Niveau21() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [profile, setProfile] = useState(null)
  const [avatarUrl, setAvatarUrl] = useState('')
  const [showSuccess, setShowSuccess] = useState(false)
  const [saving, setSaving] = useState(false)

  // Dialogue steps
  const [step, setStep] = useState(0)
  const [dialogues, setDialogues] = useState([])

  // Filières
  const [filieres, setFilieres] = useState([])
  const [selectedFilieres, setSelectedFilieres] = useState([])
  const [filieresReady, setFilieresReady] = useState(false)

  // Notes (grades)
  const [notes, setNotes] = useState([{ subject: '', grade: '' }])
  const [notesSubmitted, setNotesSubmitted] = useState(false)

  // Faisabilité
  const [faisabilite, setFaisabilite] = useState(null)
  const [faisabiliteLoading, setFaisabiliteLoading] = useState(false)

  const firstName = profile?.first_name || 'toi'

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

        const name = prof?.first_name || 'toi'

        // Load user's actual job recommendations from user_results
        let jobRecommendations = []
        const homePreference = (prof?.home_preference || '').trim()
        const isQuestionnaire = homePreference.toLowerCase() === 'questionnaire'

        try {
          let query = supabase
            .from('user_results')
            .select('job_recommendations, questionnaire_type')
            .eq('user_id', user.id)

          if (isQuestionnaire) {
            query = query.eq('questionnaire_type', 'inscription')
          }

          const { data: userResultsData } = await query
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          if (userResultsData?.job_recommendations) {
            let list = userResultsData.job_recommendations
            if (typeof list === 'string') {
              try { list = JSON.parse(list) } catch { list = [] }
            }
            if (Array.isArray(list)) {
              jobRecommendations = list
                .map(item => {
                  if (typeof item === 'string') return item.trim()
                  return (item?.title || item?.intitule || '').trim()
                })
                .filter(Boolean)
                .slice(0, 6)
            }
          }
        } catch (e) {
          console.warn('Failed to load job_recommendations', e)
        }

        // Build the target job context
        const targetJob = (!isQuestionnaire && homePreference) ? homePreference : ''
        const jobContext = targetJob
          ? `Le métier principal visé est : "${targetJob}".`
          : ''
        const recsContext = jobRecommendations.length > 0
          ? `Les métiers recommandés selon le profil de l'élève sont : ${jobRecommendations.join(', ')}.`
          : ''

        // Generate filières based on actual job data
        let filieresData = []

        if (targetJob || jobRecommendations.length > 0) {
          const message = `Tu es un conseiller d'orientation expert. Voici le profil de l'élève :
${jobContext}
${recsContext}

Propose exactement 10 types de filières d'études (formations post-bac) qui correspondent DIRECTEMENT à ces métiers.
Les filières doivent être réalistes et cohérentes avec les métiers mentionnés.
Réponds en JSON strict : un tableau d'objets avec "type" (type d'étude court, ex: "BTS", "Licence", "Master", "École d'ingénieurs") et "degree" (intitulé précis du diplôme).
Exemple: [{"type":"BTS","degree":"BTS Commerce International"},{"type":"Licence","degree":"Licence en Droit"}]
Réponds UNIQUEMENT avec le JSON, sans texte autour.`

          const resp = await apiClient.post('/chat/ai', {
            mode: 'advisor',
            advisorType: 'filieres-generator',
            message,
            history: []
          })

          try {
            const reply = resp?.data?.reply || ''
            const jsonMatch = reply.match(/\[[\s\S]*\]/)
            if (jsonMatch) {
              filieresData = JSON.parse(jsonMatch[0])
            }
          } catch {
            filieresData = []
          }
        }

        // Fallback: try study_recommendations from analysis
        if (filieresData.length === 0) {
          try {
            const anal = await apiClient.get('/analysis/my-results', { headers: { 'Cache-Control': 'no-cache' }, params: { _: Date.now() } })
            const results = anal?.data?.results || {}
            const studyRecs = results.studyRecommendations || results.study_recommendations || []
            if (Array.isArray(studyRecs) && studyRecs.length > 0) {
              filieresData = studyRecs.map(item => ({
                type: sanitizeText(item.type || ''),
                degree: sanitizeText(item.degree || item.name || '')
              }))
            }
          } catch {
            // fallback below
          }
        }

        // If still empty, use hardcoded generic fallback (no AI call)
        if (filieresData.length === 0) {
          filieresData = [
            { type: 'BTS', degree: 'BTS Commerce International' },
            { type: 'DUT/BUT', degree: 'BUT Techniques de Commercialisation' },
            { type: 'Licence', degree: 'Licence en Droit' },
            { type: 'École de Commerce', degree: 'Programme Grande École' },
            { type: 'École d\'Ingénieurs', degree: 'Diplôme d\'Ingénieur Généraliste' },
            { type: 'Master', degree: 'Master en Management' },
            { type: 'Licence Pro', degree: 'Licence Pro Métiers du Numérique' },
            { type: 'BTS', degree: 'BTS Communication' },
            { type: 'CPGE', degree: 'Classe Préparatoire Économique et Commerciale' },
            { type: 'DN MADE', degree: 'DN MADE Graphisme' }
          ]
        }

        setFilieres(filieresData.slice(0, 10))

        // Build dialogues
        setDialogues([
          { text: `T'as plutôt bien avancé ${name}`, durationMs: 1200 },
          { text: `En vue de tes métiers que tu aimerais faire je vais te proposer plusieurs types de filières.`, durationMs: 2000 },
        ])

      } catch (e) {
        console.error('Niveau21 load error', e)
        if (!mounted) return
        setError('Erreur de chargement')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [navigate])

  const current = dialogues[Math.min(step, dialogues.length - 1)]
  const { text: typed, done: typedDone, skip } = useTypewriter(current?.text || '', current?.durationMs || 1200)

  const filieresStep = step >= dialogues.length && !filieresReady
  const confirmationStep = filieresReady && !notesSubmitted

  // Second round of dialogues after filières selection
  const [confirmDialogueIndex, setConfirmDialogueIndex] = useState(0)
  const confirmDialogues = [
    { text: `Super alors on avance comme ça ${firstName}, on va vraiment appuyer sur ces filières là durant la suite de ton parcours.`, durationMs: 2200 },
    { text: `Est-ce que tu peux m'indiquer tes notes aujourd'hui par matière ? Je te dirai honnêtement si ces notes sont envisageables pour toi.`, durationMs: 2500 },
    { text: `Tu n'es pas obligé de mettre toutes les matières mais les plus importantes.`, durationMs: 1800 }
  ]
  const currentConfirm = confirmDialogues[Math.min(confirmDialogueIndex, confirmDialogues.length - 1)]
  const { text: typedConfirm, done: typedConfirmDone, skip: skipConfirm } = useTypewriter(
    filieresReady ? currentConfirm?.text || '' : '',
    currentConfirm?.durationMs || 1500
  )
  const showNotesInput = confirmDialogueIndex >= confirmDialogues.length

  const onNext = () => {
    if (!typedDone) {
      skip()
      return
    }
    setStep(prev => prev + 1)
  }

  const onConfirmNext = () => {
    if (!typedConfirmDone) {
      skipConfirm()
      return
    }
    setConfirmDialogueIndex(prev => Math.min(prev + 1, confirmDialogues.length))
  }

  const toggleFiliere = (index) => {
    setSelectedFilieres(prev => {
      if (prev.includes(index)) {
        return prev.filter(i => i !== index)
      }
      return [...prev, index]
    })
  }

  const validateFilieres = () => {
    if (selectedFilieres.length === 0) return
    setFilieresReady(true)
  }

  const addNote = () => {
    setNotes(prev => [...prev, { subject: '', grade: '' }])
  }

  const removeNote = (index) => {
    setNotes(prev => prev.filter((_, i) => i !== index))
  }

  const updateNote = (index, field, value) => {
    setNotes(prev => prev.map((n, i) => i === index ? { ...n, [field]: value } : n))
  }

  const submitNotes = async () => {
    const validNotes = notes.filter(n => n.subject.trim() && n.grade.trim())
    if (validNotes.length === 0) return

    setNotesSubmitted(true)
    setFaisabiliteLoading(true)

    try {
      // Save notes to DB
      await usersAPI.saveNotes(validNotes)

      // Get AI evaluation
      const selectedFilieresNames = selectedFilieres.map(i => filieres[i]).map(f => `${f.type}: ${f.degree}`).join(', ')
      const notesText = validNotes.map(n => `${n.subject}: ${n.grade}`).join(', ')

      const message = `L'élève a choisi les filières suivantes: ${selectedFilieresNames}.
Ses notes actuelles sont: ${notesText}.
Évalue de manière honnête et bienveillante si ces filières sont réalistes pour l'élève avec ces notes.
Réponds avec un JSON strict: {"ok": true/false, "message": "texte court de 1-2 phrases maximum"}
IMPORTANT: Tutoie l'élève dans le message (utilise "tu", "tes", "toi").
Si les notes sont bonnes ou moyennes pour ces filières, réponds ok:true avec un message encourageant.
Si les notes sont insuffisantes, réponds ok:false avec un conseil constructif.
Réponds UNIQUEMENT avec le JSON.`

      const resp = await apiClient.post('/chat/ai', {
        mode: 'advisor',
        advisorType: 'grades-evaluation',
        message,
        history: []
      })

      try {
        const reply = resp?.data?.reply || ''
        const jsonMatch = reply.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          const result = JSON.parse(jsonMatch[0])
          setFaisabilite({
            ok: !!result.ok,
            message: sanitizeText(result.message || (result.ok ? 'Ces filières sont accessibles avec ton profil !' : 'Il faudra peut-être travailler certaines matières.'))
          })
        } else {
          setFaisabilite({ ok: true, message: 'Tes filières semblent accessibles avec de la motivation !' })
        }
      } catch {
        setFaisabilite({ ok: true, message: 'Continue comme ça, tu es sur la bonne voie !' })
      }
    } catch (err) {
      console.error('Notes submission error', err)
      setFaisabilite({ ok: true, message: 'Évaluation enregistrée.' })
    } finally {
      setFaisabiliteLoading(false)
    }
  }

  const onValidate = async () => {
    if (saving) return
    setSaving(true)
    try {
      const selectedFilieresData = selectedFilieres.map(i => filieres[i])
      const validNotes = notes.filter(n => n.subject.trim() && n.grade.trim())

      const entries = [
        {
          question_id: 'niveau21_filieres',
          question_text: 'Filières sélectionnées (Niveau 21)',
          answer_text: JSON.stringify(selectedFilieresData)
        },
        {
          question_id: 'niveau21_notes',
          question_text: 'Notes par matière (Niveau 21)',
          answer_text: JSON.stringify(validNotes)
        },
        {
          question_id: 'niveau21_faisabilite',
          question_text: 'Évaluation faisabilité (Niveau 21)',
          answer_text: JSON.stringify(faisabilite)
        }
      ]

      await usersAPI.saveExtraInfo(entries)
      // Save selected filieres to user_fields table
      await usersAPI.saveFields(selectedFilieresData)
      await levelUp({ minLevel: 21, xpReward: XP_PER_LEVEL })
      setShowSuccess(true)
    } catch (err) {
      console.error('Niveau21 save error', err)
    } finally {
      setSaving(false)
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

  return (
    <div className="p-2 md:p-6">
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
              <div className="relative bg-black text-white rounded-2xl p-4 md:p-5 w-full">
                <div className="text-base md:text-lg leading-relaxed whitespace-pre-wrap min-h-[3.5rem]">
                  {faisabiliteLoading
                    ? 'Super laisse moi 10 secondes pour te dire si c\'est ok.'
                    : (!filieresReady ? typed : typedConfirm)}
                </div>
                <div className="absolute -left-2 top-6 w-0 h-0 border-t-8 border-b-8 border-r-8 border-t-transparent border-b-transparent border-r-black" />
              </div>

              {/* Initial dialogue navigation */}
              {step < dialogues.length && (
                <button
                  type="button"
                  onClick={onNext}
                  className="mt-4 px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200"
                >
                  {step < dialogues.length - 1 ? 'Suivant' : 'Voir les filières'}
                </button>
              )}

              {/* Confirmation dialogue navigation */}
              {filieresReady && confirmDialogueIndex < confirmDialogues.length && (
                <button
                  type="button"
                  onClick={onConfirmNext}
                  className="mt-4 px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200"
                >
                  Suivant
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Content Panel */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-card">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center text-white"><FaGraduationCap className="w-5 h-5" /></div>
            <h2 className="text-xl font-bold">Choix de la filière</h2>
          </div>

          {/* Step 1: Show filières to select */}
          {filieresStep && (
            <>
              <p className="text-text-secondary mb-4">Coche les filières que tu aimerais faire :</p>
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {filieres.map((f, idx) => (
                  <label
                    key={idx}
                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                      selectedFilieres.includes(idx)
                        ? 'bg-[#c1ff72]/20 border-[#c1ff72]'
                        : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedFilieres.includes(idx)}
                      onChange={() => toggleFiliere(idx)}
                      className="mt-1 w-5 h-5 accent-[#c1ff72]"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">{sanitizeText(f.degree)}</div>
                      <div className="text-sm text-text-secondary">{sanitizeText(f.type)}</div>
                    </div>
                  </label>
                ))}
              </div>
              <button
                type="button"
                onClick={validateFilieres}
                disabled={selectedFilieres.length === 0}
                className="mt-4 w-full px-4 py-3 rounded-lg bg-[#c1ff72] text-black border border-gray-200 disabled:opacity-50"
              >
                Valider mes filières ({selectedFilieres.length} sélectionnée{selectedFilieres.length > 1 ? 's' : ''})
              </button>
            </>
          )}

          {/* Step 2: Show notes input */}
          {confirmationStep && showNotesInput && (
            <>
              <p className="text-text-secondary mb-4">Indique tes notes par matière :</p>
              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {notes.map((n, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Matière (ex: Maths)"
                      value={n.subject}
                      onChange={(e) => updateNote(idx, 'subject', e.target.value)}
                      className="w-28 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c1ff72]"
                    />
                    <input
                      type="text"
                      placeholder="Note (ex: 14/20)"
                      value={n.grade}
                      onChange={(e) => updateNote(idx, 'grade', e.target.value)}
                      className="w-40 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c1ff72]"
                    />
                    {notes.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeNote(idx)}
                        className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-500 rounded-full hover:bg-red-50"
                      ><FaXmark className="w-3 h-3" /></button>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addNote}
                className="mt-2 text-sm text-gray-600 hover:text-black"
              >
                + Ajouter une matière
              </button>
              <button
                type="button"
                onClick={submitNotes}
                disabled={notes.every(n => !n.subject.trim() || !n.grade.trim())}
                className="mt-4 w-full px-4 py-3 rounded-lg bg-[#c1ff72] text-black border border-gray-200 disabled:opacity-50"
              >
                Analyser
              </button>
            </>
          )}

          {/* Step 3: Show faisabilite result */}
          {notesSubmitted && (
            <>
              {faisabiliteLoading ? (
                <div className="text-center py-8">
                  <div className="inline-block w-8 h-8 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  <p className="mt-2 text-text-secondary">Analyse en cours…</p>
                </div>
              ) : faisabilite ? (
                <>
                  <div
                    className={`p-4 rounded-xl border ${
                      faisabilite.ok
                        ? 'bg-green-50 border-green-200 text-green-800'
                        : 'bg-red-50 border-red-200 text-red-800'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xl">{faisabilite.ok ? <FaCircleCheck className="w-5 h-5 text-green-500" /> : <FaTriangleExclamation className="w-5 h-5 text-amber-500" />}</span>
                      <span className="font-semibold">{faisabilite.ok ? 'C\'est faisable !' : 'À améliorer'}</span>
                    </div>
                    <p>{faisabilite.message}</p>
                  </div>

                  <div className="mt-4 p-4 bg-gray-50 rounded-xl">
                    <h3 className="font-semibold mb-2">Tes filières sélectionnées :</h3>
                    <ul className="space-y-1 text-sm">
                      {selectedFilieres.map(i => (
                        <li key={i} className="flex items-center gap-2">
                          <span className="text-[#c1ff72]"><FaCheck className="w-3 h-3" /></span>
                          {sanitizeText(filieres[i]?.degree)}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <button
                    type="button"
                    onClick={onValidate}
                    disabled={saving}
                    className="mt-4 w-full px-4 py-3 rounded-lg bg-[#c1ff72] text-black border border-gray-200 disabled:opacity-60"
                  >
                    {saving ? 'Validation…' : 'Continuer'}
                  </button>
                </>
              ) : null}
            </>
          )}

          {/* Waiting message when in dialogue phase */}
          {confirmationStep && !showNotesInput && (
            <div className="text-text-secondary">Lis le dialogue pour continuer...</div>
          )}

          {!filieresStep && !confirmationStep && !notesSubmitted && step < dialogues.length && (
            <div className="text-text-secondary">Lis le dialogue pour découvrir les filières.</div>
          )}
        </div>
      </div>

      {/* Success Popup */}
      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="relative bg-white border border-gray-200 rounded-2xl p-8 shadow-2xl text-center max-w-md w-11/12">
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 w-10 h-10 bg-[#c1ff72] rounded-full flex items-center justify-center shadow-md animate-bounce"><FaTrophy className="w-5 h-5 text-yellow-600" /></div>
            <h3 className="text-2xl font-extrabold mb-2">Niveau 21 réussi !</h3>
            <p className="text-text-secondary mb-4">Tes filières et tes notes sont enregistrées.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button onClick={() => navigate('/app/activites')} className="px-4 py-2 rounded-lg bg-white text-gray-900 border border-gray-200">Retour aux activités</button>
              <button onClick={() => navigate('/app/niveau/22')} className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200">Passer au niveau suivant</button>
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