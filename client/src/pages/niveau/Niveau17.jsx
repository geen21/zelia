import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import apiClient, { analysisAPI, usersAPI } from '../../lib/api'
import { buildAvatarFromProfile } from '../../lib/avatar'
import { XP_PER_LEVEL, levelUp } from '../../lib/progression'
import { supabase } from '../../lib/supabase'
import html2canvas from 'html2canvas'
import { FaXmark } from 'react-icons/fa6'

let jsPdfFactoryPromise = null
async function loadJsPdf() {
  if (!jsPdfFactoryPromise) {
    jsPdfFactoryPromise = import('jspdf').then((mod) => mod.jsPDF)
  }
  return jsPdfFactoryPromise
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
    .replace(/```(?:\w+)?\s*([\s\S]*?)```/g, '$1')
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

  const handleRemove = (idx) => {
    if (items.length <= 1) return
    const next = items.filter((_, i) => i !== idx)
    onChange(next)
  }

  return (
    <ul className={className}>
      {items.map((item, idx) => (
        <li key={`${idx}-${item}`} className="leading-snug flex items-center gap-1">
          <span className="flex-1">
            <EditableText
              value={item}
              onChange={(val) => handleChange(idx, val)}
              className="outline-none"
              tag="span"
              placeholder="Tâche"
            />
          </span>
          {items.length > 1 && (
            <button
              type="button"
              onClick={() => handleRemove(idx)}
              className="text-red-400 hover:text-red-600 text-sm px-1 print:hidden"
              data-html2canvas-ignore="true"
              title="Supprimer"
            ><FaXmark className="w-3 h-3" /></button>
          )}
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

  const [companies, setCompanies] = useState([''])
  const [roles, setRoles] = useState([''])
  const [targetJob, setTargetJob] = useState('')
  const [education, setEducation] = useState([''])
  const [qualities, setQualities] = useState([''])
  const [skills, setSkills] = useState([''])
  const [skillSuggestions, setSkillSuggestions] = useState([])
  const [languages, setLanguages] = useState([''])
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
  const cvWrapperRef = useRef(null)
  const [cvScale, setCvScale] = useState(1)
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

        try {
          const { data: userResultsData } = await supabase
            .from('user_results')
            .select('skills_assessment')
            .eq('user_id', user.id)
            .eq('questionnaire_type', 'inscription')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          if (userResultsData?.skills_assessment) {
            const raw = String(userResultsData.skills_assessment)
            const suggestions = raw
              .split(/\r?\n/)
              .map((line) => line.replace(/^[\s*•-]+/, '').trim())
              .filter((line) => line.includes(':'))
              .map((line) => line.split(':')[0].replace(/\*/g, '').trim())
              .filter(Boolean)
              .filter((s) => !/évaluation|compétences clés|voici/i.test(s))
            if (mounted) setSkillSuggestions(suggestions)
          }
        } catch (e) {
          console.warn('Failed to load skill suggestions for Niveau17', e)
        }
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

  const saveAllExtraInfo = async () => {
    const entries = []

    companies.map((c) => c.trim()).filter(Boolean).forEach((answer, idx) => {
      entries.push({ question_id: `niveau17_experience_company_${idx + 1}`, question_text: 'Expérience professionnelle - Entreprise', answer_text: answer })
    })
    roles.map((r) => r.trim()).filter(Boolean).forEach((answer, idx) => {
      entries.push({ question_id: `niveau17_experience_role_${idx + 1}`, question_text: 'Expérience professionnelle - Fonction exercée', answer_text: answer })
    })
    if (targetJob.trim()) {
      entries.push({ question_id: 'niveau17_target_job', question_text: 'Métier visé', answer_text: targetJob.trim() })
    }
    education.map((item) => item.trim()).filter(Boolean).forEach((answer, idx) => {
      entries.push({ question_id: `niveau17_education_${idx + 1}`, question_text: 'Parcours scolaire', answer_text: answer })
    })
    qualities.map((item) => item.trim()).filter(Boolean).forEach((answer, idx) => {
      entries.push({ question_id: `niveau17_qualities_${idx + 1}`, question_text: 'Qualités principales', answer_text: answer })
    })
    skills.map((item) => item.trim()).filter(Boolean).forEach((answer, idx) => {
      entries.push({ question_id: `niveau17_skills_${idx + 1}`, question_text: 'Compétences particulières', answer_text: answer })
    })
    languages.map((item) => item.trim()).filter(Boolean).forEach((answer, idx) => {
      entries.push({ question_id: `niveau17_languages_${idx + 1}`, question_text: 'Langues maîtrisées', answer_text: answer })
    })

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
      const cleanLanguages = languages.map((l) => l.trim()).filter(Boolean)

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
        `- IMPORTANT : Chaque élément de "details" doit faire MAXIMUM 60 caractères. Sois concis et percutant.\n` +
        `- Maximum 3 tâches par expérience, 2 détails par formation.\n` +
        `- Ajoute des détails concrets pour remplir une page A4, sans inventer d'entreprise si aucune n'est fournie (utilise "Projet personnel").\n` +
        `- Sois concis, professionnel, et évite toute phrase d'introduction ou de conclusion.`

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

      let parsed = null
      try {
        const resp = await apiClient.post('/chat/ai', {
          mode: 'advisor',
          advisorType: 'cv-builder',
          message,
          history: []
        })

        const raw = resp?.data?.reply || ''
        parsed = extractJson(raw)
      } catch (aiError) {
        console.warn('CV AI generation failed, using fallback CV', aiError)
      }

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

  const handleGenerateClick = async () => {
    await saveAllExtraInfo()
    await generateCv()
  }

  // Keep the CV scaled to fit its container regardless of browser zoom
  useEffect(() => {
    const wrapper = cvWrapperRef.current
    if (!wrapper) return
    const observer = new ResizeObserver(() => {
      const wrapperWidth = wrapper.clientWidth
      const CV_FIXED_WIDTH = 794
      setCvScale(Math.min(1, wrapperWidth / CV_FIXED_WIDTH))
    })
    observer.observe(wrapper)
    return () => observer.disconnect()
  }, [cvData])

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

      const el = cvRef.current
      const savedTransform = el.style.transform
      const savedTransformOrigin = el.style.transformOrigin
      const wrapper = cvWrapperRef.current
      const savedOverflow = wrapper ? wrapper.style.overflow : ''
      const savedHeight = wrapper ? wrapper.style.height : ''
      el.style.transform = 'none'
      el.style.transformOrigin = ''
      if (wrapper) {
        wrapper.style.overflow = 'visible'
        wrapper.style.height = 'auto'
      }

      const canvas = await html2canvas(el, {
        scale: 3,
        useCORS: true,
        backgroundColor: '#ffffff',
        width: 794,
        height: 1123
      })

      el.style.transform = savedTransform
      el.style.transformOrigin = savedTransformOrigin
      if (wrapper) {
        wrapper.style.overflow = savedOverflow
        wrapper.style.height = savedHeight
      }
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
              { question_id: 'niveau17_cv_pdf_url', question_text: 'CV - PDF (Cloudinary)', answer_text: url }
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
      if (!pdfUrl && cvData) {
        try {
          await usersAPI.saveExtraInfo([
            { question_id: 'niveau17_cv_data', question_text: 'CV - Données JSON', answer_text: JSON.stringify(cvData) }
          ])
        } catch (e) {
          console.warn('Failed to save CV data (non-blocking):', e)
        }
      }
      await levelUp({ minLevel: 17, xpReward: XP_PER_LEVEL })
    } catch (err) {
      console.warn('Progression update failed (non-blocking):', err)
    } finally {
      setFinishing(false)
      navigate('/app/results')
    }
  }

  if (loading) {
    return (
      <div className="n17-page">
        <style>{styles}</style>
        <div className="n17-card n17-state">
          <div className="n17-spinner" />
          <p>Chargement…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="n17-page">
        <style>{styles}</style>
        <div className="n17-card n17-state">
          <i className="ph ph-warning-circle" aria-hidden="true" />
          <p>{error}</p>
        </div>
      </div>
    )
  }

  const phone = profile?.phone_number || profile?.numero_telephone || profile?.numeroTelephone || ''
  const location = profile?.department || profile?.departement || profile?.city || ''

  const renderRemovableInput = (item, idx, setter, removeFn, placeholder) => (
    <div key={idx} className="n17-field-row">
      <input
        type="text"
        className="n17-input"
        value={item}
        onChange={(e) => updateList(setter, idx, e.target.value)}
        placeholder={placeholder}
      />
      <button
        type="button"
        onClick={() => removeFn(idx)}
        aria-label="Supprimer cette ligne"
        className="n17-remove-btn"
      ><FaXmark className="w-3 h-3" /></button>
    </div>
  )

  return (
    <div className="n17-page">
      <style>{styles}</style>

      <div className="n17-card n17-header">
        <h1>Création du CV</h1>
        <p>Remplis tes informations, Zélia s'occupe de la mise en forme.</p>
      </div>

      {saveError && <div className="n17-card n17-error">{saveError}</div>}

      {!cvData && (
        <>
          <div className="n17-card">
            <h2>Expérience professionnelle</h2>
            {companies.map((company, idx) => (
              <div key={`exp-${idx}`} className="n17-experience-row">
                <div className="n17-field-row">
                  <input
                    type="text"
                    className="n17-input"
                    value={company}
                    onChange={(e) => updateList(setCompanies, idx, e.target.value)}
                    placeholder="Nom de l'entreprise"
                  />
                  <input
                    type="text"
                    className="n17-input"
                    value={roles[idx] || ''}
                    onChange={(e) => updateList(setRoles, idx, e.target.value)}
                    placeholder="Fonction"
                  />
                  <button
                    type="button"
                    onClick={() => removeExperienceLine(idx)}
                    aria-label="Supprimer cette expérience"
                    className="n17-remove-btn"
                  ><FaXmark className="w-3 h-3" /></button>
                </div>
              </div>
            ))}
            <button type="button" onClick={addExperienceLine} className="n17-add-btn">
              <i className="ph ph-plus" aria-hidden="true" /> Ajouter une ligne
            </button>
          </div>

          <div className="n17-card">
            <h2>Métier visé</h2>
            <input
              type="text"
              className="n17-input"
              value={targetJob}
              onChange={(e) => setTargetJob(e.target.value)}
              placeholder="Ex: Chargé(e) de projet"
            />
          </div>

          <div className="n17-card">
            <h2>Parcours scolaire</h2>
            {education.map((item, idx) => renderRemovableInput(item, idx, setEducation, (i) => removeLine(setEducation, i), "Ex: BTS Communication, Lycée..."))}
            <button type="button" onClick={() => addLine(setEducation)} className="n17-add-btn">
              <i className="ph ph-plus" aria-hidden="true" /> Ajouter une ligne
            </button>
          </div>

          <div className="n17-card">
            <h2>Qualités principales</h2>
            {skillSuggestions.length > 0 && (
              <div className="n17-suggestions">
                <p>Suggestions basées sur ton profil</p>
                <div className="n17-suggestion-list">
                  {skillSuggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      className="n17-suggestion-chip"
                      onClick={() => {
                        setQualities((prev) => {
                          const hasEmpty = prev.some((s) => !s.trim())
                          if (hasEmpty) {
                            const idx = prev.findIndex((s) => !s.trim())
                            const next = [...prev]
                            next[idx] = suggestion
                            return next
                          }
                          return [...prev, suggestion]
                        })
                        setSkillSuggestions((prev) => prev.filter((s) => s !== suggestion))
                      }}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {qualities.map((item, idx) => renderRemovableInput(item, idx, setQualities, (i) => removeLine(setQualities, i), "Ex: Organisé(e), créatif(ve)"))}
            <button type="button" onClick={() => addLine(setQualities)} className="n17-add-btn">
              <i className="ph ph-plus" aria-hidden="true" /> Ajouter une ligne
            </button>
          </div>

          <div className="n17-card">
            <h2>Compétences particulières</h2>
            {skills.map((item, idx) => renderRemovableInput(item, idx, setSkills, (i) => removeLine(setSkills, i), "Ex: Suite Adobe, Figma, Excel"))}
            <button type="button" onClick={() => addLine(setSkills)} className="n17-add-btn">
              <i className="ph ph-plus" aria-hidden="true" /> Ajouter une ligne
            </button>
          </div>

          <div className="n17-card">
            <h2>Langues maîtrisées</h2>
            {languages.map((item, idx) => renderRemovableInput(item, idx, setLanguages, (i) => removeLine(setLanguages, i), "Ex: Français C2, Anglais B2"))}
            <button type="button" onClick={() => addLine(setLanguages)} className="n17-add-btn">
              <i className="ph ph-plus" aria-hidden="true" /> Ajouter une ligne
            </button>
          </div>

          <div className="n17-card">
            <h2>Personnalisation</h2>
            <div className="n17-customize-row">
              <div>
                <label className="n17-label">Couleur principale</label>
                <input
                  type="color"
                  className="n17-color-input"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                />
              </div>
              <div className="n17-customize-photo">
                <label className="n17-label">Photo de profil</label>
                <button type="button" onClick={() => fileInputRef.current?.click()} className="n17-add-btn">
                  Modifier la photo
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onPhotoChange} />
              </div>
            </div>

            <button
              type="button"
              onClick={handleGenerateClick}
              className="n17-generate-btn"
              disabled={generating || savingInfo}
            >
              {generating ? 'Génération…' : savingInfo ? 'Enregistrement…' : 'Générer mon CV'}
            </button>
            {generateError && <div className="n17-error">{generateError}</div>}
          </div>
        </>
      )}

      {cvData && (
        <div className="n17-card">
          <div className="n17-cv-actions">
            <button type="button" onClick={exportPdf} className="n17-generate-btn n17-generate-btn-compact" disabled={exporting}>
              {exporting ? 'Création du PDF…' : 'Télécharger en PDF'}
            </button>
            <button type="button" onClick={finishLevel} className="n17-add-btn" disabled={finishing}>
              {finishing ? 'Validation…' : 'Terminer'}
            </button>
            {uploadingPdf && <span className="n17-hint">Upload en cours…</span>}
            {pdfUrl && <a href={pdfUrl} target="_blank" rel="noreferrer" className="n17-hint-link">Voir le PDF en ligne</a>}
          </div>

          <div ref={cvWrapperRef} className="w-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm" style={{ height: 1123 * cvScale }}>
            <div
              ref={cvRef}
              className="bg-white text-gray-900"
              style={{ width: 794, height: 1123, fontFamily: '"Bricolage Grotesque", "Inter", "Segoe UI", Arial, sans-serif', transform: `scale(${cvScale})`, transformOrigin: 'top left' }}
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
  )
}

const styles = `
.n17-page {
  width: 100%;
  max-width: 860px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding-bottom: 24px;
  font-family: "Bricolage Grotesque", -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
  color: #000;
}
.n17-card {
  position: relative;
  background: #fff;
  border: 1px solid rgba(0,0,0,.06);
  border-radius: 28px;
  box-shadow: 0 26px 60px -30px rgba(0,0,0,.22), 0 2px 10px rgba(0,0,0,.04);
  padding: clamp(20px, 4vw, 32px);
}
.n17-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 30px;
  right: 30px;
  height: 6px;
  border-radius: 0 0 8px 8px;
  background: #c1ff72;
}
.n17-header h1 { margin: 0; font-size: 24px; font-weight: 800; line-height: 1.1; }
.n17-header p { margin: 4px 0 0; color: #6b7280; font-size: 14px; }
.n17-card h2 { margin: 0 0 14px; font-size: 17px; font-weight: 800; }

.n17-state { text-align: center; display: flex; flex-direction: column; align-items: center; gap: 10px; }
.n17-state i { font-size: 30px; color: #6b7280; }
.n17-state p { margin: 0; color: #6b7280; font-size: 14px; }
.n17-spinner { width: 26px; height: 26px; border: 3px solid rgba(0,0,0,.12); border-top-color: #000; border-radius: 999px; animation: n17Spin .8s linear infinite; }
@keyframes n17Spin { to { transform: rotate(360deg); } }

.n17-error { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; padding: 12px 16px; border-radius: 14px; font-size: 13px; margin-top: 10px; }

.n17-field-row { display: grid; grid-template-columns: 1fr 1fr auto; gap: 8px; align-items: center; margin-bottom: 10px; }
.n17-experience-row .n17-field-row { grid-template-columns: 1fr 1fr auto; }
.n17-input {
  width: 100%;
  min-height: 46px;
  padding: 0 16px;
  border-radius: 14px;
  border: 1.5px solid rgba(0,0,0,.12);
  background: #fff;
  font-size: 14px;
  color: #111827;
  outline: none;
  font-family: inherit;
}
.n17-input:focus { border-color: #000; }
.n17-remove-btn {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: 1px solid rgba(0,0,0,.12);
  background: #fff;
  color: #6b7280;
  display: inline-grid;
  place-items: center;
  cursor: pointer;
  flex-shrink: 0;
}
.n17-remove-btn:hover { border-color: #000; color: #000; }
.n17-add-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 42px;
  padding: 0 18px;
  border-radius: 999px;
  border: 1.5px solid rgba(0,0,0,.16);
  background: #fff;
  color: #111827;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  margin-top: 4px;
}
.n17-add-btn:hover:not(:disabled) { border-color: #000; }
.n17-add-btn:disabled { opacity: .6; cursor: default; }

.n17-suggestions { margin-bottom: 14px; }
.n17-suggestions p { margin: 0 0 8px; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .03em; color: #9ca3af; }
.n17-suggestion-list { display: flex; flex-wrap: wrap; gap: 8px; }
.n17-suggestion-chip {
  border-radius: 999px;
  border: 1px solid rgba(0,0,0,.14);
  background: #f2fbe4;
  padding: 7px 14px;
  font-size: 13px;
  font-weight: 700;
  color: #111827;
  cursor: pointer;
}
.n17-suggestion-chip:hover { border-color: #000; }

.n17-customize-row { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 20px; margin-bottom: 18px; }
.n17-label { display: block; font-size: 13px; color: #6b7280; margin-bottom: 6px; }
.n17-color-input { display: block; width: 64px; height: 42px; border-radius: 12px; border: 1.5px solid rgba(0,0,0,.12); padding: 2px; cursor: pointer; }
.n17-customize-photo { flex: 1; min-width: 180px; }

.n17-generate-btn {
  width: 100%;
  min-height: 52px;
  border-radius: 999px;
  border: 0;
  background: #111827;
  color: #c1ff72;
  font-size: 15px;
  font-weight: 800;
  cursor: pointer;
}
.n17-generate-btn:hover:not(:disabled) { transform: translateY(-1px); }
.n17-generate-btn:disabled { opacity: .6; cursor: default; }
.n17-generate-btn-compact { width: auto; padding: 0 22px; }

.n17-cv-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 18px; }
.n17-hint { font-size: 13px; color: #6b7280; }
.n17-hint-link { font-size: 13px; color: #111827; text-decoration: underline; text-underline-offset: 2px; }

@media (max-width: 640px) {
  .n17-card { padding: 18px; border-radius: 22px; }
  .n17-experience-row .n17-field-row { grid-template-columns: 1fr auto; }
  .n17-experience-row .n17-field-row .n17-input:first-child { grid-column: 1 / -1; }
}
`
