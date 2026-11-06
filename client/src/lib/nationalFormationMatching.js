import { DEPARTMENTS } from './departments.js'
import { getFormationTitle } from './formationDisplay.js'
import { FORMATION_PREFERENCE_LEVELS } from './formationLevel.js'
import { buildFormationRelevanceProfile, buildRelevanceDiscoveryQueries, normalizeRelevanceText, scoreFormationRelevance } from './formationRelevance.js'

export const NATIONAL_CODE_SUBJECTS = {
  sio: 'services informatiques organisations', ciel: 'cybersécurité informatique réseaux électronique',
  svt: 'biologie sciences vie terre', staps: 'sport', stid: 'statistique informatique données',
  info: 'informatique', math: 'mathématiques', eg: 'économie gestion',
  lea: 'langues étrangères appliquées', llcer: 'langues littératures civilisations étrangères',
  haa: 'histoire art archéologie', ap: 'arts plastiques',
  gc: 'génie civil construction', geii: 'génie électrique informatique industrielle',
  gmp: 'génie mécanique productique', tc: 'commerce commercialisation',
  ndrc: 'négociation relation client commerce', mco: 'management commercial',
  gea: 'gestion entreprises administration', mmi: 'multimédia informatique communication'
}

export const NATIONAL_FORMAT_PATTERNS = {
  bts: ['BTS*'], but: ['BUT*'], licence: ['L1-*', 'L2-*', 'L3-*', 'Licence*'],
  bachelor: ['Bachelor*', '*BAC3*'], master: ['M1-*', 'M2-*', 'Master*', 'CMI*', 'ScPo*', '*BAC5*', 'DSCG*', 'DNSEP*'],
  doctorat: ['*doctorat*', '*PhD*', '*thèse*'], voie_pro: ['CAP*', '*Bac*pro*'],
  prepa: ['CPGE*', '*prépa*']
}

export function getNationalAcademicGrade(row = {}) {
  const raw = row.raw || row
  const title = normalizeRelevanceText(raw.nm?.[0])
  // Some Parcoursup headers say "Grade Master" even on a specific Bachelor campus.
  if (/\bbachelor\b/.test(title) && !/^(?:diplome national de )?master\b/.test(title)
    && !/^M[12](?:[-\s]|$)/i.test(String(raw.nmc || ''))) return null
  const text = normalizeRelevanceText([raw.nm?.[0], ...(Array.isArray(raw.fl) ? raw.fl : [])].filter(Boolean).join(' '))
  return text.match(/\bgrade (?:de )?(licence|master)\b/)?.[1] || null
}

export function getNationalDiplomaFormat(row) {
  const code = String(row.nmc || '').trim()
  const text = normalizeRelevanceText(row.nm?.[0] || code)
  if (/^CMI(?:[-/\s]|$)/i.test(code)
    || /^(?:c m i )?cursus master (?:en )?ingenierie\b/.test(text)
    || (/^L[123](?:[-\s]|$)/i.test(code) && /\bcursus master (?:en )?ingenierie\b/.test(text))) return 'master'
  if (/^BTS[AM]?(?:[-/\s]|$)/i.test(code)) return 'bts'
  if (/^BUT(?:[-/\s]|$)/i.test(code)) return 'but'
  if (/^L[123](?:[-\s]|$)/i.test(code)) return 'licence'
  if (/^M[12](?:[-\s]|$)/i.test(code)) return 'master'
  if (/^FI[-\s]/i.test(code)) return 'ecole_specialisee'
  if (/^DNM-/i.test(code)) return 'ecole_specialisee'
  if (/^(mise a niveau|classe de mise a niveau|annee preparatoire|insertion a la licence)\b/.test(text)
    || /^(MAN-|AnP$)/i.test(code)) return 'preparation'
  if (/^(du|diu|diplome d universite|diplome universitaire|diplome interuniversitaire|diplome inter universitaire)\b/.test(text)) return 'du'
  if (/^(mastere|mba|msc)\b/.test(text)) return 'postgraduate'
  if (/docteur en (medecine|pharmacie|chirurgie dentaire)|doctorat d exercice/.test(text)) return 'doctorat_exercice'
  for (const [format, pattern] of [
    ['doctorat', /^(?:diplome national de )?(doctorat|phd)\b/],
    ['bts', /^bts[am]?\b/], ['but', /^but\b/], ['licence', /^(?:double )?licence\b/],
    ['bachelor', /\bbachelor\b/], ['master', /^(?:diplome national de )?master\b/],
    ['prepa', /\b(cpge|prepa|preparatoire)\b/], ['voie_pro', /\b(cap|bac pro|bac professionnel)\b/]
  ]) {
    if (pattern.test(text)) return format
  }
  return ''
}

