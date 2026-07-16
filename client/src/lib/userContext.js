function cleanText(value, maxLength = 180) {
  if (value === undefined || value === null) return ''
  const text = String(value).replace(/\s+/g, ' ').trim()
  if (!text) return ''
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}...` : text
}

function parseMaybeJson(value) {
  if (!value || typeof value !== 'string') return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function getProfileValue(profile, keys) {
  for (const key of keys) {
    const value = profile?.[key]
    if (value !== undefined && value !== null && String(value).trim()) return value
  }
  return ''
}

function getExtraValue(extraInfos, ids) {
  const wantedIds = new Set(ids.map((id) => id.toLowerCase()))
  const entry = asArray(extraInfos).find((row) => wantedIds.has(String(row?.question_id || '').toLowerCase()))
  return entry?.answer_text || entry?.response || ''
}

function formatJsonOrText(value) {
  const parsed = parseMaybeJson(value)
  if (Array.isArray(parsed)) return parsed.map((item) => cleanText(item, 80)).filter(Boolean).join(', ')
  if (parsed && typeof parsed === 'object') {
    return Object.values(parsed).map((item) => cleanText(item, 80)).filter(Boolean).join(', ')
  }
  return cleanText(value)
}

function formatFormationPreferences(value) {
  const labels = {
    bts: 'BTS',
    but: 'BUT',
    licence: 'Licence',
    bachelor: 'Bachelor',
    ecole_specialisee: 'École spécialisée',
    alternance: 'Alternance',
    prepa: 'Prépa',
    voie_pro: 'CAP ou bac pro'
  }
  const parsed = parseMaybeJson(value)
  if (!Array.isArray(parsed)) return formatJsonOrText(value)
  return parsed
    .map((item) => labels[String(item || '').trim()] || cleanText(item, 80))
    .filter(Boolean)
    .join(', ')
}

function extractTitles(list) {
  return asArray(list)
    .map((item) => {
      if (typeof item === 'string') return cleanText(item, 80)
      return cleanText(item?.title || item?.label || item?.name || item?.degree || item?.metier || item?.formation, 80)
    })
    .filter(Boolean)
    .slice(0, 5)
}

function extractFinalSelection(extraInfos) {
  const raw = getExtraValue(extraInfos, ['orientation_final_selection'])
  const parsed = parseMaybeJson(raw)
  return extractTitles(parsed)
}

export function normalizeExtraInfoEntries(response) {
  if (Array.isArray(response?.data?.entries)) return response.data.entries
  if (Array.isArray(response?.data)) return response.data
  if (Array.isArray(response)) return response
  return []
}

export function buildUserContextSummary({ profile, results, extraInfos = [] }) {
  const lines = []

  const firstName = cleanText(getProfileValue(profile, ['first_name', 'firstName', 'prenom']))
  const age = cleanText(getProfileValue(profile, ['age']))
  const department = cleanText(
    getProfileValue(profile, ['department', 'departement']) ||
    getExtraValue(extraInfos, ['orientation_department_name', 'orientation_department'])
  )
  const schoolLevel = cleanText(getExtraValue(extraInfos, ['orientation_school_level']))
  const targetLevel = cleanText(getExtraValue(extraInfos, ['orientation_target_level']))
  const studyLocation = cleanText(getExtraValue(extraInfos, ['orientation_study_location']))
  const budget = cleanText(getExtraValue(extraInfos, ['orientation_budget']))
  const strongSubjects = formatJsonOrText(getExtraValue(extraInfos, ['orientation_strong_subjects']))
  const formationPreferences = formatFormationPreferences(getExtraValue(extraInfos, ['orientation_formation_preferences']))
  const personality = cleanText(results?.personalityAnalysis || results?.personality_analysis, 240)
  const strengths = extractTitles(results?.strengths || results?.skillsAssessment || results?.skills_assessment)
  const jobs = extractTitles(results?.jobRecommendations || results?.job_recommendations)
  const studies = extractTitles(results?.studyRecommendations || results?.study_recommendations)
  const finalSelection = extractFinalSelection(extraInfos)

  if (firstName) lines.push(`Prénom: ${firstName}`)
  if (age) lines.push(`Age: ${age}`)
  if (department) lines.push(`Département: ${department}`)
  if (schoolLevel) lines.push(`Classe actuelle: ${schoolLevel}`)
  if (targetLevel) lines.push(`Niveau visé: ${targetLevel}`)
  if (studyLocation) lines.push(`Mobilité: ${studyLocation}`)
  if (budget) lines.push(`Budget études: ${budget}`)
  if (strongSubjects) lines.push(`Matières fortes: ${strongSubjects}`)
  if (formationPreferences) lines.push(`Formats de formation préférés: ${formationPreferences}`)
  if (personality) lines.push(`Analyse Zélia: ${personality}`)
  if (strengths.length) lines.push(`Forces repérées: ${strengths.join(', ')}`)
  if (jobs.length) lines.push(`Métiers suggérés: ${jobs.join(', ')}`)
  if (studies.length) lines.push(`Formations suggérées: ${studies.join(', ')}`)
  if (finalSelection.length) lines.push(`Choix validés: ${finalSelection.join(', ')}`)

  return lines.slice(0, 12).join('\n')
}

export function buildContextualAdvisorMessage(userMessage, contextSummary) {
  if (!contextSummary) return userMessage
  return `Contexte utilisateur connu par Zélia. Utilise-le naturellement sans le répéter mot pour mot.\n${contextSummary}\n\nMessage utilisateur:\n${userMessage}\n\nRéponds comme Zélia: court, rassurant, concret, et personnalisé. Si l'utilisateur ne sait pas quoi faire, propose 2 ou 3 pistes à partir de son profil puis pose une seule question simple.`
}