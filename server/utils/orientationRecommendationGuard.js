const CAREER_ASPIRATION_ANCHORS = [
  {
    matches: [/\bgruti(?:er|ere)\b/i, /\bgrue\b/i, /conducteur(?:rice)? de grue/i],
    environment: 'field',
    job: {
      title: 'Grutier ou grutière',
      skills: ['Vigilance', 'Précision', 'Lecture de plan', 'Sécurité chantier']
    },
    study: {
      degree: 'CACES R487 - conduite de grues',
      type: 'Certification pour conduire une grue en sécurité, à compléter par une formation de chantier adaptée.'
    }
  },
  {
    matches: [/\bavocat(?:e)?\b/i, /\bjuriste\b/i, /\bdroit\b/i, /\bjustice\b/i, /\bmagistrat\b/i],
    jobMatches: [/\bavocat(?:e)?\b/i],
    environment: 'office',
    job: {
      title: 'Avocat ou avocate',
      skills: ['Argumentation', 'Analyse juridique', 'Expression écrite', 'Écoute']
    },
    study: {
      degree: 'Licence de droit puis master en droit et préparation au CRFPA',
      type: 'Parcours universitaire menant aux métiers du droit, avec une spécialisation progressive.'
    }
  },
  {
    matches: [/\bm[ée]canicien(?:ne)?\b/i, /\bm[ée]canique\b/i],
    environment: 'field',
    job: {
      title: 'Mécanicien ou mécanicienne',
      skills: ['Diagnostic', 'Habileté manuelle', 'Méthode', 'Sécurité']
    },
    study: {
      degree: 'CAP Maintenance des véhicules',
      type: 'Formation pratique pour diagnostiquer, entretenir et réparer des véhicules.'
    }
  },
  {
    matches: [/\b[ée]lectricien(?:ne)?\b/i, /\b[ée]lectricit[ée]\b/i],
    environment: 'field',
    job: {
      title: 'Électricien ou électricienne',
      skills: ['Précision', 'Lecture de plan', 'Diagnostic', 'Sécurité']
    },
    study: {
      degree: 'CAP Électricien',
      type: 'Formation pratique pour installer, entretenir et dépanner des équipements électriques.'
    }
  },
  {
    matches: [/\bcuisinier(?:e)?\b/i, /\bcuisine\b/i, /\bchef de cuisine\b/i, /\bchef cuisinier\b/i],
    environment: 'field',
    job: {
      title: 'Cuisinier ou cuisinière',
      skills: ['Créativité', 'Organisation', 'Gestes techniques', 'Travail d’équipe']
    },
    study: {
      degree: 'CAP Cuisine',
      type: 'Formation professionnalisante pour apprendre les techniques et l’organisation en cuisine.'
    }
  },
  {
    matches: [/\binfirmier(?:e)?\b/i, /\bsoin\b/i, /\bsant[ée]\b/i],
    environment: 'field',
    job: {
      title: 'Infirmier ou infirmière',
      skills: ['Écoute', 'Rigueur', 'Sang-froid', 'Travail d’équipe']
    },
    study: {
      degree: 'Diplôme d’État d’infirmier',
      type: 'Formation en institut de soins infirmiers, alternant cours et stages.'
    }
  },
  {
    matches: [/\bsport\b/i, /\bcoach\b/i, /\b[ée]ducateur(?:rice)? sportif\b/i],
    environment: 'field',
    job: {
      title: 'Éducateur ou éducatrice sportive',
      skills: ['Énergie', 'Pédagogie', 'Adaptation', 'Sens des responsabilités']
    },
    study: {
      degree: 'BPJEPS',
      type: 'Formation professionnalisante pour encadrer des activités physiques et sportives.'
    }
  }
]

const FIELD_FALLBACK_JOBS = [
  { title: 'Technicien ou technicienne de maintenance industrielle', skills: ['Diagnostic', 'Méthode', 'Mécanique', 'Sécurité'] },
  { title: 'Conducteur ou conductrice d’engins de travaux publics', skills: ['Précision', 'Vigilance', 'Lecture de plan', 'Sécurité chantier'] },
  { title: 'Électricien ou électricienne', skills: ['Habileté manuelle', 'Diagnostic', 'Rigueur', 'Sécurité'] },
  { title: 'Mécanicien ou mécanicienne', skills: ['Diagnostic', 'Technique', 'Patience', 'Précision'] },
  { title: 'Technicien ou technicienne environnement', skills: ['Observation', 'Terrain', 'Rigueur', 'Analyse'] },
  { title: 'Chef ou cheffe de chantier', skills: ['Organisation', 'Leadership', 'Lecture de plan', 'Sécurité'] }
]