export function getNationalStudyLevels(profile = {}) {
  if (Array.isArray(profile.study_levels)) return [...new Set(profile.study_levels)]
  const preferences = Array.isArray(profile.formation_preferences) ? profile.formation_preferences : []
  const selected = preferences.map((value) => FORMATION_PREFERENCE_LEVELS[value]).filter(Boolean)
  if (selected.length) return [...new Set(selected)]
  const target = normalizeRelevanceText(profile.target_level)
  if (!target || target === 'open' || target.includes('ouvert')) return []
  for (const [label, level] of Object.entries(FORMATION_PREFERENCE_LEVELS)) {
    if (target === label) return [level]
  }
  const match = target.match(/\b(?:bac|niveau)?\s*([12358])\b/)
  return match ? [Number(match[1])] : []
}

export function inferNationalStudyLevel(row = {}) {
  const raw = row.raw || row
  const code = String(raw.nmc || '').trim()
  const family = getNationalDiplomaFormat(raw)
  if (family === 'master') return 5
  if (/^L[123](?:[-\s]|$)/i.test(code)) return 3
  if (/^M[12](?:[-\s]|$)/i.test(code)) return 5
  if (/^(?:DNM-|DN\s*MADE)/i.test(code)) return 3
  if (/^FI[-\s]*BAC5/i.test(code)) return 5
  if (/^BTS[AM]?(?:[-/\s]|$)|^(DUT|DEUST)(?:[-/\s]|$)/i.test(code)) return 2
  if (/^(BUT|DCG|DNA)(?:[-/\s]|$)/i.test(code)) return 3
  if (/^(DSCG|DNSEP)(?:[-/\s]|$)/i.test(code)) return 5
  if (['du', 'doctorat_exercice', 'prepa', 'preparation'].includes(family) || /^(PASS|CUPGE|CPES)(?:[-/\s]|$)/i.test(code)) return null
  if (family === 'doctorat') return 8
  if (['licence', 'but'].includes(family)) return 3
  if (family === 'bts') return 2
  if (family === 'voie_pro') return 1
  const title = normalizeRelevanceText(raw.nm?.[0] || code)
  const explicit = title.match(/\bbac\s*([234568])\b/)
  if (explicit && !/\b(admission|acces|recrutement|apres)\b.{0,30}\bbac\b/.test(title)) return Number(explicit[1])
  const grade = getNationalAcademicGrade(raw)
  return grade ? grade === 'master' ? 5 : 3 : null
}

// Only a department actually supplied by the student scopes the national search.
// The reference city is not a substitute for an entire department.
export function resolveNationalDepartment(value) {
  const raw = typeof value === 'object' && value
    ? value.code || value.department || value.name || value.department_name || ''
    : value
  const key = normalizeRelevanceText(raw)
  const padded = /^\d$/.test(key) ? key.padStart(2, '0') : key
  const match = DEPARTMENTS.find(([code, name]) => normalizeRelevanceText(code) === padded || normalizeRelevanceText(name) === key)
  return match?.[1] || ''
}

