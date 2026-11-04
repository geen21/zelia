import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { analysisAPI, usersAPI } from '../lib/api'
import { resolveAvatarUrl } from '../lib/avatar'
import { generateZeliaShareImage } from '../lib/shareImage'
import ZeliaDiploma from '../components/ZeliaDiploma'
import SchoolSharingSettings from '../components/SchoolSharingSettings'
import { withZeliaUtm } from '../lib/outboundUrl.js'
import { trackSiteEvent } from '../lib/analytics.js'
import './Profile.css'

const stripLegacyMbtiTokens = (text) => {
  if (!text || typeof text !== 'string') return text || ''
  return text
    .replace(/\(([IE][NS][FT][JP])\)/gi, '')
    .replace(/\b[IE][NS][FT][JP]\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

const normalizeZeliaAnalysis = (analysis) => {
  if (!analysis || typeof analysis !== 'object') return analysis || null
  const normalized = { ...analysis }
  if (typeof normalized.personalityType === 'string') {
    normalized.personalityType = stripLegacyMbtiTokens(normalized.personalityType)
  }
  return normalized
}

const editableFields = [
  { key: 'firstName', label: 'Prénom', type: 'text', placeholder: 'Ton prénom', autoComplete: 'given-name' },
  { key: 'lastName', label: 'Nom', type: 'text', placeholder: 'Ton nom', autoComplete: 'family-name' },
  { key: 'age', label: 'Âge', type: 'number', placeholder: 'ex: 18' },
  { key: 'gender', label: 'Genre', type: 'text', placeholder: 'ex: Femme / Homme / Autre' },
  { key: 'department', label: 'Département', type: 'text', placeholder: 'ex: 75' },
  { key: 'school', label: 'École / Formation', type: 'text', placeholder: 'Ton établissement', autoComplete: 'organization' },
  { key: 'phoneNumber', label: 'Téléphone', type: 'tel', placeholder: 'ex: 06 12 34 56 78', autoComplete: 'tel' }
]

function mapProfileToForm(profile) {
  return {
    firstName: profile?.first_name || profile?.prenom || '',
    lastName: profile?.last_name || profile?.nom || '',
    age: profile?.age != null ? String(profile.age) : '',
    gender: profile?.gender || profile?.genre || '',
    department: profile?.department || profile?.departement || '',
    school: profile?.school || profile?.ecole || '',
    phoneNumber: profile?.phone_number || profile?.numero_telephone || profile?.numeroTelephone || ''
  }
}

function formatTextContent(value) {
  if (!value) return ''
  if (Array.isArray(value)) {
    return value
      .map(item => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean)
      .join('\n')
  }
  if (typeof value === 'string') return value.trim()
  return ''
}

function normalizeJobRecommendations(list) {
  if (!Array.isArray(list)) return []
  return list
    .map((item, index) => {
      if (!item) return null
      if (typeof item === 'string') {
        return { id: index, title: item.trim(), skills: [] }
      }
      if (typeof item === 'object') {
        const title = (item.title || item.role || item.name || '').trim()
        const rawSkills = item.skills || item.requiredSkills || item.competences || item.tags
        let skills = []
        if (Array.isArray(rawSkills)) {
          skills = rawSkills.map(s => (typeof s === 'string' ? s.trim() : '')).filter(Boolean)
        } else if (typeof rawSkills === 'string') {
          skills = rawSkills
            .split(/[,;•\n-]/)
            .map(s => s.trim())
            .filter(Boolean)
        }
        return title ? { id: index, title, skills } : null
      }
      return null
    })
    .filter(Boolean)
}

export default function Profile() {
  const [profile, setProfile] = useState(null)
  const [authUser, setAuthUser] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [extraInfos, setExtraInfos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [updateError, setUpdateError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [formData, setFormData] = useState(mapProfileToForm(null))
  const [shareImageUrl, setShareImageUrl] = useState('')
  const [shareLoading, setShareLoading] = useState(false)
  const [shareError, setShareError] = useState('')
  const [sharing, setSharing] = useState(false)

  const isMountedRef = useRef(true)
  const firstInputRef = useRef(null)

  useEffect(() => {
    if (editing) firstInputRef.current?.focus()
  }, [editing])

  useEffect(() => {
    let active = true
    setLoading(true)
    ;(async () => {
      try {
        const profilePromise = usersAPI.getProfile()
        const userPromise = usersAPI.getCurrentUser().catch(() => null)
        const extraInfoPromise = usersAPI.getExtraInfo().catch(() => null)
        const resultsPromise = analysisAPI
          .getMyResults()
          .then(res => res?.data?.results || null)
          .catch(err => {
            if (err?.response?.status === 404) return null
            throw err
          })
        const [profileRes, userRes, extraRes, results] = await Promise.all([
          profilePromise,
          userPromise,
          extraInfoPromise,
          resultsPromise
        ])

        if (!active) return

        const profileData = profileRes?.data?.profile || profileRes?.data || null
        setProfile(profileData)
        setAuthUser(userRes?.data?.user || null)
        setExtraInfos(Array.isArray(extraRes?.data?.entries) ? extraRes.data.entries : [])
  setAnalysis(normalizeZeliaAnalysis(results))
      } catch (err) {
        console.error('Profile load error', err)
        if (!active) return
        if (err?.response?.status === 429) {
          const retryAfter = Number(err.response.headers?.['retry-after'])
          const delay = Number.isFinite(retryAfter) && retryAfter > 0
            ? ` dans ${Math.ceil(retryAfter / 60)} min`
            : ' dans quelques instants'
          setError(`Trop de requêtes ont été envoyées. Réessaie${delay}. Tes informations sont conservées.`)
        } else {
          setError("Impossible de charger les informations du profil.")
        }
      } finally {
        if (active) setLoading(false)
      }
    })()

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    setFormData(mapProfileToForm(profile))
  }, [profile])

  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const authUserId = authUser?.id

  const avatarUrl = useMemo(() => {
    if (!profile && !analysis) return ''
    const seed = authUserId || profile?.id || 'zelia'
    return resolveAvatarUrl({ profile, analysis, seed })
  }, [analysis, authUserId, profile])

  const profileTypeLabel = useMemo(() => {
    const rawType =
      profile?.profile_type ||
      profile?.institution_data?.profile_type ||
      authUser?.user_metadata?.profile_type ||
      ''
    if (!rawType) return 'Étudiant'
    switch (rawType) {
      case 'student':
        return 'Étudiant'
      case 'company':
        return 'Entreprise'
      default:
        return rawType
    }
  }, [authUser, profile])

  const resolvedAnalysis = useMemo(() => {
    if (!analysis) return null
    const fallback = analysis.inscriptionResults || null

    const personalityType =
      analysis.personalityType ||
      fallback?.personalityType ||
      fallback?.personality_type ||
      ''
    const personalityAnalysis = formatTextContent(
      analysis.personalityAnalysis || fallback?.personalityAnalysis || fallback?.personality_analysis
    )
    const skillsAssessment = formatTextContent(
      analysis.skillsAssessment || fallback?.skillsAssessment || fallback?.skills_assessment
    )
    const jobRecommendations = normalizeJobRecommendations(
      analysis.jobRecommendations || fallback?.jobRecommendations || fallback?.job_recommendations
    )

    return {
      ...analysis,
      personalityType,
      personalityAnalysis,
      skillsAssessment,
      jobRecommendations
    }
  }, [analysis])

  const email = authUser?.email || profile?.email || ''

  const cvPdfUrl = useMemo(() => {
    const entries = Array.isArray(extraInfos) ? extraInfos : []
    const match = entries.find((row) => row?.question_id === 'cv_pdf_url')
    const url = match?.answer_text || ''
    return typeof url === 'string' ? url.trim() : ''
  }, [extraInfos])

  const cvData = useMemo(() => {
    const entries = Array.isArray(extraInfos) ? extraInfos : []
    const match = entries.find((row) => row?.question_id === 'cv_data')
    if (!match?.answer_text) return null
    try {
      return JSON.parse(match.answer_text)
    } catch {
      return null
    }
  }, [extraInfos])

  const diplomaDate = useMemo(() => {
    const entries = Array.isArray(extraInfos) ? extraInfos : []
    const match = entries.find((row) => row?.question_id === 'diploma_date')
    return match?.answer_text || null
  }, [extraInfos])

  const hasDiploma = !!diplomaDate || !!resolvedAnalysis

  const handleDiplomaDownloadComplete = useCallback(() => {}, [])

  const refreshLatestAnalysis = useCallback(async () => {
    try {
      const resp = await analysisAPI.getMyResults()
      const latestRaw = resp?.data?.results || null
      const latest = normalizeZeliaAnalysis(latestRaw)
      if (!latest) return null

      setAnalysis(prev => {
        if (!prev) return latest
        return normalizeZeliaAnalysis({ ...prev, ...latest })
      })

      return latest
    } catch (refreshErr) {
      console.warn('Failed to refresh analysis snapshot', refreshErr)
      return null
    }
  }, [])

  const ensureShareImage = useCallback(
    async ({ silent = false, force = false } = {}) => {
      if (!isMountedRef.current) return ''

      if (!resolvedAnalysis || !avatarUrl) {
        if (!silent) {
          setShareError("Ton analyse et ton avatar doivent être prêts pour partager ton visuel.")
        }
        setShareImageUrl('')
        return ''
      }

      if (shareLoading && !force) {
        return shareImageUrl || resolvedAnalysis.shareImageUrl || ''
      }

      if (!force && resolvedAnalysis.shareImageUrl) {
        if (shareImageUrl !== resolvedAnalysis.shareImageUrl) {
          setShareImageUrl(resolvedAnalysis.shareImageUrl)
        }
        setShareError('')
        return resolvedAnalysis.shareImageUrl
      }

      setShareLoading(true)
      if (!silent) {
        setShareError('')
      }

      try {
        const latest = await refreshLatestAnalysis()
        const snapshot = latest
          ? normalizeZeliaAnalysis({ ...resolvedAnalysis, ...latest })
          : normalizeZeliaAnalysis(resolvedAnalysis)

        if (!force && snapshot?.shareImageUrl) {
          if (isMountedRef.current) {
            setShareImageUrl(snapshot.shareImageUrl)
            setAnalysis(prev => (prev ? normalizeZeliaAnalysis({ ...prev, shareImageUrl: snapshot.shareImageUrl }) : prev))
          }
          return snapshot.shareImageUrl
        }

  const dataUrl = await generateZeliaShareImage({ analysis: snapshot, avatarUrl })
        if (!dataUrl) {
          throw new Error('Empty dataUrl from share image generator')
        }

        if (isMountedRef.current) {
          setShareImageUrl(dataUrl)
        }

        let remoteUrl = ''
        try {
          const response = await analysisAPI.saveShareImage({
            dataUrl,
            questionnaireType: 'mbti',
            metadata: {
              source: 'profile',
              userId: authUserId || profile?.id || snapshot?.userId || snapshot?.user_id || null
            }
          })
          remoteUrl = response?.data?.url || ''
        } catch (uploadErr) {
          console.warn('Failed to upload share image to Cloudinary, keeping local copy', uploadErr)
        }

        if (remoteUrl) {
          if (isMountedRef.current) {
            setAnalysis(prev => (prev ? normalizeZeliaAnalysis({ ...prev, shareImageUrl: remoteUrl }) : prev))
            setShareImageUrl(remoteUrl)
          }
          return remoteUrl
        }

        return dataUrl
      } catch (generationErr) {
        console.error('Profile share image generation failed', generationErr)
        if (!silent) {
          setShareError("Impossible de générer l'image à partager.")
        }
        return ''
      } finally {
        if (isMountedRef.current) {
          setShareLoading(false)
        }
      }
    },
    [
      authUserId,
      avatarUrl,
      profile?.id,
      refreshLatestAnalysis,
      resolvedAnalysis,
      shareImageUrl,
      shareLoading
    ]
  )

  const shareReady = !!resolvedAnalysis && !!avatarUrl

  useEffect(() => {
    if (!shareReady) {
      setShareImageUrl('')
      setShareError('')
      setShareLoading(false)
      return
    }

    if (resolvedAnalysis?.shareImageUrl) {
      if (shareImageUrl !== resolvedAnalysis.shareImageUrl) {
        setShareImageUrl(resolvedAnalysis.shareImageUrl)
      }
      setShareError('')
      return
    }

    if (shareImageUrl) {
      return
    }

    let cancelled = false
    ;(async () => {
      const url = await ensureShareImage({ silent: true })
      if (!cancelled && url) {
        setShareImageUrl(url)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [ensureShareImage, resolvedAnalysis?.shareImageUrl, shareReady, shareImageUrl])

  const handleDownloadShareImage = useCallback(async () => {
    const url = shareImageUrl || (await ensureShareImage())
    if (!url) return
    try {
  const link = document.createElement('a')
  link.href = withZeliaUtm(url)
  link.download = 'zelia-story.png'
      link.rel = 'noopener'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (downloadErr) {
      console.error('Share image download failed', downloadErr)
    }
  }, [ensureShareImage, shareImageUrl])

  const handleShareStory = useCallback(async () => {
    const url = shareImageUrl || (await ensureShareImage())
    if (!url) return
    setSharing(true)
    setShareError('')
    try {
      const response = await fetch(url)
      const blob = await response.blob()
  const file = new File([blob], 'zelia-story.png', { type: 'image/png' })

      if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: resolvedAnalysis?.personalityType || 'Profil Zélia',
          text: `Mon profil personnalité Zélia — ${resolvedAnalysis?.personalityType || ''}`.trim(),
          files: [file]
        })
      } else {
        await handleDownloadShareImage()
        if (isMountedRef.current) {
          setShareError("Le partage natif n'est pas disponible sur cet appareil. L'image a été téléchargée.")
        }
      }
    } catch (shareErr) {
      console.warn('Native share failed, falling back to download', shareErr)
      await handleDownloadShareImage()
      if (isMountedRef.current) {
        setShareError("Une erreur est survenue lors du partage. L'image a été téléchargée pour un partage manuel.")
      }
    } finally {
      if (isMountedRef.current) {
        setSharing(false)
      }
    }
  }, [ensureShareImage, handleDownloadShareImage, resolvedAnalysis, shareImageUrl])

  const handleRegenerateShareImage = useCallback(async () => {
    await ensureShareImage({ force: true })
  }, [ensureShareImage])

  const handleInputChange = (field) => (event) => {
    const value = event.target.value
    setFormData(prev => ({ ...prev, [field]: value }))
    if (successMessage) setSuccessMessage('')
    if (updateError) setUpdateError('')
  }

  const handleCancel = () => {
    setFormData(mapProfileToForm(profile))
    setEditing(false)
    setUpdateError('')
    setSuccessMessage('')
  }

  const handleSave = async (event) => {
    event.preventDefault()
    setSaving(true)
    setUpdateError('')
    setSuccessMessage('')
    try {
      const payload = {
        first_name: formData.firstName.trim() || null,
        last_name: formData.lastName.trim() || null,
        age: formData.age ? Number(formData.age) : null,
        gender: formData.gender || null,
        department: formData.department || null,
        school: formData.school || null,
        phone_number: formData.phoneNumber || null
      }
      const { data } = await usersAPI.updateProfile(payload)
      const updatedProfile = data?.profile || data || {}
      setProfile(prev => ({ ...(prev || {}), ...updatedProfile }))
      trackSiteEvent('profile_updated')
      setSuccessMessage('Profil mis à jour avec succès.')
      setEditing(false)
    } catch (updateErr) {
      trackSiteEvent('profile_update_failed', { error_stage: 'save' })
      console.error('Profile update error', updateErr)
      const message = updateErr?.response?.data?.error || "Impossible de mettre à jour le profil."
      setUpdateError(message)
    } finally {
      setSaving(false)
    }
  }

  if (loading || error) {
    return (
      <div className="zelia-profile">
        <header className="zp-intro">
          <p className="zp-eyebrow">Mon espace Zélia</p>
          <h1>Mon profil,<span> tout moi.</span></h1>
          <p>Tes infos, tes documents et tes choix. Tout au même endroit.</p>
        </header>
        <div className="zp-card zp-state" role={error ? 'alert' : 'status'} aria-busy={loading}>
          <i className={`ph ${error ? 'ph-warning-circle' : 'ph-spinner-gap zp-spin'}`} aria-hidden="true" />
          <h2>{error ? 'Petit contretemps…' : 'On prépare ton espace…'}</h2>
          <p>{error || 'Encore un instant, ton profil arrive.'}</p>
          {error && <button type="button" className="zp-button zp-button--ink" onClick={() => window.location.reload()}>Réessayer</button>}
        </div>
      </div>
    )
  }

  const savedDetails = mapProfileToForm(profile)
  const displayName = [savedDetails.firstName, savedDetails.lastName].filter(Boolean).join(' ') || 'Ton profil Zélia'

  return (
    <div className="zelia-profile">
      <header className="zp-intro">
        <div>
          <p className="zp-eyebrow">Mon espace Zélia</p>
          <h1>Mon profil,<span> tout moi.</span></h1>
          <p>Tes infos, tes documents et tes choix. Tout au même endroit.</p>
        </div>
        <span className="zp-intro-sticker" aria-hidden="true"><i className="ph ph-sparkle" />100 % toi</span>
      </header>

      <div className="zp-layout">
        <aside className="zp-sidebar" aria-label="Ton espace personnel">
          <section className="zp-identity" aria-labelledby="profile-name">
            <div className="zp-identity-art">
              <span className="zp-identity-sticker" aria-hidden="true">Unique, comme toi.</span>
              <i className="ph ph-asterisk zp-identity-star" aria-hidden="true" />
              {avatarUrl ? <img src={avatarUrl} alt="Ton avatar Zélia" className="zp-avatar" /> : <div className="zp-avatar zp-avatar-empty">Avatar à venir</div>}
            </div>
            <div className="zp-identity-body">
              <span className="zp-pill">{profileTypeLabel}</span>
              <h2 id="profile-name">{displayName}</h2>
              {email && <p className="zp-identity-email">{email}</p>}
              <div className="zp-personality">
                <span>Mon profil Zélia</span>
                <strong>{resolvedAnalysis?.personalityType || 'Encore plein de choses à découvrir'}</strong>
                <Link to={resolvedAnalysis ? '/app/results' : '/app/outils/personnalite'} className="zp-text-link">
                  {resolvedAnalysis ? 'Voir mon bilan' : 'Me découvrir'}<i className="ph ph-arrow-up-right" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </section>
          <nav className="zp-shortcuts" aria-label="Rubriques du profil">
            <p>Dans mon espace</p>
            <a href="#profile-infos"><i className="ph ph-user-circle" aria-hidden="true" />Mes informations<i className="ph ph-arrow-down-right" aria-hidden="true" /></a>
            <a href="#profile-documents"><i className="ph ph-folder-simple" aria-hidden="true" />Mes documents<i className="ph ph-arrow-down-right" aria-hidden="true" /></a>
            <a href="#profile-visuel"><i className="ph ph-sparkle" aria-hidden="true" />Mon visuel Zélia<i className="ph ph-arrow-down-right" aria-hidden="true" /></a>
            <a href="#profile-sharing"><i className="ph ph-shield-check" aria-hidden="true" />Mes autorisations<i className="ph ph-arrow-down-right" aria-hidden="true" /></a>
          </nav>
          <div className="zp-sidebar-note">
            <i className="ph ph-heart" aria-hidden="true" />
            <p>Ton avenir se construit à ton rythme. Ton profil aussi.</p>
          </div>
        </aside>

        <div className="zp-content">
          <section id="profile-infos" className="zp-card" aria-labelledby="profile-infos-title">
            <div className="zp-section-head">
              <div>
                <p className="zp-eyebrow">01 / L'essentiel</p>
                <h2 id="profile-infos-title">Mes informations</h2>
                <p>Pour mieux te connaître et garder le contact.</p>
              </div>
              {!editing && (
                <button
                  type="button"
                  onClick={() => {
                    setEditing(true)
                    setSuccessMessage('')
                    setUpdateError('')
                  }}
                  className="zp-button zp-button--ink"
                >
                  <i className="ph ph-pencil-simple" aria-hidden="true" />Modifier
                </button>
              )}
            </div>

            {successMessage && <div className="zp-notice zp-notice--success" role="status">{successMessage}</div>}
            {updateError && <div className="zp-notice zp-notice--error" role="alert">{updateError}</div>}

            <form onSubmit={handleSave} aria-label="Informations personnelles" aria-busy={saving}>
              <div className={`zp-fields${editing ? ' is-editing' : ''}`}>
                {editableFields.map(field => (
                  <div key={field.key} className="zp-field">
                    {editing ? (
                      <>
                        <label htmlFor={`profile-${field.key}`}>{field.label}</label>
                        <input
                          id={`profile-${field.key}`}
                          ref={field.key === 'firstName' ? firstInputRef : undefined}
                          type={field.type}
                          autoComplete={field.autoComplete}
                          value={formData[field.key] || ''}
                          onChange={handleInputChange(field.key)}
                          placeholder={field.placeholder}
                          disabled={saving}
                        />
                      </>
                    ) : (
                      <p>
                        <span className="zp-field-label">{field.label}</span>
                        <span className={`zp-field-value${formData[field.key] ? '' : ' is-empty'}`}>{formData[field.key] || 'À compléter'}</span>
                      </p>
                    )}
                  </div>
                ))}
                <div className="zp-field">
                  <p>
                    <span className="zp-field-label">Adresse email <i className="ph ph-lock-simple" aria-hidden="true" /></span>
                    <span className="zp-field-value">{email || 'Non renseignée'}</span>
                  </p>
                  {editing && <small>L'email est lié à ton compte et ne se modifie pas ici.</small>}
                </div>
              </div>

              {editing && (
                <div className="zp-form-actions">
                  <button type="button" onClick={handleCancel} className="zp-button" disabled={saving}>Annuler</button>
                  <button type="submit" className="zp-button zp-button--lime" disabled={saving}>
                    <i className={`ph ${saving ? 'ph-spinner-gap zp-spin' : 'ph-check'}`} aria-hidden="true" />{saving ? 'Enregistrement…' : 'Enregistrer'}
                  </button>
                </div>
              )}
            </form>
            <details className="zp-account-details">
              <summary>Informations du compte</summary>
              <p>Identifiant utilisateur : <span>{authUserId || profile?.id || 'Non disponible'}</span></p>
            </details>
          </section>

          <section id="profile-documents" aria-labelledby="profile-documents-title">
            <div className="zp-section-head zp-section-head--outside">
              <div><p className="zp-eyebrow">02 / Prêt pour la suite</p><h2 id="profile-documents-title">Mes documents</h2></div>
              <i className="ph ph-folder-simple zp-section-symbol" aria-hidden="true" />
            </div>
            <div className="zp-documents">
              <article className="zp-card zp-document">
                <div className="zp-document-top"><span className="zp-icon zp-icon--pink"><i className="ph ph-identification-card" aria-hidden="true" /></span><span className="zp-pill">{cvPdfUrl ? 'PDF disponible' : cvData ? 'Enregistré' : 'À créer'}</span></div>
                <h3>Mon CV</h3>
                <p>{cvPdfUrl ? 'Ton parcours, prêt à faire bonne impression.' : cvData ? 'Ton CV est enregistré. Ouvre l’outil pour générer ton PDF.' : 'Tes expériences et tes talents méritent leur place sur le papier.'}</p>
                {cvData && !cvPdfUrl && <div className="zp-cv-summary"><strong>{cvData.name || 'CV'}</strong>{cvData.targetJob && <p>Poste visé : {cvData.targetJob}</p>}{cvData.summary && <p>{cvData.summary}</p>}</div>}
                <div className="zp-document-actions">
                  {cvPdfUrl ? <>
                    <a href={withZeliaUtm(cvPdfUrl)} target="_blank" rel="noreferrer" className="zp-button zp-button--ink">Ouvrir le PDF<i className="ph ph-arrow-up-right" aria-hidden="true" /></a>
                    <a href={cvPdfUrl} download className="zp-text-link"><i className="ph ph-download-simple" aria-hidden="true" />Télécharger le CV</a>
                  </> : <Link to="/app/outils/cv" className="zp-button zp-button--ink">{cvData ? 'Retrouver mon CV' : 'Créer mon CV'}<i className="ph ph-arrow-right" aria-hidden="true" /></Link>}
                </div>
              </article>
              <article className="zp-card zp-document">
                <div className="zp-document-top"><span className="zp-icon zp-icon--lime"><i className="ph ph-graduation-cap" aria-hidden="true" /></span><span className="zp-pill">{hasDiploma ? 'Disponible' : 'À venir'}</span></div>
                <h3>Mon diplôme Zélia</h3>
                <p>{hasDiploma ? 'Un souvenir de ton parcours et de tout ce que tu as découvert sur toi.' : 'Ton diplôme t’attend à la fin de ton bilan. Chaque étape te rapproche de toi.'}</p>
                <div className="zp-document-actions">
                  {hasDiploma ? (
                    <ZeliaDiploma
                      compact
                      firstName={savedDetails.firstName}
                      lastName={savedDetails.lastName}
                      personalityType={resolvedAnalysis?.personalityType || null}
                      completionDate={diplomaDate ? new Date(diplomaDate) : new Date()}
                      avatarUrl={avatarUrl}
                      onDownloadComplete={handleDiplomaDownloadComplete}
                    />
                  ) : <Link to="/app/results" className="zp-button">Voir mon bilan<i className="ph ph-arrow-right" aria-hidden="true" /></Link>}
                </div>
              </article>
            </div>
          </section>

          <section id="profile-visuel" className="zp-card zp-share" aria-labelledby="profile-visuel-title">
            <div className="zp-section-head">
              <div>
                <p className="zp-eyebrow">03 / Ça, c'est moi</p>
                <h2 id="profile-visuel-title">Mon visuel Zélia</h2>
                <p>Une personnalité unique. Un visuel à partager.</p>
              </div>
              <span className="zp-icon zp-icon--pink"><i className="ph ph-sparkle" aria-hidden="true" /></span>
            </div>
            {!shareReady ? (
              <div className="zp-empty">
                <i className="ph ph-magic-wand" aria-hidden="true" />
                <h3>Ton visuel se prépare</h3>
                <p>Il sera disponible dès que ton analyse et ton avatar seront prêts.</p>
                <Link to="/app/outils/personnalite" className="zp-text-link">Découvrir mon profil<i className="ph ph-arrow-right" aria-hidden="true" /></Link>
              </div>
            ) : (
              <div className="zp-share-layout">
                <div className="zp-share-preview" aria-busy={shareLoading}>
                  {shareLoading ? (
                    <div className="zp-state" role="status">
                      <i className="ph ph-spinner-gap zp-spin" aria-hidden="true" />
                      <p>Génération de ton visuel…</p>
                    </div>
                  ) : shareImageUrl ? (
                    <img src={shareImageUrl} alt="Aperçu du visuel Zélia" />
                  ) : <p>Clique sur « Régénérer » pour créer ton visuel.</p>}
                </div>
                <div className="zp-share-copy">
                  <span className="zp-pill zp-pill--pink">À garder ou à partager</span>
                  <h3>Fais rayonner ta personnalité.</h3>
                  <p>Garde ton visuel avec toi ou partage-le à tes proches. C'est toi qui choisis.</p>
                  {shareError && <div className="zp-notice" role="status">{shareError}</div>}
                  <div className="zp-share-actions">
                    <button type="button" onClick={handleDownloadShareImage} className="zp-button zp-button--ink" disabled={!shareImageUrl || shareLoading}><i className="ph ph-download-simple" aria-hidden="true" />Télécharger le visuel</button>
                    <button type="button" onClick={handleShareStory} className="zp-button zp-button--pink" disabled={!shareImageUrl || shareLoading || sharing}><i className="ph ph-share-network" aria-hidden="true" />{sharing ? 'Partage…' : 'Partager mon visuel'}</button>
                    <button type="button" onClick={handleRegenerateShareImage} className="zp-text-link" disabled={shareLoading}><i className="ph ph-arrow-clockwise" aria-hidden="true" />{shareLoading ? 'Patiente…' : 'Régénérer'}</button>
                  </div>
                  <p className="zp-share-tip">Une story ? Pense à taguer <strong>@zelia</strong> pour qu'on puisse la repartager.</p>
                  {(resolvedAnalysis?.updatedAt || analysis?.updatedAt) && <p className="zp-updated">Mis à jour le {new Date(resolvedAnalysis?.updatedAt || analysis?.updatedAt).toLocaleDateString('fr-FR')}</p>}
                </div>
              </div>
            )}
          </section>

          <SchoolSharingSettings />
          <p className="zp-footer-note"><i className="ph ph-fingerprint-simple" aria-hidden="true" />Ton profil évolue avec toi. Reviens quand tu veux.</p>
        </div>
      </div>
    </div>
  )
}
