import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { analysisAPI, usersAPI } from '../lib/api'
import { resolveAvatarUrl } from '../lib/avatar'
import { fetchProgression, getDefaultProgression } from '../lib/progression'
import { generateZeliaShareImage } from '../lib/shareImage'

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

const MIN_LEVEL_FOR_AVATAR = 4

const editableFields = [
  { key: 'firstName', label: 'Prénom', type: 'text', placeholder: 'Votre prénom' },
  { key: 'lastName', label: 'Nom', type: 'text', placeholder: 'Votre nom' },
  { key: 'age', label: 'Âge', type: 'number', placeholder: 'ex: 18' },
  { key: 'gender', label: 'Genre', type: 'text', placeholder: 'ex: Femme / Homme / Autre' },
  { key: 'department', label: 'Département', type: 'text', placeholder: 'ex: 75' },
  { key: 'school', label: 'École / Formation', type: 'text', placeholder: 'Votre établissement' },
  { key: 'phoneNumber', label: 'Téléphone', type: 'tel', placeholder: 'ex: 06 12 34 56 78' }
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
  const [progression, setProgression] = useState(getDefaultProgression())
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
        const progressionPromise = fetchProgression().catch(() => getDefaultProgression())

        const [profileRes, userRes, extraRes, results, progressionData] = await Promise.all([
          profilePromise,
          userPromise,
          extraInfoPromise,
          resultsPromise,
          progressionPromise
        ])

        if (!active) return

        const profileData = profileRes?.data?.profile || profileRes?.data || null
        setProfile(profileData)
        setAuthUser(userRes?.data?.user || null)
        setExtraInfos(Array.isArray(extraRes?.data?.entries) ? extraRes.data.entries : [])
  setAnalysis(normalizeZeliaAnalysis(results))
        setProgression(progressionData || getDefaultProgression())
      } catch (err) {
        console.error('Profile load error', err)
        if (!active) return
        setError("Impossible de charger les informations du profil.")
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
  const hasLevelFour = Number(progression?.level || 0) >= MIN_LEVEL_FOR_AVATAR

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
    const match = entries.find((row) => row?.question_id === 'niveau17_cv_pdf_url')
    const url = match?.answer_text || ''
    return typeof url === 'string' ? url.trim() : ''
  }, [extraInfos])

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

      if (!hasLevelFour || !resolvedAnalysis || !avatarUrl) {
        if (!silent) {
          setShareError("Tu dois atteindre le niveau 4 et avoir un avatar pour partager ton analyse.")
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
      hasLevelFour,
      profile?.id,
      refreshLatestAnalysis,
      resolvedAnalysis,
      shareImageUrl,
      shareLoading
    ]
  )

  const shareReady = hasLevelFour && !!resolvedAnalysis

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
  link.href = url
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
      setSuccessMessage('Profil mis à jour avec succès.')
      setEditing(false)
    } catch (updateErr) {
      console.error('Profile update error', updateErr)
      const message = updateErr?.response?.data?.error || "Impossible de mettre à jour le profil."
      setUpdateError(message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Mon Profil</h1>
          <p className="text-text-secondary">Informations personnelles et visuel à partager</p>
        </div>
        <div className="bg-surface border border-line rounded-xl shadow-card p-8 text-center">
          <div className="inline-block w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
          <p className="mt-2 text-text-secondary">Chargement…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Mon Profil</h1>
          <p className="text-text-secondary">Informations personnelles et visuel à partager</p>
        </div>
        <div className="bg-surface border border-line rounded-xl shadow-card p-8 text-center">
          <div className="text-red-600 text-4xl">!</div>
          <p className="mt-2 text-text-secondary">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Mon Profil</h1>
  <p className="text-text-secondary">Informations personnelles et visuel à partager</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-card flex flex-col items-center text-center">
          {hasLevelFour ? (
            avatarUrl ? (
              <img
                src={avatarUrl}
                alt="Avatar utilisateur"
                className="w-40 h-40 rounded-2xl border border-gray-100 shadow-sm object-contain bg-white"
              />
            ) : (
              <div className="w-40 h-40 rounded-2xl border border-dashed border-gray-300 flex items-center justify-center text-sm text-gray-500">
                Avatar indisponible
              </div>
            )
          ) : (
            <div className="w-40 h-40 rounded-2xl border border-dashed border-gray-300 flex items-center justify-center px-4 text-sm text-gray-500">
              Une image apparaitra au niveau 4
            </div>
          )}

          <div className="mt-5 space-y-2 text-sm text-gray-700 w-full">
            <div className="flex items-center justify-between">
              <span className="text-text-secondary">Niveau actuel</span>
              <span className="font-semibold">{progression?.level || 1}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-text-secondary">Expérience</span>
              <span className="font-semibold">{progression?.xp || 0} XP</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-text-secondary">Profil</span>
              <span className="font-semibold">{profileTypeLabel}</span>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-card">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
              <div>
                <h2 className="text-xl font-semibold">Informations personnelles</h2>
                <p className="text-text-secondary text-sm">Mettez à jour vos coordonnées et préférences</p>
              </div>
              {!editing && (
                <button
                  type="button"
                  onClick={() => {
                    setEditing(true)
                    setSuccessMessage('')
                    setUpdateError('')
                  }}
                  className="px-4 py-2 rounded-lg bg-black text-white border border-black hover:opacity-90 transition"
                >
                  Modifier
                </button>
              )}
            </div>

            {successMessage && (
              <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                {successMessage}
              </div>
            )}
            {updateError && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {updateError}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {editableFields.map(field => (
                  <div key={field.key}>
                    <label className="block text-sm text-text-secondary mb-1">{field.label}</label>
                    {editing ? (
                      <input
                        type={field.type}
                        value={formData[field.key] || ''}
                        onChange={handleInputChange(field.key)}
                        placeholder={field.placeholder}
                        className="w-full h-11 px-3 rounded-lg border border-line focus:border-black focus:outline-none"
                      />
                    ) : (
                      <p className="text-text-primary font-medium min-h-[2.75rem] flex items-center">
                        {formData[field.key] ? formData[field.key] : 'Non spécifié'}
                      </p>
                    )}
                  </div>
                ))}

                <div>
                  <label className="block text-sm text-text-secondary mb-1">Adresse email</label>
                  <p className="text-text-primary font-medium min-h-[2.75rem] flex items-center">
                    {email || 'Non spécifié'}
                  </p>
                </div>
                <div>
                  <label className="block text-sm text-text-secondary mb-1">Identifiant utilisateur</label>
                  <p className="text-text-primary font-medium break-all min-h-[2.75rem] flex items-center">
                    {authUserId || profile?.id || 'Non disponible'}
                  </p>
                </div>
              </div>

              {editing && (
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="px-4 py-2 rounded-lg border border-line bg-white text-gray-700 hover:bg-gray-50"
                    disabled={saving}
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-black text-white border border-black hover:opacity-90 transition disabled:opacity-60"
                    disabled={saving}
                  >
                    {saving ? 'Enregistrement…' : 'Enregistrer'}
                  </button>
                </div>
              )}
            </form>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold">Mon CV (Niveau 17)</h2>
                <p className="text-text-secondary text-sm">Retrouvez ici votre CV généré et enregistré.</p>
              </div>
            </div>

            {cvPdfUrl ? (
              <div className="flex flex-wrap items-center gap-3">
                <a
                  href={cvPdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2 rounded-lg bg-black text-white border border-black hover:opacity-90 transition"
                >
                  Ouvrir le PDF
                </a>
                <a
                  href={cvPdfUrl}
                  download
                  className="px-4 py-2 rounded-lg border border-line bg-white text-gray-700 hover:bg-gray-50"
                >
                  Télécharger
                </a>
                <p className="text-xs text-text-secondary break-all">{cvPdfUrl}</p>
              </div>
            ) : (
              <div className="bg-surface border border-line rounded-xl shadow-card p-6 text-sm text-text-secondary">
                Aucun CV enregistré pour le moment. Termine le Niveau 17 pour le générer.
              </div>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold">Mon image Niveau 4</h2>
                <p className="text-text-secondary text-sm">Téléchargez ou partagez votre visuel de personnalité débloqué au niveau 4.</p>
              </div>
              {(resolvedAnalysis?.updatedAt || analysis?.updatedAt) && (
                <span className="text-xs text-text-secondary">
                  Mis à jour le {new Date((resolvedAnalysis?.updatedAt || analysis?.updatedAt)).toLocaleDateString('fr-FR')}
                </span>
              )}
            </div>

            {!shareReady ? (
              <div className="bg-surface border border-line rounded-xl shadow-card p-8 text-center">
                <div className="text-text-secondary text-4xl mb-2">✨</div>
                <h3 className="text-lg font-semibold mb-2">Terminez le niveau 4</h3>
                <p className="text-text-secondary">
                  Débloquez le niveau 4 pour générer votre visuel Zélia prêt à partager sur vos réseaux.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                {shareError && (
                  <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
                    {shareError}
                  </div>
                )}

                <div className="relative border border-line rounded-2xl bg-surface/70 p-4 flex items-center justify-center min-h-[320px]">
                  {shareLoading ? (
                    <div className="flex flex-col items-center gap-3 py-10">
                      <div className="inline-block w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
                      <span className="text-sm text-text-secondary">Génération de votre visuel…</span>
                    </div>
                  ) : shareImageUrl ? (
                    <img
                      src={shareImageUrl}
                      alt="Aperçu du visuel Zélia"
                      className="w-full max-w-[260px] sm:max-w-[320px] md:max-w-[360px] rounded-xl border border-gray-200 shadow-md"
                    />
                  ) : (
                    <div className="text-center text-sm text-text-secondary">
                      Cliquez sur « Régénérer » pour créer votre visuel Zélia.
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleRegenerateShareImage}
                    className="px-4 py-2 rounded-lg border border-line bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                    disabled={shareLoading}
                  >
                    {shareLoading ? 'Patientez…' : 'Régénérer'}
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadShareImage}
                    className="px-4 py-2 rounded-lg bg-black text-white border border-black hover:opacity-90 transition disabled:opacity-60"
                    disabled={!shareImageUrl || shareLoading}
                  >
                    Télécharger
                  </button>
                  <button
                    type="button"
                    onClick={handleShareStory}
                    className="px-4 py-2 rounded-lg bg-[#f68fff] text-black border border-gray-200 hover:opacity-95 transition disabled:opacity-60"
                    disabled={!shareImageUrl || shareLoading || sharing}
                  >
                    {sharing ? 'Partage…' : 'Partager'}
                  </button>
                </div>

                <p className="text-xs text-text-secondary">
                  Astuce : publiez votre story et taguez <span className="font-semibold">@zelia</span> pour que nous puissions la repartager.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
