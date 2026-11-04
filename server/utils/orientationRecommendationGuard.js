export const JOB_TITLE_GUIDELINES = `Utilise uniquement des métiers bien établis et reconnus en France, avec leur intitulé usuel en français, compréhensible par un collégien.
Privilégie des noms courts et simples, sans jargon, anglicisme évitable, acronyme non expliqué ni accumulation de spécialités.
N'invente jamais de métier, de titre valorisant ou de rôle hybride pour coller au profil. Ne combine pas plusieurs métiers dans un même intitulé.
Si une spécialisation est trop complexe ou si tu n'es pas certain qu'un intitulé existe, choisis le métier courant correspondant. Garde les précisions techniques dans les compétences, pas dans le titre.
Avant de répondre, vérifie que chaque intitulé désigne un métier réel et identifiable, et pas une compétence, une mission ou un domaine d'études.`

export const JOB_SELECTION_GUIDELINES = `Choisis librement les métiers les plus pertinents à partir de l'ensemble des réponses et des préférences exprimées.
N'impose ni quota par environnement de travail, ni priorité ou exclusion sectorielle prédéfinie.
Le persona décrit des tendances générales, pas des domaines professionnels imposés. Évite les variantes d'un même métier.`

const FORMATION_PREFERENCE_PATTERNS = {
  bts: /\bbts\b/i,
  but: /\bbut\b/i,
  licence: /\blicence\b/i,
  bachelor: /\bbachelor\b/i,
  master: /\bmaster(?:e|es)?\b|\bmba\b|\bmsc\b/i,
  doctorat: /\bdoctorat\b|\bthese\b|\bphd\b/i,
  'ecole specialisee': /\b(e|é)cole\b/i,
  alternance: /\balternance\b|\bapprentissage\b/i,
  prepa: /\bpr[eé]pa\b|\bclasse pr[eé]paratoire\b/i,
  'cap ou bac pro': /\bcap\b|\bbac\s*pro(?:fessionnel)?\b/i
}

function normalizedText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeJob(job) {
  if (typeof job === 'string') return { title: job.trim(), skills: [] }
  if (!job || typeof job !== 'object') return null
  const title = String(job.title || job.name || job.label || '').trim()
  if (!title) return null
  return {
    ...job,
    title,
    skills: Array.isArray(job.skills) ? job.skills.filter(Boolean) : []
  }
}

function normalizeStudy(study) {
  if (typeof study === 'string') return { degree: study.trim(), type: '' }
  if (!study || typeof study !== 'object') return null
  const degree = String(study.degree || study.title || study.name || '').trim()
  if (!degree) return null
  return { ...study, degree, type: String(study.type || study.description || '').trim() }
}

function uniqueByTitle(items, key) {
  const seen = new Set()
  return items.filter((item) => {
    const value = normalizedText(item?.[key])
    if (!value || seen.has(value)) return false
    seen.add(value)
    return true
  })
}

function prioritizeStudiesByFormationPreferences(studies, formationPreferences) {
  const patterns = (Array.isArray(formationPreferences) ? formationPreferences : [])
    .map((preference) => FORMATION_PREFERENCE_PATTERNS[normalizedText(preference)])
    .filter(Boolean)

  if (!patterns.length) return studies

  const preferredStudies = patterns.flatMap((pattern) => studies.filter((study) => {
    const text = normalizedText(`${study?.degree || ''} ${study?.type || ''}`)
    return pattern.test(text)
  }))

  return preferredStudies.length
    ? uniqueByTitle([...preferredStudies, ...studies], 'degree')
    : studies
}

export function enforceOrientationRecommendationQuality({ jobRecommendations, studyRecommendations, formationPreferences } = {}) {
  const jobs = uniqueByTitle((Array.isArray(jobRecommendations) ? jobRecommendations : []).map(normalizeJob).filter(Boolean), 'title')
  const studies = uniqueByTitle((Array.isArray(studyRecommendations) ? studyRecommendations : []).map(normalizeStudy).filter(Boolean), 'degree')

  return {
    jobRecommendations: jobs.slice(0, 6),
    studyRecommendations: prioritizeStudiesByFormationPreferences(studies, formationPreferences).slice(0, 6)
  }
}