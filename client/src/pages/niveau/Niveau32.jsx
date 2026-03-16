import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import apiClient, { usersAPI } from '../../lib/api'
import { buildAvatarFromProfile } from '../../lib/avatar'
import { XP_PER_LEVEL, levelUp } from '../../lib/progression'
import { supabase } from '../../lib/supabase'
import { FaThumbsUp, FaFaceMeh, FaLightbulb } from 'react-icons/fa6'

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

export default function Niveau32() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [profile, setProfile] = useState(null)
  const [avatarUrl, setAvatarUrl] = useState('')

  const [dialogueIdx, setDialogueIdx] = useState(0)
  const [phase, setPhase] = useState('intro') // intro -> skills -> question -> success
  const [showSuccess, setShowSuccess] = useState(false)
  const [finishing, setFinishing] = useState(false)

  // Skills recommendation state
  const [recommendedSkills, setRecommendedSkills] = useState([])
  const [loadingSkills, setLoadingSkills] = useState(false)
  const [targetJob, setTargetJob] = useState('')

  const firstName = profile?.first_name || 'toi'

  const dialogues = useMemo(() => [
    { text: `${firstName}, on va regarder les compétences utiles pour ton métier.`, durationMs: 2200 },
    { text: `Les bonnes skills t'aident à progresser plus vite et à te démarquer.`, durationMs: 2200 },
    { text: `Voici une petite liste de compétences à développer en priorité...`, durationMs: 2200 },
  ], [firstName])

  const currentDialogue = dialogues[dialogueIdx] || { text: '', durationMs: 1500 }
  const { text: typed, done: typedDone, skip } = useTypewriter(
    phase === 'intro' ? currentDialogue.text : '',
    currentDialogue.durationMs
  )

  // Load profile and results
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

        // Determine target job for skill recommendations
        const homePreference = (prof?.home_preference || '').trim()
        let jobForSkills = homePreference

        // If home_preference is "questionnaire" or empty, use job_recommendations from inscription questionnaire
        if (!homePreference || homePreference.toLowerCase() === 'questionnaire') {
          try {
            // Fetch from user_results with questionnaire_type = 'inscription'
            const { data: userResultsData } = await supabase
              .from('user_results')
              .select('job_recommendations, questionnaire_type')
              .eq('user_id', user.id)
              .eq('questionnaire_type', 'inscription')
              .order('created_at', { ascending: false })
              .limit(1)
              .single()
            
            if (userResultsData?.job_recommendations) {
              let list = userResultsData.job_recommendations
              if (typeof list === 'string') {
                try { list = JSON.parse(list) } catch {}
              }
              if (Array.isArray(list) && list.length > 0) {
                // Use first recommendation title
                const title = list[0]?.title || list[0]?.intitule || (typeof list[0] === 'string' ? list[0] : '')
                jobForSkills = title || 'un métier créatif'
              }
            }
          } catch (e) {
            console.warn('Could not fetch job recommendations from user_results:', e)
            jobForSkills = 'un métier créatif'
          }
        }

        setTargetJob(jobForSkills)

      } catch (e) {
        console.error('Niveau32 load error', e)
        if (!mounted) return
        setError('Erreur de chargement')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [navigate])

  // Generate skill recommendations when entering skills phase
  useEffect(() => {
    if (phase === 'skills' && recommendedSkills.length === 0 && !loadingSkills && targetJob) {
      generateSkills()
    }
  }, [phase, recommendedSkills.length, loadingSkills, targetJob])

  const generateSkills = async () => {
    setLoadingSkills(true)
    try {
      const prompt = `L'élève souhaite devenir "${targetJob}".
Propose 5 compétences clés à développer pour réussir dans ce métier.
Chaque compétence doit être très courte (4 mots maximum), concrète et actionnable.

Réponds en JSON strict : un tableau de 5 strings.
Exemple pour développeur web: ["Logique", "JavaScript", "Résolution de bugs", "Travail en équipe", "Veille technique"]
Réponds UNIQUEMENT avec le JSON, sans texte autour.`

      const resp = await apiClient.post('/chat/ai', {
        mode: 'advisor',
        advisorType: 'projects-generator',
        message: prompt,
        history: []
      })

      const reply = resp?.data?.reply || ''
      const jsonMatch = reply.match(/\[[\s\S]*\]/)
      
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        if (Array.isArray(parsed) && parsed.length > 0) {
          setRecommendedSkills(parsed.slice(0, 5))
          return
        }
      }
      
      setRecommendedSkills([
        'Communication',
        'Organisation',
        'Curiosité',
        'Esprit d\'analyse',
        'Travail en équipe'
      ])
    } catch (e) {
      console.error('Skill generation error:', e)
      setRecommendedSkills([
        'Communication',
        'Organisation',
        'Curiosité',
        'Esprit d\'analyse',
        'Travail en équipe'
      ])
    } finally {
      setLoadingSkills(false)
    }
  }

  const onDialogueNext = () => {
    if (!typedDone) { skip(); return }
    if (dialogueIdx < dialogues.length - 1) {
      setDialogueIdx(prev => prev + 1)
    } else {
      setPhase('skills')
    }
  }

  const handleAnswer = (hasIdeas) => {
    // User answered the question - proceed to finish
    setPhase('finishing')
    finishLevel()
  }

  const finishLevel = async () => {
    if (finishing) return
    setFinishing(true)
    try {
      // Save recommended skills to extra info
      await usersAPI.saveExtraInfo([
        {
          question_id: 'niveau32_skills_completed',
          question_text: 'Compétences recommandées par métier',
          answer_text: JSON.stringify({
            targetJob,
            recommendedSkills,
            completedAt: new Date().toISOString()
          })
        }
      ]).catch(e => console.warn('saveExtraInfo N32 failed', e))
      
      await levelUp({ minLevel: 32, xpReward: XP_PER_LEVEL })
      setShowSuccess(true)
    } catch (e) {
      console.error('Niveau32 levelUp failed', e)
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
    <div className="p-2 md:p-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Left: Avatar + Dialogue */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-card">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
            <img src={avatarUrl} alt="Avatar" className="w-28 h-28 sm:w-36 sm:h-36 md:w-44 md:h-44 lg:w-52 lg:h-52 rounded-2xl border border-gray-100 shadow-sm object-contain bg-white mx-auto md:mx-0" />
            <div className="flex-1 w-full">
              <div className="relative bg-black text-white rounded-2xl p-4 md:p-5 w-full">
                <div className="text-base md:text-lg leading-relaxed whitespace-pre-wrap min-h-[3.5rem]">
                  {phase === 'intro' && typed}
                  {phase === 'skills' && !loadingSkills && `Est-ce que ces compétences te parlent ?`}
                  {phase === 'skills' && loadingSkills && 'Je prépare une sélection de compétences pour toi...'}
                  {phase === 'finishing' && 'Super ! Continue comme ça !'}
                </div>
                <div className="absolute -left-2 top-6 w-0 h-0 border-t-8 border-b-8 border-r-8 border-t-transparent border-b-transparent border-r-black" />
              </div>

              <div className="mt-4 flex flex-col gap-3">
                {phase === 'intro' && (
                  <button onClick={onDialogueNext} className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200 w-full sm:w-auto">
                    {dialogueIdx < dialogues.length - 1 ? 'Suivant' : 'Voir les skills'}
                  </button>
                )}
                {phase === 'skills' && !loadingSkills && (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button 
                      onClick={() => handleAnswer(true)} 
                      className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200 flex-1"
                    >
                      Oui <FaThumbsUp className="inline w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleAnswer(false)} 
                      className="px-4 py-2 rounded-lg bg-white text-black border border-gray-200 flex-1"
                    >
                      Non <FaFaceMeh className="inline w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Skill Recommendations */}
        <div className="bg-white border border-gray-200 rounded-2xl p-2 md:p-6 shadow-card">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center text-white font-bold">32</div>
            <h2 className="text-lg md:text-xl font-bold">Compétences à développer</h2>
          </div>

          {phase === 'intro' && (
            <div className="text-text-secondary text-center py-8">Les compétences recommandées apparaîtront après le dialogue.</div>
          )}

          {(phase === 'skills' || phase === 'finishing') && (
            <div className="space-y-4">
              {/* Target job display */}
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                <p className="text-sm text-text-secondary mb-1">Métier ciblé :</p>
                <p className="font-semibold text-lg">{targetJob}</p>
              </div>

              {/* Skill recommendations */}
              {loadingSkills ? (
                <div className="py-8 text-center">
                  <div className="inline-block w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  <p className="mt-2 text-text-secondary">Génération des compétences...</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-text-secondary">Compétences suggérées :</p>
                  <ul className="space-y-2">
                    {recommendedSkills.map((skill, idx) => (
                      <li 
                        key={idx}
                        className="flex items-center gap-3 p-3 bg-[#f8fff0] rounded-xl border border-[#c1ff72]"
                      >
                        <span className="w-8 h-8 bg-[#c1ff72] rounded-full flex items-center justify-center text-black font-bold text-sm">
                          {idx + 1}
                        </span>
                        <span className="font-medium">{skill}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Tips section */}
              <div className="mt-6 p-4 bg-blue-50 rounded-xl border border-blue-200">
                <p className="text-sm text-blue-800">
                  <strong><FaLightbulb className="inline w-4 h-4" /> Astuce :</strong> Commence par 1 ou 2 skills prioritaires, puis cherche une expérience concrète pour les pratiquer.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Success Popup */}
      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="relative bg-white border border-gray-200 rounded-2xl p-8 shadow-2xl text-center max-w-md w-11/12">
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 w-10 h-10 bg-[#c1ff72] rounded-full flex items-center justify-center shadow-md animate-bounce font-bold">32</div>
            <h3 className="text-2xl font-extrabold mb-2">Niveau 32 terminé !</h3>
            <p className="text-text-secondary mb-4">Tu as identifié des compétences utiles pour avancer vers ton futur métier.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button onClick={() => navigate('/app/activites')} className="px-4 py-2 rounded-lg bg-white text-gray-900 border border-gray-200">Retour aux activités</button>
              <button onClick={() => navigate('/app/niveau/33')} className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200">Niveau suivant</button>
            </div>
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