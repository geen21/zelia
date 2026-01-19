import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import apiClient, { analysisAPI, usersAPI } from '../../lib/api'
import { buildAvatarFromProfile } from '../../lib/avatar'
import { XP_PER_LEVEL, levelUp } from '../../lib/progression'
import { supabase } from '../../lib/supabase'
import html2canvas from 'html2canvas'

let jsPdfFactoryPromise = null
async function loadJsPdf() {
  if (!jsPdfFactoryPromise) {
    jsPdfFactoryPromise = import('jspdf').then((mod) => mod.jsPDF)
  }
  return jsPdfFactoryPromise
}

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

function hexToRgba(hex, alpha) {
  if (!hex) return `rgba(0,0,0,${alpha})`
  const cleaned = hex.replace('#', '')
  const normalized = cleaned.length === 3
    ? cleaned.split('').map((c) => c + c).join('')
    : cleaned
  const num = parseInt(normalized, 16)
  if (Number.isNaN(num)) return `rgba(0,0,0,${alpha})`
  const r = (num >> 16) & 255
  const g = (num >> 8) & 255
  const b = num & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function sanitizeText(raw) {
  if (!raw) return ''
  return String(raw)
    .replace(/```[\s\S]*?```/g, '')
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

function normalizeList(items) {
  if (!Array.isArray(items)) return []
  return items.map((item) => String(item || '').trim()).filter(Boolean)
}

function toListFromInput(text) {
  if (!text) return []
  return String(text)
    .split(/,|;|\n/)
    .map((item) => item.trim())
    .filter(Boolean)
}

const DEFAULT_ACCENT = '#f68fff'

function buildFallbackCv({ profile, targetJob, companies, roles, education, qualities, skills, languages }) {
  const firstName = profile?.first_name || profile?.prenom || ''
  const lastName = profile?.last_name || profile?.nom || ''
  const fullName = `${firstName} ${lastName}`.trim() || 'Ton nom'
  const title = targetJob || 'Métier visé'
  const expItems = (companies.length || roles.length)
    ? Array.from({ length: Math.max(companies.length, roles.length) }).map((_, idx) => ({
      company: companies[idx] || 'Entreprise',
      role: roles[idx] || 'Fonction',
      period: '2023 - 2024',
      details: ['Missions principales adaptées au poste', 'Résultats et compétences développées', 'Collaboration et initiatives']
    }))
    : [{
      company: 'Projet personnel',
      role: title || 'Responsable',
      period: '2023 - 2024',
      details: ['Mise en place d’un projet concret', 'Organisation et suivi des objectifs', 'Apprentissage rapide et autonomie']
    }]

  return {
    fullName,
    title,
    summary: 'Profil motivé, orienté résultats et prêt à rejoindre une équipe dynamique.',
    experiences: expItems,
    education: (education.length ? education : ['Parcours scolaire à préciser']).map((item) => ({
      title: item,
      period: '2021 - 2023',
      details: ['Spécialisation pertinente', 'Projets clés ou options suivies']
    })),
    skills: skills.length ? skills : ['Organisation', 'Communication', 'Esprit d’équipe'],
    qualities: qualities.length ? qualities : ['Rigueur', 'Créativité', 'Autonomie'],
    languages: languages.length ? languages : ['Français'],
    interests: ['Innovation', 'Design', 'Tech']
  }
}

function EditableText({ value, onChange, className, tag = 'div', placeholder }) {
  const Tag = tag
  return (
    <Tag
      contentEditable
      suppressContentEditableWarning
      onBlur={(e) => onChange(e.currentTarget.textContent || '')}
      className={className}
      data-placeholder={placeholder}
    >
      {value || placeholder}
    </Tag>
  )
}

function EditableList({ items, onChange, className }) {
  const handleChange = (idx, value) => {
    const next = [...items]
    next[idx] = value
    onChange(next)
  }

  return (
    <ul className={className}>
      {items.map((item, idx) => (
        <li key={`${idx}-${item}`} className="leading-snug">
          <EditableText
            value={item}
            onChange={(val) => handleChange(idx, val)}
            className="outline-none"
            tag="span"
            placeholder="Élément"
          />
        </li>
      ))}
    </ul>
  )
}

export default function Niveau17() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [profile, setProfile] = useState(null)
  const [avatarUrl, setAvatarUrl] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [userId, setUserId] = useState('')

  const [step, setStep] = useState(0)
  const [companies, setCompanies] = useState([''])
  const [roles, setRoles] = useState([''])
  const [targetJob, setTargetJob] = useState('')
  const [education, setEducation] = useState([''])
  const [qualities, setQualities] = useState([''])
  const [skills, setSkills] = useState([''])
  const [languagesInput, setLanguagesInput] = useState('')
  const [savingInfo, setSavingInfo] = useState(false)
  const [saveError, setSaveError] = useState('')

  const [cvData, setCvData] = useState(null)
  const [photoUrl, setPhotoUrl] = useState('')
  const [accentColor, setAccentColor] = useState(DEFAULT_ACCENT)
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState('')
  const [exporting, setExporting] = useState(false)
  const [pdfUrl, setPdfUrl] = useState('')
  const [uploadingPdf, setUploadingPdf] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const cvRef = useRef(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          navigate('/login')
          return
        }
        if (!mounted) return
        setUserId(user.id)
        setUserEmail(user.email || '')

        const pRes = await usersAPI.getProfile().catch(() => null)
        if (!mounted) return
        const prof = pRes?.data?.profile || pRes?.data || null
        setProfile(prof)
        const avatar = buildAvatarFromProfile(prof, user.id)
        setAvatarUrl(avatar)
        setPhotoUrl(avatar)
      } catch (err) {
        console.error('Niveau17 load error', err)
        if (!mounted) return
        setError('Erreur de chargement')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [navigate])

  const firstName = useMemo(() => (
    profile?.first_name || profile?.prenom || 'toi'
  ), [profile])

  const steps = useMemo(() => ([
    { type: 'text', text: `On rentre dans le dur ${firstName}, c'est surement l'un des niveaux les plus long`, durationMs: 2600 },
    { type: 'text', text: "On va faire ton CV, bon c'est moi qui vais le faire mais il faut que tu m'aides!", durationMs: 2600 },
    { type: 'form', key: 'experience', text: 'Dit moi tes expériences professionnelles passées (stage, alternance, job etc..)', durationMs: 2200 },
    { type: 'form', key: 'target', text: 'Pour quel métier souhaite tu postuler ?', durationMs: 1800 },
    { type: 'form', key: 'education', text: 'Donne moi maintenant ton parcours scolaire', durationMs: 2000 },
    { type: 'form', key: 'qualities', text: 'Donne moi tes qualités principales', durationMs: 1800 },
    { type: 'form', key: 'skills', text: "Si tu as des compétences particulières, liste les moi ici (gestion d'un logiciel par exemple)", durationMs: 2200 },
    { type: 'form', key: 'languages', text: 'Langues maitrisées', durationMs: 1800 },
    { type: 'final', key: 'final', text: 'Merci, je génère ton cv ! Clique sur le bouton : Générer mon CV.', durationMs: 2000 }
  ]), [firstName])

  const current = steps[Math.min(step, steps.length - 1)]
  const { text: typed, done: typedDone, skip } = useTypewriter(current?.text || '', current?.durationMs || 1500)

  const accentSoft = useMemo(() => hexToRgba(accentColor, 0.16), [accentColor])

  const updateList = (setter, idx, value) => {
    setter((prev) => {
      const next = [...prev]
      next[idx] = value
      return next
    })
  }

  const addLine = (setter) => setter((prev) => [...prev, ''])

  const removeLine = (setter, idx) => {
    setter((prev) => {
      if (!Array.isArray(prev) || prev.length === 0) return ['']
      if (prev.length === 1) return ['']
      return prev.filter((_, i) => i !== idx)
    })
  }

  const addExperienceLine = () => {
    setCompanies((prev) => [...prev, ''])
    setRoles((prev) => [...prev, ''])
  }

  const removeExperienceLine = (idx) => {
    setCompanies((prev) => {
      if (!Array.isArray(prev) || prev.length === 0) return ['']
      if (prev.length === 1) return ['']
      return prev.filter((_, i) => i !== idx)
    })
    setRoles((prev) => {
      if (!Array.isArray(prev) || prev.length === 0) return ['']
      if (prev.length === 1) return ['']
      return prev.filter((_, i) => i !== idx)
    })
  }

  const saveExtraInfo = async (entries) => {
    if (!entries.length) return
    setSavingInfo(true)
    setSaveError('')
    try {
      await usersAPI.saveExtraInfo(entries)
    } catch (err) {
      console.warn('Extra info save failed', err)
      setSaveError('Impossible de sauvegarder les réponses. Réessaie plus tard.')
    } finally {
      setSavingInfo(false)
    }
  }

  const onValidateForm = async () => {
    if (!typedDone) {
      skip()
      return
    }
    const key = current?.key
    const entries = []

    if (key === 'experience') {
      const cleanCompanies = companies.map((c) => c.trim()).filter(Boolean)
      const cleanRoles = roles.map((r) => r.trim()).filter(Boolean)
      cleanCompanies.forEach((answer, idx) => {
        entries.push({
          question_id: `niveau17_experience_company_${idx + 1}`,
          question_text: 'Expérience professionnelle - Entreprise',
          answer_text: answer
        })
      })
      cleanRoles.forEach((answer, idx) => {
        entries.push({
          question_id: `niveau17_experience_role_${idx + 1}`,
          question_text: 'Expérience professionnelle - Fonction exercée',
          answer_text: answer
        })
      })
    }

    if (key === 'target') {
      if (targetJob.trim()) {
        entries.push({
          question_id: 'niveau17_target_job',
          question_text: 'Métier visé',
          answer_text: targetJob.trim()
        })
      }
    }

    if (key === 'education') {
      education.map((item) => item.trim()).filter(Boolean).forEach((answer, idx) => {
        entries.push({
          question_id: `niveau17_education_${idx + 1}`,
          question_text: 'Parcours scolaire',
          answer_text: answer
        })
      })
    }

    if (key === 'qualities') {
      qualities.map((item) => item.trim()).filter(Boolean).forEach((answer, idx) => {
        entries.push({
          question_id: `niveau17_qualities_${idx + 1}`,
          question_text: 'Qualités principales',
          answer_text: answer
        })
      })
    }

    if (key === 'skills') {
      skills.map((item) => item.trim()).filter(Boolean).forEach((answer, idx) => {
        entries.push({
          question_id: `niveau17_skills_${idx + 1}`,
          question_text: 'Compétences particulières',
          answer_text: answer
        })
      })
    }

    if (key === 'languages') {
      if (languagesInput.trim()) {
        entries.push({
          question_id: 'niveau17_languages',
          question_text: 'Langues maitrisées',
          answer_text: languagesInput.trim()
        })
      }
    }

    await saveExtraInfo(entries)
    setStep((prev) => Math.min(prev + 1, steps.length - 1))
  }

  const generateCv = async () => {
    if (generating) return
    setGenerating(true)
    setGenerateError('')
    try {
      const cleanCompanies = companies.map((c) => c.trim()).filter(Boolean)
      const cleanRoles = roles.map((r) => r.trim()).filter(Boolean)
      const cleanEducation = education.map((e) => e.trim()).filter(Boolean)
      const cleanQualities = qualities.map((q) => q.trim()).filter(Boolean)
      const cleanSkills = skills.map((s) => s.trim()).filter(Boolean)
      const cleanLanguages = toListFromInput(languagesInput)

      const payload = {
        name: `${profile?.first_name || profile?.prenom || ''} ${profile?.last_name || profile?.nom || ''}`.trim(),
        targetJob: targetJob.trim(),
        phone: profile?.phone_number || profile?.numero_telephone || profile?.numeroTelephone || '',
        location: profile?.department || profile?.departement || profile?.city || '',
        school: profile?.school || profile?.ecole || '',
        experiences: cleanCompanies.map((company, idx) => ({
          company,
          role: cleanRoles[idx] || ''
        })),
        education: cleanEducation,
        qualities: cleanQualities,
        skills: cleanSkills,
        languages: cleanLanguages
      }

      const message =
        `Tu es un expert RH. Génère un CV complet en français, avec des expériences enrichies (tâches, résultats) et un résumé professionnel.\n` +
        `Informations utilisateur:\n${JSON.stringify(payload, null, 2)}\n\n` +
        `Contraintes STRICTES :\n` +
        `- Réponds UNIQUEMENT en JSON valide (sans Markdown).\n` +
        `- Structure attendue : {"fullName":"","title":"","summary":"","experiences":[{"company":"","role":"","period":"","details":["","","..."]}],"education":[{"title":"","period":"","details":["",""]}],"skills":[""],"qualities":[""],"languages":[""],"interests":[""]}\n` +
        `- Ajoute des détails concrets pour remplir une page A4, sans inventer d'entreprise si aucune n'est fournie (utilise "Projet personnel").\n` +
        `- Sois concis, professionnel, et évite toute phrase d'introduction ou de conclusion.`

      const resp = await apiClient.post('/chat/ai', {
        mode: 'advisor',
        advisorType: 'cv-builder',
        message,
        history: []
      })

      const raw = resp?.data?.reply || ''
      const parsed = extractJson(raw)
      const fallback = buildFallbackCv({
        profile,
        targetJob: payload.targetJob,
        companies: cleanCompanies,
        roles: cleanRoles,
        education: cleanEducation,
        qualities: cleanQualities,
        skills: cleanSkills,
        languages: cleanLanguages
      })
      const cv = parsed && typeof parsed === 'object' ? {
        ...fallback,
        ...parsed,
        experiences: Array.isArray(parsed.experiences) ? parsed.experiences : fallback.experiences,
        education: Array.isArray(parsed.education) ? parsed.education : fallback.education,
        skills: normalizeList(parsed.skills).length ? normalizeList(parsed.skills) : fallback.skills,
        qualities: normalizeList(parsed.qualities).length ? normalizeList(parsed.qualities) : fallback.qualities,
        languages: normalizeList(parsed.languages).length ? normalizeList(parsed.languages) : fallback.languages,
        interests: normalizeList(parsed.interests).length ? normalizeList(parsed.interests) : fallback.interests
      } : fallback

      setCvData(cv)
    } catch (err) {
      console.error('CV generation error', err)
      setGenerateError('Impossible de générer le CV. Réessaie.')
    } finally {
      setGenerating(false)
    }
  }

  const onPhotoChange = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setPhotoUrl(reader.result?.toString() || '')
    }
    reader.readAsDataURL(file)
  }

  const exportPdf = async () => {
    if (!cvRef.current || exporting) return
    setExporting(true)
    setPdfUrl('')
    try {
      document.activeElement?.blur?.()
      const canvas = await html2canvas(cvRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff'
      })
      const imgData = canvas.toDataURL('image/png', 1.0)

      const JsPDF = await loadJsPdf()
      const pdf = new JsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()

      const imgWidth = canvas.width
      const imgHeight = canvas.height
      const imgRatio = imgWidth / imgHeight
      const pageRatio = pageWidth / pageHeight

      let drawW
      let drawH
      if (imgRatio > pageRatio) {
        drawW = pageWidth
        drawH = drawW / imgRatio
      } else {
        drawH = pageHeight
        drawW = drawH * imgRatio
      }
      const x = (pageWidth - drawW) / 2
      const y = (pageHeight - drawH) / 2
      pdf.addImage(imgData, 'PNG', x, y, drawW, drawH, undefined, 'FAST')

      const pdfDataUrl = pdf.output('datauristring')
      pdf.save('zelia-cv.pdf')

      setUploadingPdf(true)
      try {
        const response = await analysisAPI.saveSharePdf({
          dataUrl: pdfDataUrl,
          documentType: 'cv',
          metadata: { source: 'niveau17', userId }
        })
        const url = response?.data?.url || ''
        if (url) {
          setPdfUrl(url)
          try {
            await usersAPI.saveExtraInfo([
              {
                question_id: 'niveau17_cv_pdf_url',
                question_text: 'CV - PDF (Cloudinary)',
                answer_text: url
              }
            ])
          } catch (e) {
            console.warn('Failed to store CV URL in extra info (non-blocking):', e)
          }
        }
      } catch (uploadError) {
        console.warn('PDF upload failed', uploadError)
      } finally {
        setUploadingPdf(false)
      }
    } catch (err) {
      console.error('PDF export error', err)
    } finally {
      setExporting(false)
    }
  }

  const finishLevel = async () => {
    if (finishing) return
    setFinishing(true)
    try {
      await levelUp({ minLevel: 17, xpReward: XP_PER_LEVEL })
      navigate('/dashboard')
    } catch (err) {
      console.warn('Progression update failed (non-blocking):', err)
    } finally {
      setFinishing(false)
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

  const phone = profile?.phone_number || profile?.numero_telephone || profile?.numeroTelephone || ''
  const location = profile?.department || profile?.departement || profile?.city || ''

  return (
    <div className="p-4 md:p-6">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-6 items-start">
        {/* Left: Avatar + Dialogue */}
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
                  {typed}
                </div>
                <div className="absolute -left-2 top-6 w-0 h-0 border-t-8 border-b-8 border-r-8 border-t-transparent border-b-transparent border-r-black" />
              </div>

              {current?.type === 'text' && (
                <button
                  type="button"
                  onClick={() => {
                    if (!typedDone) {
                      skip()
                      return
                    }
                    setStep((prev) => Math.min(prev + 1, steps.length - 1))
                  }}
                  className="mt-4 px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200"
                >
                  {typedDone ? 'Suivant' : 'Passer'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right: Form + CV */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-card space-y-6">
          {saveError && (
            <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded-lg">{saveError}</div>
          )}

          {current?.type === 'form' && current?.key === 'experience' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Expérience professionnelle</h3>
              {companies.map((company, idx) => (
                <div key={`exp-${idx}`} className="relative grid grid-cols-1 md:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => removeExperienceLine(idx)}
                    aria-label="Supprimer cette expérience"
                    className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center text-gray-700 hover:bg-gray-50"
                  >
                    ✕
                  </button>
                  <div>
                    <label className="text-sm text-text-secondary">Entreprise</label>
                    <input
                      type="text"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none"
                      value={company}
                      onChange={(e) => updateList(setCompanies, idx, e.target.value)}
                      placeholder="Nom de l'entreprise"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-text-secondary">Fonction exercée</label>
                    <input
                      type="text"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none"
                      value={roles[idx] || ''}
                      onChange={(e) => updateList(setRoles, idx, e.target.value)}
                      placeholder="Fonction"
                    />
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={addExperienceLine}
                className="px-4 py-2 rounded-lg bg-white text-gray-900 border border-gray-300"
              >
                Ajouter une ligne
              </button>

              <button
                type="button"
                onClick={onValidateForm}
                className="w-full mt-2 px-4 py-3 rounded-lg bg-[#c1ff72] text-black border border-gray-200 disabled:opacity-60"
                disabled={savingInfo}
              >
                {savingInfo ? 'Validation…' : 'Valider'}
              </button>
            </div>
          )}

          {current?.type === 'form' && current?.key === 'target' && (
            <div className="space-y-3">
              <label className="text-sm text-text-secondary">Métier souhaité</label>
              <input
                type="text"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none"
                value={targetJob}
                onChange={(e) => setTargetJob(e.target.value)}
                placeholder="Ex: Chargé(e) de projet"
              />

              <button
                type="button"
                onClick={onValidateForm}
                className="w-full mt-2 px-4 py-3 rounded-lg bg-[#c1ff72] text-black border border-gray-200 disabled:opacity-60"
                disabled={savingInfo}
              >
                {savingInfo ? 'Validation…' : 'Valider'}
              </button>
            </div>
          )}

          {current?.type === 'form' && current?.key === 'education' && (
            <div className="space-y-3">
              <h3 className="text-lg font-semibold">Parcours scolaire</h3>
              {education.map((item, idx) => (
                <div key={`edu-${idx}`} className="relative">
                  <button
                    type="button"
                    onClick={() => removeLine(setEducation, idx)}
                    aria-label="Supprimer cette ligne"
                    className="absolute top-1/2 -translate-y-1/2 right-2 w-8 h-8 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center text-gray-700 hover:bg-gray-50"
                  >
                    ✕
                  </button>
                  <input
                    type="text"
                    className="w-full border border-gray-300 rounded-lg pl-3 pr-12 py-2 outline-none"
                    value={item}
                    onChange={(e) => updateList(setEducation, idx, e.target.value)}
                    placeholder="Ex: BTS Communication, Lycée..."
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={() => addLine(setEducation)}
                className="px-4 py-2 rounded-lg bg-white text-gray-900 border border-gray-300"
              >
                Ajouter une ligne
              </button>

              <button
                type="button"
                onClick={onValidateForm}
                className="w-full mt-2 px-4 py-3 rounded-lg bg-[#c1ff72] text-black border border-gray-200 disabled:opacity-60"
                disabled={savingInfo}
              >
                {savingInfo ? 'Validation…' : 'Valider'}
              </button>
            </div>
          )}

          {current?.type === 'form' && current?.key === 'qualities' && (
            <div className="space-y-3">
              <h3 className="text-lg font-semibold">Qualités principales</h3>
              {qualities.map((item, idx) => (
                <div key={`qual-${idx}`} className="relative">
                  <button
                    type="button"
                    onClick={() => removeLine(setQualities, idx)}
                    aria-label="Supprimer cette ligne"
                    className="absolute top-1/2 -translate-y-1/2 right-2 w-8 h-8 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center text-gray-700 hover:bg-gray-50"
                  >
                    ✕
                  </button>
                  <input
                    type="text"
                    className="w-full border border-gray-300 rounded-lg pl-3 pr-12 py-2 outline-none"
                    value={item}
                    onChange={(e) => updateList(setQualities, idx, e.target.value)}
                    placeholder="Ex: Organisé(e), créatif(ve)"
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={() => addLine(setQualities)}
                className="px-4 py-2 rounded-lg bg-white text-gray-900 border border-gray-300"
              >
                Ajouter une ligne
              </button>

              <button
                type="button"
                onClick={onValidateForm}
                className="w-full mt-2 px-4 py-3 rounded-lg bg-[#c1ff72] text-black border border-gray-200 disabled:opacity-60"
                disabled={savingInfo}
              >
                {savingInfo ? 'Validation…' : 'Valider'}
              </button>
            </div>
          )}

          {current?.type === 'form' && current?.key === 'skills' && (
            <div className="space-y-3">
              <h3 className="text-lg font-semibold">Compétences particulières</h3>
              {skills.map((item, idx) => (
                <div key={`skill-${idx}`} className="relative">
                  <button
                    type="button"
                    onClick={() => removeLine(setSkills, idx)}
                    aria-label="Supprimer cette ligne"
                    className="absolute top-1/2 -translate-y-1/2 right-2 w-8 h-8 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center text-gray-700 hover:bg-gray-50"
                  >
                    ✕
                  </button>
                  <input
                    type="text"
                    className="w-full border border-gray-300 rounded-lg pl-3 pr-12 py-2 outline-none"
                    value={item}
                    onChange={(e) => updateList(setSkills, idx, e.target.value)}
                    placeholder="Ex: Suite Adobe, Figma, Excel"
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={() => addLine(setSkills)}
                className="px-4 py-2 rounded-lg bg-white text-gray-900 border border-gray-300"
              >
                Ajouter une ligne
              </button>

              <button
                type="button"
                onClick={onValidateForm}
                className="w-full mt-2 px-4 py-3 rounded-lg bg-[#c1ff72] text-black border border-gray-200 disabled:opacity-60"
                disabled={savingInfo}
              >
                {savingInfo ? 'Validation…' : 'Valider'}
              </button>
            </div>
          )}

          {current?.type === 'form' && current?.key === 'languages' && (
            <div className="space-y-3">
              <label className="text-sm text-text-secondary">Langues maitrisées</label>
              <input
                type="text"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none"
                value={languagesInput}
                onChange={(e) => setLanguagesInput(e.target.value)}
                placeholder="Ex: Français, Anglais B2"
              />

              <button
                type="button"
                onClick={onValidateForm}
                className="w-full mt-2 px-4 py-3 rounded-lg bg-[#c1ff72] text-black border border-gray-200 disabled:opacity-60"
                disabled={savingInfo}
              >
                {savingInfo ? 'Validation…' : 'Valider'}
              </button>
            </div>
          )}

          {current?.type === 'final' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-4">
                <div>
                  <label className="text-sm text-text-secondary">Couleur principale</label>
                  <input
                    type="color"
                    className="block w-16 h-10 border border-gray-300 rounded-lg"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                  />
                </div>
                <div className="flex-1">
                  <label className="text-sm text-text-secondary">Photo de profil</label>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-1 px-4 py-2 rounded-lg bg-white text-gray-900 border border-gray-300"
                  >
                    Modifier la photo
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={onPhotoChange}
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={generateCv}
                className="w-full px-4 py-3 rounded-lg bg-[#c1ff72] text-black border border-gray-200"
                disabled={generating}
              >
                {generating ? 'Génération…' : 'Générer mon CV'}
              </button>

              {generateError && (
                <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded-lg">{generateError}</div>
              )}
            </div>
          )}

          {cvData && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={exportPdf}
                  className="px-4 py-2 rounded-lg bg-black text-white"
                  disabled={exporting}
                >
                  {exporting ? 'Création du PDF…' : 'Télécharger en PDF'}
                </button>
                <button
                  type="button"
                  onClick={finishLevel}
                  className="px-4 py-2 rounded-lg bg-white text-gray-900 border border-gray-300"
                  disabled={finishing}
                >
                  {finishing ? 'Validation…' : 'Terminer le niveau'}
                </button>
                {uploadingPdf && <span className="text-sm text-text-secondary">Upload Cloudinary…</span>}
                {pdfUrl && (
                  <a href={pdfUrl} target="_blank" rel="noreferrer" className="text-sm text-blue-600 underline">
                    Voir le PDF en ligne
                  </a>
                )}
              </div>

              <div className="w-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                <div
                  ref={cvRef}
                  className="w-full aspect-[210/297] bg-white text-gray-900"
                  style={{ fontFamily: '"Bricolage Grotesque", "Inter", "Segoe UI", Arial, sans-serif' }}
                >
                  <div className="grid grid-cols-[1fr_1.6fr] h-full">
                    <div className="h-full p-6 flex flex-col gap-6" style={{ background: accentSoft }}>
                      <div className="flex flex-col items-center gap-3">
                        <button
                          type="button"
                          className="relative w-28 h-28 rounded-full overflow-hidden border-4 border-white shadow-lg"
                          onClick={() => fileInputRef.current?.click()}
                          data-html2canvas-ignore="true"
                        >
                          <img src={photoUrl || avatarUrl} alt="Profil" className="w-full h-full object-cover" />
                          <span className="absolute inset-0 bg-black/40 text-white text-xs flex items-center justify-center opacity-0 hover:opacity-100">Modifier</span>
                        </button>
                        <div className="text-center">
                          <EditableText
                            value={cvData.fullName}
                            onChange={(val) => setCvData((prev) => ({ ...prev, fullName: val }))}
                            className="text-xl font-bold"
                            tag="div"
                            placeholder="Nom Prénom"
                          />
                          <EditableText
                            value={cvData.title}
                            onChange={(val) => setCvData((prev) => ({ ...prev, title: val }))}
                            className="text-sm uppercase tracking-wide"
                            tag="div"
                            placeholder="Métier visé"
                          />
                        </div>
                      </div>

                      <div className="space-y-3">
                        <h4 className="text-xs font-bold uppercase" style={{ color: accentColor }}>Contact</h4>
                        <div className="text-xs space-y-1">
                          <div>{phone || 'Téléphone'}</div>
                          <div>{userEmail || 'Email'}</div>
                          <div>{location || 'Localisation'}</div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <h4 className="text-xs font-bold uppercase" style={{ color: accentColor }}>Compétences</h4>
                        <div className="flex flex-wrap gap-2">
                          {cvData.skills.map((skill, idx) => (
                            <EditableText
                              key={`skill-${idx}`}
                              value={skill}
                              onChange={(val) => setCvData((prev) => {
                                const next = [...prev.skills]
                                next[idx] = val
                                return { ...prev, skills: next }
                              })}
                              className="text-xs px-2 py-1 rounded-full border border-white"
                              tag="span"
                              placeholder="Compétence"
                            />
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => setCvData((prev) => ({ ...prev, skills: [...prev.skills, 'Nouvelle compétence'] }))}
                          className="text-xs underline"
                          data-html2canvas-ignore="true"
                        >
                          Ajouter
                        </button>
                      </div>

                      <div className="space-y-3">
                        <h4 className="text-xs font-bold uppercase" style={{ color: accentColor }}>Qualités</h4>
                        <EditableList
                          items={cvData.qualities}
                          onChange={(next) => setCvData((prev) => ({ ...prev, qualities: next }))}
                          className="text-xs list-disc list-inside space-y-1"
                        />
                        <button
                          type="button"
                          onClick={() => setCvData((prev) => ({ ...prev, qualities: [...prev.qualities, 'Nouvelle qualité'] }))}
                          className="text-xs underline"
                          data-html2canvas-ignore="true"
                        >
                          Ajouter
                        </button>
                      </div>

                      <div className="space-y-3">
                        <h4 className="text-xs font-bold uppercase" style={{ color: accentColor }}>Langues</h4>
                        <EditableList
                          items={cvData.languages}
                          onChange={(next) => setCvData((prev) => ({ ...prev, languages: next }))}
                          className="text-xs list-disc list-inside space-y-1"
                        />
                        <button
                          type="button"
                          onClick={() => setCvData((prev) => ({ ...prev, languages: [...prev.languages, 'Nouvelle langue'] }))}
                          className="text-xs underline"
                          data-html2canvas-ignore="true"
                        >
                          Ajouter
                        </button>
                      </div>
                    </div>

                    <div className="h-full p-6 flex flex-col gap-6">
                      <div>
                        <h2 className="text-2xl font-bold" style={{ color: accentColor }}>Profil</h2>
                        <EditableText
                          value={cvData.summary}
                          onChange={(val) => setCvData((prev) => ({ ...prev, summary: val }))}
                          className="text-sm mt-2 leading-relaxed"
                          tag="p"
                          placeholder="Résumé professionnel"
                        />
                      </div>

                      <div>
                        <h2 className="text-lg font-bold" style={{ color: accentColor }}>Expérience professionnelle</h2>
                        <div className="space-y-4 mt-3">
                          {cvData.experiences.map((exp, idx) => (
                            <div key={`exp-${idx}`} className="space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <EditableText
                                  value={exp.company}
                                  onChange={(val) => setCvData((prev) => {
                                    const next = [...prev.experiences]
                                    next[idx] = { ...next[idx], company: val }
                                    return { ...prev, experiences: next }
                                  })}
                                  className="font-semibold"
                                  tag="span"
                                  placeholder="Entreprise"
                                />
                                <EditableText
                                  value={exp.period}
                                  onChange={(val) => setCvData((prev) => {
                                    const next = [...prev.experiences]
                                    next[idx] = { ...next[idx], period: val }
                                    return { ...prev, experiences: next }
                                  })}
                                  className="text-xs text-text-secondary"
                                  tag="span"
                                  placeholder="Dates"
                                />
                              </div>
                              <EditableText
                                value={exp.role}
                                onChange={(val) => setCvData((prev) => {
                                  const next = [...prev.experiences]
                                  next[idx] = { ...next[idx], role: val }
                                  return { ...prev, experiences: next }
                                })}
                                className="text-sm font-medium"
                                tag="div"
                                placeholder="Fonction"
                              />
                              <EditableList
                                items={exp.details || []}
                                onChange={(nextDetails) => setCvData((prev) => {
                                  const next = [...prev.experiences]
                                  next[idx] = { ...next[idx], details: nextDetails }
                                  return { ...prev, experiences: next }
                                })}
                                className="text-sm list-disc list-inside space-y-1"
                              />
                              <button
                                type="button"
                                onClick={() => setCvData((prev) => {
                                  const next = [...prev.experiences]
                                  const details = Array.isArray(next[idx].details) ? [...next[idx].details] : []
                                  details.push('Nouvelle mission')
                                  next[idx] = { ...next[idx], details }
                                  return { ...prev, experiences: next }
                                })}
                                className="text-xs underline"
                                data-html2canvas-ignore="true"
                              >
                                Ajouter une mission
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <h2 className="text-lg font-bold" style={{ color: accentColor }}>Parcours scolaire</h2>
                        <div className="space-y-3 mt-3">
                          {cvData.education.map((edu, idx) => (
                            <div key={`edu-${idx}`} className="space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <EditableText
                                  value={edu.title}
                                  onChange={(val) => setCvData((prev) => {
                                    const next = [...prev.education]
                                    next[idx] = { ...next[idx], title: val }
                                    return { ...prev, education: next }
                                  })}
                                  className="font-semibold"
                                  tag="span"
                                  placeholder="Diplôme"
                                />
                                <EditableText
                                  value={edu.period}
                                  onChange={(val) => setCvData((prev) => {
                                    const next = [...prev.education]
                                    next[idx] = { ...next[idx], period: val }
                                    return { ...prev, education: next }
                                  })}
                                  className="text-xs text-text-secondary"
                                  tag="span"
                                  placeholder="Dates"
                                />
                              </div>
                              <EditableList
                                items={edu.details || []}
                                onChange={(nextDetails) => setCvData((prev) => {
                                  const next = [...prev.education]
                                  next[idx] = { ...next[idx], details: nextDetails }
                                  return { ...prev, education: next }
                                })}
                                className="text-sm list-disc list-inside space-y-1"
                              />
                              <button
                                type="button"
                                onClick={() => setCvData((prev) => {
                                  const next = [...prev.education]
                                  const details = Array.isArray(next[idx].details) ? [...next[idx].details] : []
                                  details.push('Nouvel élément')
                                  next[idx] = { ...next[idx], details }
                                  return { ...prev, education: next }
                                })}
                                className="text-xs underline"
                                data-html2canvas-ignore="true"
                              >
                                Ajouter un détail
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <h2 className="text-lg font-bold" style={{ color: accentColor }}>Centres d'intérêt</h2>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {cvData.interests.map((interest, idx) => (
                            <EditableText
                              key={`int-${idx}`}
                              value={interest}
                              onChange={(val) => setCvData((prev) => {
                                const next = [...prev.interests]
                                next[idx] = val
                                return { ...prev, interests: next }
                              })}
                              className="text-xs px-2 py-1 rounded-full border border-gray-200"
                              tag="span"
                              placeholder="Intérêt"
                            />
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => setCvData((prev) => ({ ...prev, interests: [...prev.interests, 'Nouvel intérêt'] }))}
                          className="text-xs underline"
                          data-html2canvas-ignore="true"
                        >
                          Ajouter
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}