const FIELD_JOB_PATTERN = /grue|gruti|engins?|chantier|btp|maintenance|m[ée]can|[ée]lectric|environnement|agricult|transport|secours|sport|cuisine|soin|infirm|artisan|paysag|logistique|technicien/i
const SEDENTARY_JOB_PATTERN = /developpe|informatique|data|web|logiciel|programmeur|product owner|cybersecurite|\b(?:ux|ui)\s*(?:designer|design)\b|comptable|juriste|avocat|notaire|redacteur|traduct|administratif|gestionnaire|analyste financier|banquier|ressources humaines|\brh\b|secretaire|assistant(?:e)? de direction/i
const FORMATION_PREFERENCE_PATTERNS = {
  bts: /\bbts\b/i,
  but: /\bbut\b/i,
  licence: /\blicence\b/i,
  bachelor: /\bbachelor\b/i,
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

function getAspirationAnchor(careerAspiration) {
  const value = normalizedText(careerAspiration)
  if (!value) return null
  return CAREER_ASPIRATION_ANCHORS.find((anchor) => anchor.matches.some((pattern) => pattern.test(value))) || null
}

function moveOrInsert(items, item, matches) {
  const matchingIndex = items.findIndex((candidate) => matches(candidate))
  if (matchingIndex >= 0) {
    const [matchingItem] = items.splice(matchingIndex, 1)
    return [matchingItem, ...items]
  }
  return [item, ...items]
}

function isFieldJob(job) {
  return FIELD_JOB_PATTERN.test(normalizedText(job?.title))
}

function isSedentaryJob(job) {
  return SEDENTARY_JOB_PATTERN.test(normalizedText(job?.title))
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

export function enforceOrientationRecommendationQuality({ jobRecommendations, studyRecommendations, careerAspiration, formationPreferences, axes } = {}) {
  let jobs = uniqueByTitle((Array.isArray(jobRecommendations) ? jobRecommendations : []).map(normalizeJob).filter(Boolean), 'title')
  let studies = uniqueByTitle((Array.isArray(studyRecommendations) ? studyRecommendations : []).map(normalizeStudy).filter(Boolean), 'degree')
  const anchor = getAspirationAnchor(careerAspiration)

  if (anchor) {
    jobs = moveOrInsert(
      jobs,
      anchor.job,
      (job) => (anchor.jobMatches || anchor.matches).some((pattern) => pattern.test(normalizedText(job.title)))
    )
    studies = moveOrInsert(
      studies,
      anchor.study,
      (study) => anchor.matches.some((pattern) => pattern.test(normalizedText(study.degree)))
    )
  }

  const fieldOrHandsOnProfile = axes?.hands_mind === 'mains' || axes?.field_office === 'terrain'
  const needsFieldDiversity = (fieldOrHandsOnProfile || anchor?.environment === 'field') && anchor?.environment !== 'office'
  if (needsFieldDiversity) {
    const fieldJobs = jobs.filter(isFieldJob)
    for (const fallback of FIELD_FALLBACK_JOBS) {
      if (fieldJobs.length >= 3) break
      if (!fieldJobs.some((job) => normalizedText(job.title) === normalizedText(fallback.title))) {
        fieldJobs.push(fallback)
      }
    }

    const nonOfficeJobs = jobs.filter((job) => !isFieldJob(job) && !isSedentaryJob(job))
    const officeJobs = jobs.filter(isSedentaryJob).slice(0, 2)
    const remainingFieldJobs = FIELD_FALLBACK_JOBS.filter((fallback) => !fieldJobs.some((job) => normalizedText(job.title) === normalizedText(fallback.title)))
    jobs = uniqueByTitle([...fieldJobs, ...nonOfficeJobs, ...officeJobs, ...remainingFieldJobs], 'title').slice(0, 6)
  }

  studies = prioritizeStudiesByFormationPreferences(studies, formationPreferences)

  return {
    jobRecommendations: uniqueByTitle(jobs, 'title').slice(0, 6),
    studyRecommendations: uniqueByTitle(studies, 'degree').slice(0, 6)
  }
}