export function getNationalFormationTitle(row = {}) {
  const title = getFormationTitle(row)
    .replace(/^L([123])[-\s]/i, 'Licence $1 - ')
    .replace(/^M([12])[-\s]/i, 'Master $1 - ')
  if (row.nm?.length || row.fl?.length) return title
  const subject = normalizeRelevanceText(row.nmc).split(' ').find((word) => NATIONAL_CODE_SUBJECTS[word])
  return subject ? `${title} — ${NATIONAL_CODE_SUBJECTS[subject]}` : title
}

export function nationalFormationMatches(row, profile = {}, department = '') {
  if (department && normalizeRelevanceText(row.departement) !== normalizeRelevanceText(department)) return false
  const levels = getNationalStudyLevels(profile)
  if (levels.length && !levels.includes(inferNationalStudyLevel(row))) return false
  const preferences = profile.formation_preferences || []
  const diplomaFormats = preferences.filter((preference) => Object.hasOwn(NATIONAL_FORMAT_PATTERNS, preference))
  const matchesMasterGrade = diplomaFormats.includes('master') && getNationalAcademicGrade(row) === 'master'
  if (diplomaFormats.length && !preferences.includes('ecole_specialisee')
    && !diplomaFormats.includes(getNationalDiplomaFormat(row)) && !matchesMasterGrade) return false
  if (preferences.length === 1 && preferences[0] === 'alternance') {
    return /apprentissage|alternance|(?:^|[-/])app(?:$|[-/])/i.test([row.app, row.nmc, row.nm].join(' '))
  }
  if (preferences.length === 1 && preferences[0] === 'prepa') {
    return /cpge|pr[eé]pa/i.test([row.nmc, row.nm, row.fl].join(' '))
  }
  return true
}

export function scoreNationalFormation(row, relevanceProfile, profile = {}) {
  const codeWords = normalizeRelevanceText(row.nmc).split(' ')
  const expanded = codeWords.map((word) => NATIONAL_CODE_SUBJECTS[word] || '').join(' ')
  return scoreFormationRelevance({ title: `${getNationalFormationTitle(row)} ${expanded}`, raw: row }, relevanceProfile, {
    levelMatches: getNationalStudyLevels(profile).includes(inferNationalStudyLevel(row))
  })
}

export function nationalSearchParameters(profile = {}, department = '') {
  return {
    matching: 'profile',
    study_levels: getNationalStudyLevels(profile).join(','),
    formation_formats: (profile.formation_preferences || []).join(','),
    ...(department ? { departement: department } : {})
  }
}

export function nationalSearchNotice(profile = {}, rows = []) {
  if (!getNationalStudyLevels(profile).includes(8) || rows.some((row) => inferNationalStudyLevel(row) === 8)) return ''
  return 'Aucun doctorat correspondant n’est référencé dans ce catalogue. Ton choix n’a pas été remplacé par un autre diplôme. Le parcours habituel vers un doctorat passe par une licence puis un master : ce sont des étapes préparatoires, pas des propositions de doctorat.'
}

export function buildNationalRelevanceProfile(context = {}) {
  const relevance = buildFormationRelevanceProfile(context)
  if (relevance.groups.length) return relevance
  const subjects = {
    maths: 'mathématiques', francais: 'lettres', anglais: 'langues',
    sciences: 'biologie physique chimie', eco: 'économie', arts: 'design', numerique: 'informatique'
  }
  const studies = (context.profile?.strong_subjects || []).map((subject) => ({ degree: subjects[subject] || subject }))
  return buildFormationRelevanceProfile({ analysis: { studyRecommendations: studies } })
}

export function buildNationalDiscoveryQueries(context = {}) {
  const seen = new Set()
  return buildRelevanceDiscoveryQueries(buildNationalRelevanceProfile(context)).filter((query) => {
    const key = normalizeRelevanceText(query)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
