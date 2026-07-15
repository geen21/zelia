import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { orientationAPI, usersAPI, ecolesAPI } from '../lib/api.js'
import { AI_JOB_DECK_SIZE } from '../lib/orientationJobs.js'
import PersonaRevealCard from '../components/PersonaRevealCard.jsx'
import { buildLoreleiUrl, buildPersonaAvatarConfig, computePersonaFromAnswers, getPersonaBySlug } from '../lib/personas.js'
import { generatePersonaShareCard } from '../lib/shareImage.js'
import { trackOrientationEvent } from '../lib/analytics.js'
import './OrientationFlow.css'

const QUESTION_LIMIT = 20
const ANSWERS_PROGRESS_KEY = 'answers_progress'
const ANSWERS_PROGRESS_VERSION = `orientation-flow-${QUESTION_LIMIT}`
const DRAG_THRESHOLD = 96
const MAX_PROPOSAL_DECK = 24
const MAX_FINAL_RESULTS = 14
const AI_FORMATION_DECK_SIZE = 8
const AI_FORMATION_KEYWORD_COUNT = 6
const CATALOG_RETRY_ATTEMPTS = 2
const PRESELECTED_CANDIDATES_PER_KIND = 4
const MAX_PARTNER_FINAL_RESULTS = 4
const FORMATION_SEARCH_WAITING_MESSAGE = 'Ne quitte pas la page, on cherche parmi 127 498 formations rien que pour toi ;)'
const CATALOG_SEARCH_CONCURRENCY = 4
const MAX_FORMATION_QUERY_VARIANTS = 2
const FINAL_FORMATION_SEARCH_PLAN_COUNT = 4
const FINAL_FORMATION_PAGE_SIZE = 10
const PROFILE_IDENTITY_KEY = 'orientation_profile_identity'
const ORIENTATION_SHARE_URL = 'https://zelia.io/orientation?utm_source=Appfinparcours&utm_medium=Appfinparcours&utm_campaign=SharedLink-Appfinparcours&utm_id=Tracker-Shared-Link'
const DEFAULT_PROFILE_IDENTITY = { firstName: '', lastName: '', gender: '' }
const FORMATION_ANCHOR_STOPWORDS = new Set(['formation', 'formations', 'piste', 'parcours', 'etude', 'etudes', 'ecole', 'ecoles', 'universite', 'lycee', 'cfa', 'iut', 'cnam', 'greta', 'diplome', 'metier', 'metiers', 'professionnel', 'professionnelle', 'initiale', 'alternance', 'bts', 'but', 'dut', 'licence', 'bachelor', 'master', 'mastere', 'mba', 'msc', 'ingenieur', 'de', 'du', 'des', 'en', 'et', 'a', 'au', 'aux', 'le', 'la', 'les', 'pour', 'avec', 'dans', 'niveau', 'vise'])

const PARTNER_CITY_BY_DEPARTMENT_CODE = {
  '06': 'Nice',
  '14': 'Caen',
  '31': 'Toulouse',
  '33': 'Bordeaux',
  '34': 'Montpellier',
  '35': 'Rennes',
  '38': 'Grenoble',
  '44': 'Nantes',
  '49': 'Angers',
  '54': 'Nancy',
  '56': 'Vannes',
  '59': 'Lille',
  '69': 'Lyon',
  '74': 'Annecy',
  '75': 'Paris',
  '77': 'Melun',
  '78': 'St-Quentin-en-Yvelines',
  '91': 'Paris',
  '92': 'Paris',
  '93': 'Paris',
  '94': 'Paris',
  '95': 'Paris'
}

const PARTNER_CITIES = new Set(Object.values(PARTNER_CITY_BY_DEPARTMENT_CODE).map((city) => city.toLowerCase()))

const FALLBACK_QUESTION_OPTIONS = [
  { label: 'Non', value: 'non' },
  { label: 'Oui', value: 'oui' }
]

const CAREER_DOMAIN_OPTIONS = [
  { label: 'Soigner et aider', value: 'sante_soin', icon: 'ph-heart' },
  { label: 'Construire et réparer', value: 'construction_technique', icon: 'ph-wrench' },
  { label: 'Créer et communiquer', value: 'creation_communication', icon: 'ph-palette' },
  { label: 'Protéger et accompagner', value: 'service_public', icon: 'ph-shield-check' },
  { label: 'Bouger et être dehors', value: 'terrain_sport', icon: 'ph-mountains' },
  { label: 'Comprendre et innover', value: 'science_numerique', icon: 'ph-lightbulb' },
  { label: 'Cuisiner et accueillir', value: 'hotellerie_restauration', icon: 'ph-cooking-pot' },
  { label: 'Vendre et entreprendre', value: 'commerce_entrepreneuriat', icon: 'ph-storefront' }
]

const CAREER_JOB_SUGGESTIONS = [
  { label: 'Architecte', value: 'architecte' },
  { label: 'Avocat ou avocate', value: 'avocate' },
  { label: 'Grutier ou grutiere', value: 'grutier' },
  { label: 'Infirmier ou infirmiere', value: 'infirmier' },
  { label: 'Developpeur ou developpeuse', value: 'developpeur' },
  { label: 'Cuisinier ou cuisiniere', value: 'cuisinier' },
  { label: 'Mecanicien ou mecanicienne', value: 'mecanicien' },
  { label: 'Educateur ou educatrice', value: 'educateur' }
]

function getQuestionOptions(question) {
  const options = Array.isArray(question?.options)
    ? question.options.filter((option) => option && option.label)
    : []
  return options.length >= 2 ? options.slice(0, 2) : FALLBACK_QUESTION_OPTIONS
}

const CATEGORY_ICONS = {
  hands_mind: 'ph-hand-fist',
  solo_team: 'ph-users-three',
  creative_structured: 'ph-palette',
  field_office: 'ph-compass',
  risk_safety: 'ph-lightning'
}

function getCategoryIcon(category) {
  return CATEGORY_ICONS[category] || 'ph-sparkle'
}

const MICRO_STEPS = [
  {
    id: 'grade_confidence',
    title: 'Indique ta moyenne dans tes matières fortes',
    options: [
      { label: '10-12', value: '10-12' },
      { label: '12-14', value: '12-14' },
      { label: '14-16', value: '14-16' },
      { label: '16+', value: '16+' }
    ]
  },
  {
    id: 'school_level',
    title: "Tu es aujourd'hui en...",
    options: [
      { label: '3e', value: '3e' },
      { label: '2nde', value: '2nde' },
      { label: '1ère', value: '1ere' },
      { label: 'Terminale', value: 'terminale' },
      { label: 'Post-bac', value: 'post_bac' }
    ]
  },
  {
    id: 'target_level',
    title: "Niveau d'études visé",
    options: [
      { label: 'Bac +2', value: 'Bac +2' },
      { label: 'Bac +3', value: 'Bac +3' },
      { label: 'Bac +5', value: 'Bac +5' },
      { label: 'Bac +8', value: 'Bac +8' },
      { label: 'Ouvert', value: 'open' }
    ]
  },
  {
    id: 'study_location',
    title: 'Pour tes études, tu préfères...',
    options: [
      { label: 'Près de chez moi', value: 'near_home' },
      { label: 'Changer de ville', value: 'move_city' },
      { label: 'Les deux', value: 'both' }
    ]
  },
  {
    id: 'strong_subjects',
    title: 'Tu te sens solide en...',
    multi: true,
    options: [
      { label: 'Maths', value: 'maths' },
      { label: 'Français', value: 'francais' },
      { label: 'Anglais', value: 'anglais' },
      { label: 'Sciences', value: 'sciences' },
      { label: 'Éco', value: 'eco' },
      { label: 'Arts', value: 'arts' },
      { label: 'Numérique', value: 'numerique' }
    ]
  },
  {
    id: 'career_domains',
    type: 'career_domains',
    title: 'Quels univers t’attirent le plus ?',
    description: 'Choisis jusqu’à trois univers, même si tu hésites encore.',
    multi: true,
    maxSelections: 3,
    options: CAREER_DOMAIN_OPTIONS
  },
  {
    id: 'career_aspiration',
    type: 'career_aspiration',
    title: 'Y a-t-il un métier qui t’attire déjà ?',
    description: 'Choisis une idée ou écris la tienne. Tu pourras toujours changer plus tard.',
    placeholder: 'Ex. architecte, grutier, cuisine...',
    suggestions: CAREER_JOB_SUGGESTIONS
  }
]

const LOCATION_STEP_ID = 'study_location'

function getMicroStepsForIntent() {
  return MICRO_STEPS
}

function buildCareerAspirationSignal(profile = {}) {
  const explicitAspiration = String(profile.career_aspiration || '').trim()
  const selectedDomains = Array.isArray(profile.career_domains) ? profile.career_domains : []
  const domainLabels = CAREER_DOMAIN_OPTIONS
    .filter((option) => selectedDomains.includes(option.value))
    .map((option) => option.label)

  return [explicitAspiration, ...domainLabels].filter(Boolean).join(' - ').slice(0, 160)
}

function sanitizeMicroProfileForIntent(profile, intent) {
  if (!profile || typeof profile !== 'object') return {}
  const allowedIds = new Set(getMicroStepsForIntent(intent).map((step) => step.id))
  return Object.fromEntries(Object.entries(profile).filter(([key]) => allowedIds.has(key)))
}

async function runWithConcurrency(items, limit, mapper) {
  if (!items.length) return []

  const results = new Array(items.length)
  let nextIndex = 0
  const workerCount = Math.min(Math.max(limit, 1), items.length)

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex
      nextIndex += 1
      results[currentIndex] = await mapper(items[currentIndex], currentIndex)
    }
  }))

  return results
}

async function retryAsync(action, { attempts = 3, label = 'operation', isValidResult = () => true } = {}) {
  let lastError = null

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await action(attempt)
      if (isValidResult(result)) return result
      lastError = new Error(`${label} returned an invalid result`)
    } catch (error) {
      lastError = error
    }

    if (attempt < attempts) {
      console.warn(`${label} failed, retrying ${attempt + 1}/${attempts}`, lastError)
    }
  }

  throw lastError || new Error(`${label} failed`)
}

function hasAnySearchTerm(value, terms) {
  const normalized = normalizeDiversityText(value)
  return terms.some((term) => new RegExp(`\\b${term}\\b`).test(normalized))
}

function uniqueSearchQueries(queries) {
  const seen = new Set()
  return queries.filter((query) => {
    const normalized = normalizeDiversityText(query)
    if (!normalized || seen.has(normalized)) return false
    seen.add(normalized)
    return true
  })
}

function modifyDicebearUrl(urlStr, params = {}) {
  try {
    const url = new URL(urlStr)
    const isDicebear = /api\.dicebear\.com/.test(url.host) && /\/lorelei\/svg/.test(url.pathname)
    if (!isDicebear) return urlStr
    Object.entries(params).forEach(([key, value]) => {
      if (value === null || value === undefined || value === '') url.searchParams.delete(key)
      else url.searchParams.set(key, String(value))
    })
    return url.toString()
  } catch {
    return urlStr
  }
}

function getStoredJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function normalizeProfileIdentity(value = {}) {
  return {
    firstName: String(value.firstName || value.first_name || value.prenom || '').trim(),
    lastName: String(value.lastName || value.last_name || value.nom || '').trim(),
    gender: String(value.gender || value.genre || '').trim()
  }
}

function mergeProfileIdentity(current = DEFAULT_PROFILE_IDENTITY, incoming = DEFAULT_PROFILE_IDENTITY) {
  const currentIdentity = normalizeProfileIdentity(current)
  const incomingIdentity = normalizeProfileIdentity(incoming)
  return {
    firstName: currentIdentity.firstName || incomingIdentity.firstName,
    lastName: currentIdentity.lastName || incomingIdentity.lastName,
    gender: currentIdentity.gender || incomingIdentity.gender
  }
}

function getStoredDepartment() {
  const stored = getStoredJson('registration_department', null)
  if (stored && typeof stored === 'object') return stored
  return { code: '', name: '' }
}

function normalizeLocationText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function isSameLocation(left, right) {
  const a = normalizeLocationText(left)
  const b = normalizeLocationText(right)
  if (!a || !b) return false
  return a === b || a.includes(b) || b.includes(a)
}

function getPartnerCityForDepartment(department = {}) {
  const directCity = department.city || department.ville || department.commune || ''
  if (directCity) return directCity

  const code = String(department.code || '').toUpperCase()
  if (PARTNER_CITY_BY_DEPARTMENT_CODE[code]) return PARTNER_CITY_BY_DEPARTMENT_CODE[code]

  const departmentName = String(department.name || '').trim()
  if (departmentName && PARTNER_CITIES.has(departmentName.toLowerCase())) return departmentName
  return ''
}

function getPreferredNearHomeLocation(department = {}) {
  return getPartnerCityForDepartment(department) || department.city || department.name || department.code || ''
}

function getCandidateCity(candidate) {
  return candidate?.raw?.city || candidate?.raw?.commune || candidate?.city || ''
}

function filterNearHomeCandidates(candidates, profile = {}, department = {}) {
  if (profile.study_location !== 'near_home') return candidates
  const preferredLocation = getPreferredNearHomeLocation(department)
  if (!preferredLocation) return candidates
  const filtered = candidates.filter((candidate) => isSameLocation(getCandidateCity(candidate), preferredLocation))
  return filtered.length ? filtered : []
}

function limitPartnerCandidates(candidates, maxCount = MAX_PARTNER_FINAL_RESULTS) {
  const seenSchools = new Map()
  const limited = []

  for (const candidate of candidates) {
    const schoolKey = normalizeLocationText(candidate?.raw?.school_name || candidate.title)
    const count = seenSchools.get(schoolKey) || 0
    if (count >= 2) continue
    seenSchools.set(schoolKey, count + 1)
    limited.push(candidate)
    if (limited.length >= maxCount) break
  }

  return limited
}

function selectPartnerCandidatesForFinal(rawPartners = [], profile = {}, department = {}, rejectedProposals = [], liked = [], maxCount = MAX_PARTNER_FINAL_RESULTS) {
  const levelCompatiblePartners = filterCandidatesByTargetStudyLevel(rawPartners, profile)
  const compatiblePartners = levelCompatiblePartners.length ? levelCompatiblePartners : rawPartners
  const preferredLocalPartners = filterNearHomeCandidates(compatiblePartners, profile, department)
  const sourcePartners = preferredLocalPartners.length ? preferredLocalPartners : compatiblePartners

  return filterRejectedCandidates(
    limitPartnerCandidates(sourcePartners, maxCount),
    rejectedProposals,
    liked
  )
}

function getStoredAnswersProgress() {
  const stored = getStoredJson(ANSWERS_PROGRESS_KEY, null)
  if (stored?.version === ANSWERS_PROGRESS_VERSION && stored.answers && typeof stored.answers === 'object') {
    return stored.answers
  }

  if (stored) {
    localStorage.removeItem(ANSWERS_PROGRESS_KEY)
    localStorage.removeItem('answers_cache')
  }
  return {}
}

function saveAnswersProgress(answers) {
  localStorage.setItem(ANSWERS_PROGRESS_KEY, JSON.stringify({
    version: ANSWERS_PROGRESS_VERSION,
    questionLimit: QUESTION_LIMIT,
    answers
  }))
}

function cleanQuestionText(raw) {
  if (typeof raw !== 'string') return raw || ''
  const trimmed = raw.trim()
  if (trimmed.startsWith('(')) {
    const firstQuote = trimmed.indexOf('"')
    const secondQuote = trimmed.indexOf('"', firstQuote + 1)
    if (firstQuote !== -1 && secondQuote !== -1) return trimmed.slice(firstQuote + 1, secondQuote)
  }
  return trimmed
}

function getAnalysisBlock(results) {
  return results?.inscriptionResults || results || null
}

function pickStudyTitle(study) {
  if (!study) return ''
  return study.degree || study.diploma || study.title || study.type || ''
}

function pickJobTitle(job) {
  if (!job) return ''
  return job.title || job.intitule || String(job || '')
}

function extractKeywords(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 4)
    .filter((token) => !['formation', 'metier', 'ecole', 'master', 'licence', 'bachelor'].includes(token))
    .slice(0, 4)
    .join(' ')
}

function uniquePlans(plans) {
  const seen = new Set()
  return (plans || []).filter((plan) => {
    const key = `${plan?.kind || ''}-${plan?.query || ''}-${plan?.title || ''}`.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function balancePlansForIntent(primaryPlans, intent, fallbackPlans = [], maxCount = 6) {
  if (intent !== 'both') return uniquePlans(primaryPlans).slice(0, maxCount)

  const plans = uniquePlans(primaryPlans)
  const fallbacks = uniquePlans(fallbackPlans)
  const formations = uniquePlans([
    ...plans.filter((plan) => plan.kind === 'formation'),
    ...fallbacks.filter((plan) => plan.kind === 'formation')
  ])
  const metiers = uniquePlans([
    ...plans.filter((plan) => plan.kind === 'metier'),
    ...fallbacks.filter((plan) => plan.kind === 'metier')
  ])

  const balanced = []
  const rounds = Math.max(formations.length, metiers.length)
  for (let index = 0; index < rounds && balanced.length < maxCount; index += 1) {
    if (formations[index] && balanced.length < maxCount) balanced.push(formations[index])
    if (metiers[index] && balanced.length < maxCount) balanced.push(metiers[index])
  }
  return balanced.length ? balanced : plans.slice(0, maxCount)
}

function buildAnalysisRecommendationPlans(intent, analysis, extraText = '') {
  const block = getAnalysisBlock(analysis) || {}
  const studies = Array.isArray(block.studyRecommendations) ? block.studyRecommendations : []
  const jobs = Array.isArray(block.jobRecommendations) ? block.jobRecommendations : []

  const formationPlans = studies.slice(0, 4).map((study) => {
    const title = pickStudyTitle(study)
    return {
      title,
      kind: 'formation',
      query: extractKeywords(`${title} ${study?.type || ''} ${extraText}`) || title,
      reason: study?.type || 'Piste cohérente avec tes réponses'
    }
  }).filter((plan) => plan.title)

  const jobPlans = jobs.slice(0, 4).map((job) => {
    const title = pickJobTitle(job)
    const skills = compactTags([job?.skills, job?.competences, job?.strengths])
    return {
      title,
      kind: 'metier',
      query: extractKeywords(`${title} ${skills.join(' ')} ${extraText}`) || title,
      reason: skills.length ? skills.slice(0, 3).join(', ') : 'Métier compatible avec ton profil'
    }
  }).filter((plan) => plan.title)

  if (intent === 'metiers') return uniquePlans(jobPlans).slice(0, 8)
  if (intent === 'both') return balancePlansForIntent([...formationPlans, ...jobPlans], intent, [], 8)
  return uniquePlans(formationPlans).slice(0, 8)
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function collectFormationAnchorTexts(candidates = []) {
  return candidates.flatMap((candidate) => {
    const raw = candidate?.raw || {}
    return [
      candidate?.title,
      raw.formation_name,
      raw.search_query,
      raw.nmc,
      raw.tc,
      Array.isArray(raw.nm) ? raw.nm : raw.nm,
      Array.isArray(raw.keywords) ? raw.keywords : raw.keywords,
      Array.isArray(raw.schoolTypes) ? raw.schoolTypes : raw.schoolTypes
    ]
  })
    .flat(Infinity)
    .map((value) => cleanDetailText(value, 120))
    .filter(Boolean)
}

function normalizeFormationAnchorTerm(value) {
  const tokens = normalizeDiversityText(value)
    .split(' ')
    .filter((token) => token.length >= 3)
    .filter((token) => !FORMATION_ANCHOR_STOPWORDS.has(token))

  return tokens.slice(0, 4).join(' ')
}

function extractFormationAnchorTerms(likedFormations = []) {
  const signalTexts = collectFormationAnchorTexts(likedFormations)
  const normalizedSignal = normalizeDiversityText(signalTexts.join(' '))
  if (!normalizedSignal) return []

  const directTerms = signalTexts.map(normalizeFormationAnchorTerm).filter(Boolean)
  const tokenTerms = normalizedSignal
    .split(' ')
    .filter((token) => token.length >= 3)
    .filter((token) => !FORMATION_ANCHOR_STOPWORDS.has(token))

  return uniqueSearchQueries([...directTerms, ...tokenTerms]).slice(0, 18)
}

function textMatchesFormationAnchors(value, anchorTerms = []) {
  const haystack = normalizeDiversityText(flattenTextParts(value))
  if (!haystack || !anchorTerms.length) return false

  return anchorTerms.some((anchorTerm) => {
    const normalizedTerm = normalizeDiversityText(anchorTerm)
    if (!normalizedTerm) return false
    if (normalizedTerm.includes(' ')) return haystack.includes(normalizedTerm)
    return new RegExp(`\\b${escapeRegExp(normalizedTerm)}\\b`).test(haystack)
  })
}

function filterFormationPlansByAnchorTerms(plans = [], anchorTerms = []) {
  if (!anchorTerms.length) return plans
  return plans.filter((plan) => textMatchesFormationAnchors([plan?.query, plan?.title, plan?.reason], anchorTerms))
}

function buildFormationAnchorPlans(likedFormations = [], count = AI_FORMATION_KEYWORD_COUNT) {
  const anchorTerms = extractFormationAnchorTerms(likedFormations)
  const directPlans = buildCatalogPlansFromCandidates(likedFormations)
  const anchorPlans = anchorTerms.map((term) => ({
    kind: 'formation',
    query: cleanDetailText(term, 80),
    title: `Formations ${cleanDetailText(term, 80)}`,
    reason: 'Recherche liée aux swipes gardés'
  }))
  const plans = uniquePlans([...directPlans, ...anchorPlans])
  return filterFormationPlansByAnchorTerms(plans, anchorTerms).slice(0, count)
}

function filterCandidatesByFormationAnchors(candidates = [], likedFormations = []) {
  const anchorTerms = extractFormationAnchorTerms(likedFormations)
  if (!anchorTerms.length) return candidates

  return candidates.filter((candidate) => {
    if (candidate?.type !== 'formation') return true
    const raw = candidate?.raw || {}
    return textMatchesFormationAnchors([
      candidate?.title,
      candidate?.subtitle,
      Array.isArray(raw.nm) ? raw.nm : raw.nm,
      raw.nmc,
      raw.formation_name,
      raw.etab_nom,
      raw.tc,
      raw.tf,
      raw.domaine,
      raw.secteur
    ], anchorTerms)
  })
}

function normalizePercentageMatchScore(value) {
  const score = Number(value)
  if (!Number.isFinite(score) || score <= 0) return null
  const percent = score <= 1 ? score * 100 : score
  return Math.max(1, Math.min(100, Math.round(percent)))
}

function stableScoreHash(parts = []) {
  const text = (Array.isArray(parts) ? parts : [parts])
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join('|')
  if (!text) return 0

  let hash = 0
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0
  }
  return Math.abs(hash)
}

function buildStableMatchScore(seedParts, min = 68, max = 92) {
  const range = Math.max(1, max - min + 1)
  return min + (stableScoreHash(seedParts) % range)
}

function buildScoreOffset(seedParts, spread = 7) {
  const hasSeed = (Array.isArray(seedParts) ? seedParts : [seedParts]).some((part) => String(part || '').trim())
  if (!hasSeed) return 0
  return (stableScoreHash(seedParts) % spread) - Math.floor(spread / 2)
}

function normalizeCatalogRelevanceScore(value, seedParts = []) {
  const score = Number(value)
  if (!Number.isFinite(score) || score <= 0) return null

  const cappedScore = Math.min(score, 24)
  const normalized = 58 + Math.sqrt(cappedScore / 24) * 38
  const withTieBreak = normalized + buildScoreOffset(seedParts)
  return Math.max(58, Math.min(96, Math.round(withTieBreak)))
}

function flattenTextParts(value) {
  if (Array.isArray(value)) return value.flatMap(flattenTextParts)
  if (value === null || value === undefined) return []
  if (typeof value === 'object') return Object.values(value).flatMap(flattenTextParts)
  return [String(value)]
}

function getTargetStudyLevel(profile = {}) {
  const raw = String(profile?.target_level || '').trim().toLowerCase()
  if (!raw || raw === 'open' || raw.includes('ouvert')) return null
  if (raw.includes('8')) return 8
  if (raw.includes('5')) return 5
  if (raw.includes('3')) return 3
  if (raw.includes('2')) return 2
  return null
}

function getFormationLevelText(candidate) {
  const raw = candidate?.raw || candidate || {}
  return flattenTextParts([
    candidate?.title,
    candidate?.subtitle,
    raw.nm,
    raw.nmc,
    raw.formation_name,
    raw.diploma_level,
    raw.tf,
    raw.fl,
    raw.tc,
    raw.app,
    raw.int,
    raw.aut,
    raw.code_formation
  ]).join(' ')
}

function inferFormationStudyLevel(candidate) {
  const text = normalizeDiversityText(getFormationLevelText(candidate))
  if (!text) return null
  if (/\b(doctorat|these|phd|internat|bac\s*8|niveau\s*8|rncp\s*8)\b/.test(text)) return 8
  if (/\b(master|mastere|mba|msc|m1|m2|dnm|miage|ingenieur|ingenierie|dipl\s*ing|dscg|dnsep|grade\s*master|bac\s*5|niveau\s*7|rncp\s*7)\b/.test(text)) return 5
  if (/\b(licence|bachelor|but|dcg|dn\s*made|dna|bac\s*3|niveau\s*6|rncp\s*6)\b/.test(text)) return 3
  if (/\b(bts|dut|deust|bpjeps|bac\s*2|niveau\s*5|rncp\s*5)\b/.test(text)) return 2
  if (/\b(cap|bac\s*pro|bac\s*professionnel|mention\s*complementaire)\b/.test(text)) return 1
  return null
}

function hasShortCycleMarker(candidate) {
  const text = normalizeDiversityText(getFormationLevelText(candidate))
  return /\b(bts|dut|but|deust|bpjeps|cap|bac\s*pro|bac\s*professionnel|mention\s*complementaire|niveau\s*5|rncp\s*5)\b/.test(text)
}

function candidateMatchesTargetStudyLevel(candidate, targetLevel) {
  if (candidate?.type !== 'formation' || !targetLevel) return true
  const inferredLevel = inferFormationStudyLevel(candidate)

  if (targetLevel >= 8) {
    return inferredLevel === null ? !hasShortCycleMarker(candidate) : inferredLevel >= 8
  }

  if (targetLevel >= 5) {
    if (inferredLevel === null) return !hasShortCycleMarker(candidate)
    return inferredLevel >= 5
  }

  if (targetLevel >= 3) {
    if (inferredLevel === null) return true
    return inferredLevel >= 3
  }

  return true
}

function filterCandidatesByTargetStudyLevel(candidates = [], profile = {}) {
  const targetLevel = getTargetStudyLevel(profile)
  if (!targetLevel) return candidates
  return candidates.filter((candidate) => candidateMatchesTargetStudyLevel(candidate, targetLevel))
}

function buildGenericFormationPlans(targetLevel) {
  const queries = targetLevel >= 8
    ? ['médecine', 'master', 'ingénieur']
    : targetLevel >= 5
      ? ['master', 'ingénieur', 'école de commerce']
      : targetLevel >= 3
        ? ['licence', 'bachelor', 'but']
        : targetLevel >= 2
          ? ['bts', 'but', 'dut']
          : ['bts', 'licence', 'bachelor']
  return queries.map((query) => ({
    kind: 'formation',
    query,
    title: `Formations ${query}`,
    reason: 'Sélection large cohérente avec ton niveau visé'
  }))
}

function buildTargetedFormationQueries(query, targetLevel) {
  const cleanQuery = cleanDetailText(query, 80)
  if (!cleanQuery) return []
  const explicitFormationTerms = [
    'bts', 'but', 'dut', 'licence', 'bachelor', 'dn made', 'pass', 'las', 'ifsi', 'iut', 'cfa',
    'lycee', 'universite', 'ecole', 'cnam', 'greta', 'formation professionnelle', 'diplome',
    'ingenieur', 'master', 'mastere', 'mba', 'msc', 'doctorat'
  ]
  if (hasAnySearchTerm(cleanQuery, explicitFormationTerms)) return [cleanQuery]
  if (targetLevel >= 8) {
    if (hasAnySearchTerm(cleanQuery, ['doctorat', 'these', 'phd', 'medecine', 'pharmacie'])) return [cleanQuery]
    return uniqueSearchQueries([cleanQuery, `doctorat ${cleanQuery}`, `médecine ${cleanQuery}`, `pharmacie ${cleanQuery}`])
  }
  if (targetLevel >= 5) {
    if (hasAnySearchTerm(cleanQuery, ['master', 'mastere', 'mba', 'msc', 'ingenieur', 'ingenierie'])) return [cleanQuery]
    return uniqueSearchQueries([cleanQuery, `master ${cleanQuery}`, `mastère ${cleanQuery}`, `ingénieur ${cleanQuery}`, `mba ${cleanQuery}`])
  }
  if (targetLevel >= 3) {
    if (hasAnySearchTerm(cleanQuery, ['licence', 'bachelor', 'but'])) return [cleanQuery]
    return uniqueSearchQueries([cleanQuery, `licence ${cleanQuery}`, `bachelor ${cleanQuery}`, `but ${cleanQuery}`])
  }
  return [cleanQuery]
}

function normalizeFormation(item, index) {
  const nm = Array.isArray(item?.nm) ? item.nm.find(Boolean) : ''
  const formationTitle = nm || item?.formation_name || item?.nmc || 'Formation'
  const school = item?.etab_nom || item?.school_name || ''
  const place = [item?.commune || item?.city, item?.departement || item?.region]
    .filter(Boolean)
    .join(' - ')
  const subtitle = [school ? `École : ${school}` : '', place]
    .filter(Boolean)
    .join(' - ')
  return {
    id: `formation-${item?.id || index}`,
    rawId: item?.id || null,
    type: 'formation',
    title: formationTitle,
    subtitle: subtitle || 'Établissement à préciser',
    source: 'Formation proposée',
    sourceTable: 'formation_france',
    logoKind: 'formation',
    matchScore: item?.score !== undefined && item?.score !== null
      ? normalizeCatalogRelevanceScore(item.score, [formationTitle, school, place, item?.id, index])
      : normalizePercentageMatchScore(item?.match_score),
    raw: item
  }
}

function normalizeAnalysisFormationCandidate(item, index) {
  const title = cleanDetailText(pickStudyTitle(item), 120)
  if (!title) return null

  const summary = cleanDetailText(item?.type || item?.description || item?.summary || 'Piste cohérente avec ton profil', 220)
  const keywords = compactTags([item?.keywords, extractKeywords(`${title} ${summary}`), title]).slice(0, 6)
  const subtitle = cleanDetailText([
    summary,
    keywords.length ? keywords.slice(0, 3).join(' · ') : ''
  ].filter(Boolean).join(' - '), 190)

  return {
    id: `analysis-formation-${aiJobSlug(title, index)}-${index}`,
    rawId: null,
    type: 'formation',
    title,
    subtitle: subtitle || 'Piste de formation à tester',
    source: 'Bilan Zélia',
    sourceTable: 'analysis_formations',
    logoKind: 'formation',
    matchScore: buildStableMatchScore(['analysis-formation', title, summary, index], 68, 92),
    raw: {
      formation_name: title,
      nm: [title],
      summary,
      why: summary,
      keywords,
      schoolTypes: [],
      constraints: [],
      diploma_level: title
    }
  }
}

function getAnalysisFormationCandidates(analysis, limit = AI_FORMATION_DECK_SIZE) {
  const block = getAnalysisBlock(analysis) || {}
  const items = Array.isArray(block.studyRecommendations) ? block.studyRecommendations : []
  const seen = new Set()
  return items
    .map(normalizeAnalysisFormationCandidate)
    .filter(Boolean)
    .filter((candidate) => {
      const key = getCandidateFormationDecisionKey(candidate) || normalizeDiversityText(candidate.title)
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, limit)
}

function normalizeAnalysisJobCandidate(item, index) {
  const title = cleanDetailText(pickJobTitle(item), 90)
  if (!title) return null

  const skills = compactTags([item?.skills, item?.competences, item?.strengths]).slice(0, 5)
  const summary = cleanDetailText(item?.summary || item?.description || item?.why || (skills.length ? skills.join(' · ') : 'Métier cohérent avec ton profil'), 220)
  const constraints = compactTags([item?.constraints, item?.contraintes, item?.watchOut]).slice(0, 4)
  const training = cleanDetailText(item?.training || item?.studies || item?.formation || item?.access || '', 160)
  return {
    id: `analysis-metier-${aiJobSlug(title, index)}-${index}`,
    rawId: null,
    type: 'metier',
    title,
    subtitle: summary || 'Métier proposé selon ton profil',
    source: 'Bilan Zélia',
    sourceTable: 'analysis_metiers',
    logoKind: 'metier',
    matchScore: buildStableMatchScore(['analysis-metier', title, summary, skills.join('|'), index], 68, 92),
    raw: {
      title,
      summary,
      why: summary,
      skills,
      constraints,
      training
    }
  }
}

function getAnalysisJobCandidates(analysis, limit = AI_JOB_DECK_SIZE) {
  const block = getAnalysisBlock(analysis) || {}
  const items = Array.isArray(block.jobRecommendations) ? block.jobRecommendations : []
  const seen = new Set()
  return items
    .map(normalizeAnalysisJobCandidate)
    .filter(Boolean)
    .filter((candidate) => {
      const key = getCandidateJobDecisionKey(candidate)
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, limit)
}

function aiJobSlug(value, index) {
  const slug = normalizeDiversityText(value).replace(/\s+/g, '-')
  return slug || `metier-${index}`
}

function normalizePartnerFormation(item, index) {
  const formationTitle = item?.formation_name || item?.title || 'Formation partenaire'
  const title = item?.school_name || item?.city || formationTitle
  const subtitle = [formationTitle, item?.city, item?.diploma_level]
    .filter(Boolean)
    .join(' - ')
  return {
    id: `partner-${item?.id || index}`,
    rawId: item?.id || null,
    type: 'formation',
    title,
    subtitle: subtitle || formationTitle,
    source: 'Formation partenaire',
    sourceTable: 'ecoles_partenaires',
    logoKind: 'partner',
    matchScore: normalizePercentageMatchScore(item?.match_score),
    partner: true,
    raw: item
  }
}

function cleanDetailText(value, maxLength = 360) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (!text) return ''
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}...` : text
}

function normalizeExternalHref(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw) || /^mailto:/i.test(raw)) return raw
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) return `mailto:${raw}`
  if (/^www\./i.test(raw)) return `https://${raw}`
  return raw.startsWith('/') ? raw : ''
}

function compactTags(values) {
  const seen = new Set()
  return values
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .map((value) => cleanDetailText(value, 70))
    .filter(Boolean)
    .filter((value) => {
      const key = value.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 7)
}

function buildFormationDescription(candidate, raw) {
  const formationTitle = (Array.isArray(raw?.nm) ? raw.nm.find(Boolean) : '') || raw?.nmc || candidate.subtitle || candidate.title
  const school = raw?.etab_nom || candidate.title
  const place = [raw?.commune, raw?.departement].filter(Boolean).join(' - ')
  const cursus = raw?.tc ? ` Cursus : ${raw.tc}.` : ''
  const access = Array.isArray(raw?.tf) && raw.tf.length ? ` Modalités : ${raw.tf.slice(0, 2).join(', ')}.` : ''
  return cleanDetailText(`${formationTitle}${school ? `, proposé par ${school}` : ''}${place ? ` (${place})` : ''}.${cursus}${access}`, 360)
}

function buildCandidateDetail(candidate) {
  const raw = candidate?.raw || {}

  if (candidate?.type === 'metier') {
    if (candidate?.sourceTable === 'gemini_metiers' || candidate?.sourceTable === 'analysis_metiers') {
      return {
        typeLabel: 'Métier',
        title: candidate.title,
        subtitle: cleanDetailText(candidate.subtitle, 140),
        description: cleanDetailText(raw.why || raw.summary || candidate.subtitle, 420),
        tags: compactTags([raw.skills, raw.training, raw.constraints]).slice(0, 7),
        link: '',
        linkLabel: ''
      }
    }

    const link = normalizeExternalHref(raw.contact_urlpostulation || raw.origineoffre_urlorigine)
    return {
      typeLabel: 'Métier',
      title: candidate.title,
      subtitle: cleanDetailText([raw.entreprise_nom, raw.lieutravail_libelle].filter(Boolean).join(' - ') || candidate.subtitle, 140),
      description: cleanDetailText(raw.description || raw.contextetravail_horaires || candidate.subtitle, 420),
      tags: compactTags([
        raw.typecontrat,
        raw.experiencelibelle,
        raw.dureetravaillibelle,
        raw.qualificationlibelle,
        raw.secteuractivitelibelle,
        raw.salaire_commentaire
      ]),
      link,
      linkLabel: raw.contact_urlpostulation ? 'Postuler' : 'Voir l’offre'
    }
  }

  if (candidate?.sourceTable === 'gemini_formations' || candidate?.sourceTable === 'analysis_formations') {
    return {
      typeLabel: 'Formation',
      title: candidate.title,
      subtitle: cleanDetailText(candidate.subtitle, 140),
      description: cleanDetailText(raw.why || raw.summary || candidate.subtitle, 420),
      tags: compactTags([raw.diploma_level, raw.keywords, raw.schoolTypes, raw.constraints]).slice(0, 7),
      link: '',
      linkLabel: ''
    }
  }

  if (candidate?.partner) {
    const link = normalizeExternalHref(raw.link || raw.contact_email)
    return {
      typeLabel: 'Formation partenaire',
      title: raw.formation_name || candidate.subtitle || candidate.title,
      subtitle: cleanDetailText([raw.school_name || candidate.title, raw.city].filter(Boolean).join(' - '), 140),
      description: cleanDetailText(raw.description || candidate.subtitle, 420),
      tags: compactTags([raw.diploma_level, raw.domain, raw.city]),
      link,
      linkLabel: raw.contact_email && link.startsWith('mailto:') ? 'Contacter l’école' : 'Voir la formation'
    }
  }

  const link = normalizeExternalHref(raw.fiche || raw.etab_url || raw.email)
  return {
    typeLabel: 'Formation',
    title: (Array.isArray(raw.nm) ? raw.nm.find(Boolean) : '') || raw.nmc || candidate.subtitle || candidate.title,
    subtitle: cleanDetailText([raw.etab_nom || candidate.title, raw.commune].filter(Boolean).join(' - '), 140),
    description: buildFormationDescription(candidate, raw),
    tags: compactTags([raw.tc, raw.tf, raw.region, raw.departement, raw.annee]),
    link,
    linkLabel: raw.email && link.startsWith('mailto:') ? 'Contacter' : raw.fiche ? 'Voir la fiche' : 'Voir l’établissement'
  }
}

function pickCandidateRawSummary(candidate) {
  const raw = candidate?.raw || {}
  if (candidate?.type === 'metier') {
    if (candidate?.sourceTable === 'gemini_metiers' || candidate?.sourceTable === 'analysis_metiers') {
      return {
        title: raw.title || candidate.title || '',
        summary: raw.summary || '',
        why: raw.why || '',
        skills: Array.isArray(raw.skills) ? raw.skills : [],
        constraints: Array.isArray(raw.constraints) ? raw.constraints : [],
        training: raw.training || ''
      }
    }

    return {
      id: raw.id || candidate.rawId || null,
      intitule: raw.intitule || candidate.title || '',
      romecode: raw.romecode || '',
      lieu: raw.lieutravail_libelle || '',
      secteur: raw.secteuractivitelibelle || ''
    }
  }

  if (candidate?.partner) {
    return {
      id: raw.id || candidate.rawId || null,
      school_name: raw.school_name || '',
      formation_name: raw.formation_name || '',
      diploma_level: raw.diploma_level || '',
      city: raw.city || ''
    }
  }

  if (candidate?.sourceTable === 'gemini_formations' || candidate?.sourceTable === 'analysis_formations') {
    return {
      formation_name: raw.formation_name || candidate.title || '',
      nm: Array.isArray(raw.nm) ? raw.nm : (raw.nm ? [raw.nm] : []),
      summary: raw.summary || '',
      why: raw.why || '',
      keywords: Array.isArray(raw.keywords) ? raw.keywords : [],
      schoolTypes: Array.isArray(raw.schoolTypes) ? raw.schoolTypes : [],
      diploma_level: raw.diploma_level || ''
    }
  }

  return {
    id: raw.id || candidate?.rawId || null,
    nm: Array.isArray(raw.nm) ? raw.nm : (raw.nm ? [raw.nm] : []),
    nmc: raw.nmc || '',
    etab_nom: raw.etab_nom || '',
    commune: raw.commune || '',
    departement: raw.departement || '',
    region: raw.region || '',
    etab_url: raw.etab_url || raw.fiche || '',
    email: raw.email || ''
  }
}

function serializeFinalCandidate(candidate, requestMoreInformation = candidate?.type === 'formation') {
  const display = getCandidateDisplay(candidate)
  const details = buildCandidateDetail(candidate)
  return {
    id: candidate.id,
    rawId: candidate.rawId || null,
    type: candidate.type,
    title: display.title,
    subtitle: display.subtitle,
    source: candidate.source,
    sourceTable: candidate.sourceTable,
    partner: Boolean(candidate.partner),
    requestMoreInformation: candidate.type === 'formation' && requestMoreInformation,
    matchScore: candidate.matchScore || null,
    detail: {
      typeLabel: details.typeLabel,
      title: details.title,
      subtitle: details.subtitle,
      description: details.description,
      tags: details.tags,
      link: details.link,
      linkLabel: details.linkLabel
    },
    raw: pickCandidateRawSummary(candidate)
  }
}

function getCandidateDisplay(candidate) {
  if (candidate?.type !== 'formation') {
    return {
      title: candidate?.title || '',
      subtitle: candidate?.subtitle || ''
    }
  }

  if (candidate?.sourceTable === 'gemini_formations' || candidate?.sourceTable === 'analysis_formations') {
    return {
      title: candidate?.title || '',
      subtitle: candidate?.subtitle || ''
    }
  }

  const raw = candidate.raw || {}
  const rawName = Array.isArray(raw.nm) ? raw.nm.find(Boolean) : ''
  const school = raw.school_name || raw.etab_nom || candidate.title || ''
  const formation = rawName || raw.formation_name || raw.nmc || candidate.subtitle || candidate.title || ''
  const location = [raw.city || raw.commune, raw.diploma_level || raw.departement || raw.region]
    .filter(Boolean)
    .join(' - ')

  return {
    title: cleanDetailText(school, 140),
    subtitle: cleanDetailText([formation, location].filter(Boolean).join(' - '), 180)
  }
}

function formatPersonalityAnalysisText(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (/\n\s*\n/.test(raw)) return raw.replace(/\n{3,}/g, '\n\n')

  const text = raw.replace(/\s+/g, ' ')
  const sentences = text
    .split(/(?<=[.!?])\s+(?=[A-ZÀ-ÖØ-Þ])/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean)

  if (sentences.length <= 2) return text

  const paragraphs = []
  for (let index = 0; index < sentences.length; index += 2) {
    paragraphs.push(sentences.slice(index, index + 2).join(' '))
  }
  return paragraphs.join('\n\n')
}

function candidateKey(candidate) {
  if (candidate?.partner) {
    return `partner-${candidate.raw?.school_name || candidate.title}-${candidate.raw?.formation_name || candidate.subtitle}`.toLowerCase()
  }
  return `${candidate.sourceTable || candidate.type}-${candidate.rawId || candidate.title}-${candidate.subtitle}`.toLowerCase()
}

function normalizeDiversityText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function getCandidateFormationTitle(candidate) {
  const raw = candidate?.raw || {}
  const name = Array.isArray(raw.nm) ? raw.nm.find(Boolean) : ''
  return name || raw.formation_name || raw.nmc || candidate?.title || ''
}

function getCandidateSchoolTitle(candidate) {
  const raw = candidate?.raw || {}
  return raw.school_name || raw.etab_nom || ''
}

function getCandidateRawDecisionKey(candidate) {
  if (!candidate?.rawId) return ''
  return `${candidate.sourceTable || candidate.type}:${candidate.rawId}`
}

function getCandidateFormationDecisionKey(candidate) {
  if (candidate?.type !== 'formation') return ''
  return normalizeDiversityText(getCandidateFormationTitle(candidate))
}

function getCandidateFormationSchoolDecisionKey(candidate) {
  if (candidate?.type !== 'formation') return ''
  const formation = getCandidateFormationDecisionKey(candidate)
  const school = normalizeDiversityText(getCandidateSchoolTitle(candidate))
  return formation && school ? `${formation}|${school}` : ''
}

function getCandidateJobDecisionKey(candidate) {
  if (candidate?.type !== 'metier') return ''
  return normalizeDiversityText(candidate.title || candidate.raw?.intitule || '')
}

function buildDecisionKeySet(candidates = []) {
  const keys = {
    raw: new Set(),
    formation: new Set(),
    formationSchool: new Set(),
    job: new Set()
  }

  candidates.forEach((candidate) => {
    const rawKey = getCandidateRawDecisionKey(candidate)
    const formationKey = getCandidateFormationDecisionKey(candidate)
    const formationSchoolKey = getCandidateFormationSchoolDecisionKey(candidate)
    const jobKey = getCandidateJobDecisionKey(candidate)
    if (rawKey) keys.raw.add(rawKey)
    if (formationKey) keys.formation.add(formationKey)
    if (formationSchoolKey) keys.formationSchool.add(formationSchoolKey)
    if (jobKey) keys.job.add(jobKey)
  })

  return keys
}

function filterRejectedCandidates(candidates = [], rejected = [], protectedCandidates = []) {
  if (!rejected.length) return candidates
  const rejectedKeys = buildDecisionKeySet(rejected)
  const protectedKeys = buildDecisionKeySet(protectedCandidates)

  return candidates.filter((candidate) => {
    const rawKey = getCandidateRawDecisionKey(candidate)
    if (rawKey && rejectedKeys.raw.has(rawKey) && !protectedKeys.raw.has(rawKey)) return false

    if (candidate.type === 'formation') {
      const formationSchoolKey = getCandidateFormationSchoolDecisionKey(candidate)
      if (formationSchoolKey && rejectedKeys.formationSchool.has(formationSchoolKey) && !protectedKeys.formationSchool.has(formationSchoolKey)) return false

      const formationKey = getCandidateFormationDecisionKey(candidate)
      if (formationKey && rejectedKeys.formation.has(formationKey) && !protectedKeys.raw.has(rawKey) && !protectedKeys.formationSchool.has(formationSchoolKey)) return false
    }

    if (candidate.type === 'metier') {
      const jobKey = getCandidateJobDecisionKey(candidate)
      if (jobKey && rejectedKeys.job.has(jobKey) && !protectedKeys.raw.has(rawKey)) return false
    }

    return true
  })
}

function composeFinalCandidates(dbCandidates = [], partnerCandidates = [], intent = 'formations') {
  const mainCandidates = diversifyCandidates(
    dbCandidates.filter(isConcreteFinalCandidate),
    { maxPerFormation: 1, maxPerSchool: 2, maxPerJobTitle: 2 }
  )
  const bonusPartners = diversifyCandidates(
    partnerCandidates.filter((candidate) => candidate?.sourceTable === 'ecoles_partenaires'),
    { maxPerFormation: 2, maxPerSchool: 2, maxPerJobTitle: 2 }
  ).slice(0, MAX_PARTNER_FINAL_RESULTS)

  const baseList = intent === 'both'
    ? balanceCandidatesForIntent(mainCandidates, mainCandidates, intent, Math.ceil(MAX_FINAL_RESULTS / 2), MAX_FINAL_RESULTS)
    : mainCandidates.slice(0, MAX_FINAL_RESULTS)

  if (!bonusPartners.length) return baseList

  const visibleHead = baseList.slice(0, Math.min(5, baseList.length))
  const tail = baseList.slice(visibleHead.length)
  return mergeUniqueCandidates(visibleHead, bonusPartners, tail)
}

function diversifyCandidates(candidates = [], { maxPerFormation = 1, maxPerSchool = 2, maxPerJobTitle = 2 } = {}) {
  const formationCounts = new Map()
  const schoolCounts = new Map()
  const jobCounts = new Map()
  const diversified = []

  for (const candidate of candidates) {
    if (!candidate) continue

    if (candidate.type === 'formation') {
      const formationKey = normalizeDiversityText(getCandidateFormationTitle(candidate))
      const schoolKey = normalizeDiversityText(getCandidateSchoolTitle(candidate))
      const currentFormationCount = formationKey ? formationCounts.get(formationKey) || 0 : 0
      const currentSchoolCount = schoolKey ? schoolCounts.get(schoolKey) || 0 : 0

      if (formationKey && currentFormationCount >= maxPerFormation) continue
      if (schoolKey && currentSchoolCount >= maxPerSchool) continue

      if (formationKey) formationCounts.set(formationKey, currentFormationCount + 1)
      if (schoolKey) schoolCounts.set(schoolKey, currentSchoolCount + 1)
      diversified.push(candidate)
      continue
    }

    if (candidate.type === 'metier') {
      const jobKey = normalizeDiversityText(candidate.title || candidate.raw?.intitule || '')
      const currentJobCount = jobKey ? jobCounts.get(jobKey) || 0 : 0
      if (jobKey && currentJobCount >= maxPerJobTitle) continue
      if (jobKey) jobCounts.set(jobKey, currentJobCount + 1)
      diversified.push(candidate)
      continue
    }

    diversified.push(candidate)
  }

  return diversified
}

function isDatabaseCandidate(candidate) {
  return candidate?.sourceTable === 'formation_france'
}

function isConcreteFinalCandidate(candidate) {
  return isDatabaseCandidate(candidate) || candidate?.sourceTable === 'ecoles_partenaires' || candidate?.sourceTable === 'gemini_metiers' || candidate?.sourceTable === 'analysis_metiers'
}

function getFormationSearchDepartment(department = {}) {
  const name = String(department.name || department.department_name || '').trim()
  if (name && !/^\d/.test(name)) return name
  const city = String(department.city || department.ville || department.commune || '').trim()
  if (city) return city
  return String(department.code || '').trim()
}

function buildCatalogPlanFromCandidate(candidate, index = 0) {
  if (!candidate) return null
  const kind = candidate.type === 'metier' ? 'metier' : 'formation'
  const raw = candidate.raw || {}
  const rawName = Array.isArray(raw.nm) ? raw.nm.find(Boolean) : ''
  const formationQuery = [
    Array.isArray(raw.keywords) ? raw.keywords.join(' ') : '',
    raw.search_query,
    rawName,
    raw.formation_name,
    raw.nmc,
    raw.tc,
    candidate.title
  ]
    .map((value) => cleanDetailText(value, 90))
    .find((value) => value.length >= 3)
  const jobQuery = [raw.intitule, candidate.title, raw.romecode, raw.secteuractivitelibelle]
    .map((value) => cleanDetailText(value, 90))
    .find((value) => value.length >= 3)
  const fallbackQuery = cleanDetailText(`${candidate.title || ''} ${candidate.subtitle || ''}`, 90)
  const query = kind === 'metier'
    ? (jobQuery || fallbackQuery)
    : (formationQuery || fallbackQuery)

  if (!query || query.length < 3) return null

  return {
    kind,
    query,
    title: candidate.title || query,
    reason: `Résultat lié au swipe ${index + 1}`
  }
}

function buildCatalogPlansFromCandidates(candidates = []) {
  return uniquePlans(candidates.map(buildCatalogPlanFromCandidate).filter(Boolean))
}

function mergeUniqueCandidates(...groups) {
  const seen = new Set()
  const merged = []
  for (const group of groups) {
    for (const candidate of group || []) {
      const key = candidateKey(candidate)
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(candidate)
    }
  }
  return merged
}

function balanceCandidatesForIntent(primaryCandidates, fallbackCandidates, intent, perKind = PRESELECTED_CANDIDATES_PER_KIND, maxCount = perKind) {
  const primary = diversifyCandidates(mergeUniqueCandidates(primaryCandidates))
  const fallback = diversifyCandidates(mergeUniqueCandidates(fallbackCandidates))

  if (intent === 'both') {
    const formations = diversifyCandidates(mergeUniqueCandidates(
      primary.filter((candidate) => candidate.type === 'formation'),
      fallback.filter((candidate) => candidate.type === 'formation')
    )).slice(0, perKind)
    const metiers = diversifyCandidates(mergeUniqueCandidates(
      primary.filter((candidate) => candidate.type === 'metier'),
      fallback.filter((candidate) => candidate.type === 'metier')
    )).slice(0, perKind)
    const balanced = []
    for (let index = 0; index < perKind && balanced.length < maxCount; index += 1) {
      if (formations[index]) balanced.push(formations[index])
      if (metiers[index] && balanced.length < maxCount) balanced.push(metiers[index])
    }
    return balanced.length ? balanced : primary.slice(0, maxCount)
  }

  const expectedType = intent === 'metiers' ? 'metier' : 'formation'
  const typed = diversifyCandidates(mergeUniqueCandidates(
    primary.filter((candidate) => candidate.type === expectedType),
    fallback.filter((candidate) => candidate.type === expectedType)
  ))
  return (typed.length ? typed : primary).slice(0, maxCount)
}

function phaseIndex(phase) {
  return [
    'intro',
    'questions',
    'info',
    'analysis',
    'personality',
    'formationReveal',
    'metierReveal',
    'avatarReveal'
  ].indexOf(phase)
}

export default function OrientationFlow() {
  const navigate = useNavigate()
  const dragStartRef = useRef(null)
  const orientationStepTrackingRef = useRef('')
  const [initialProfileIdentity] = useState(() => normalizeProfileIdentity(getStoredJson(PROFILE_IDENTITY_KEY, DEFAULT_PROFILE_IDENTITY)))
  const [phase, setPhase] = useState(() => (Object.keys(getStoredAnswersProgress()).length > 0 ? 'questions' : 'intro'))
  const [questions, setQuestions] = useState([])
  const [questionIndex, setQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState(() => getStoredAnswersProgress())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dragX, setDragX] = useState(0)
  const [avatarUrl, setAvatarUrl] = useState(() => localStorage.getItem('avatar_url') || buildLoreleiUrl({ seed: 'zelia' }))
  const [persona, setPersona] = useState(() => getPersonaBySlug(localStorage.getItem('orientation_persona') || ''))
  const [sharingPersona, setSharingPersona] = useState(false)
  const [mouthAlt, setMouthAlt] = useState(false)
  const [userDepartment, setUserDepartment] = useState(() => getStoredDepartment())
  const [analysisData, setAnalysisData] = useState(null)
  const [intent, setIntent] = useState('')
  const [proposalCandidates, setProposalCandidates] = useState([])
  const [proposalIndex, setProposalIndex] = useState(0)
  const [likedProposals, setLikedProposals] = useState([])
  const [proposalHistory, setProposalHistory] = useState([])
  const [infoIndex, setInfoIndex] = useState(0)
  const [microProfile, setMicroProfile] = useState(() => getStoredJson('orientation_micro_profile', {}))
  const [finalCandidates, setFinalCandidates] = useState([])
  const [checkedIds, setCheckedIds] = useState([])
  const [requestInfoIds, setRequestInfoIds] = useState([])
  const [busyMessage, setBusyMessage] = useState('')
  const [partnerFormations, setPartnerFormations] = useState([])
  const [partnerFormationsLoading, setPartnerFormationsLoading] = useState(false)
  const [submittedFormationIds, setSubmittedFormationIds] = useState(() => new Set())
  const [submittingFormationId, setSubmittingFormationId] = useState(null)
  const [dbFormations, setDbFormations] = useState([])
  const [dbFormationsLoading, setDbFormationsLoading] = useState(false)
  const [requestInfoSelections, setRequestInfoSelections] = useState(() => new Set())
  const [profileIdentity, setProfileIdentity] = useState(initialProfileIdentity)

  const currentQuestion = questions[questionIndex]
  const analysisBlock = useMemo(() => getAnalysisBlock(analysisData), [analysisData])
  const activeMicroSteps = useMemo(() => getMicroStepsForIntent(intent), [intent])
  const visiblePersonality = useMemo(() => {
    if (!analysisBlock) return []
    return [
      analysisBlock.personalityAnalysis ? { label: 'Analyse', value: formatPersonalityAnalysisText(analysisBlock.personalityAnalysis), tone: 'analysis' } : null,
      analysisBlock.skillsAssessment ? { label: 'Forces', value: String(analysisBlock.skillsAssessment), tone: 'forces' } : null
    ].filter(Boolean)
  }, [analysisBlock])

  const jobRecommendations = useMemo(() => getAnalysisJobCandidates(analysisData, 6), [analysisData])
  const formationRecommendations = useMemo(() => getAnalysisFormationCandidates(analysisData, 6), [analysisData])

  useEffect(() => {
    if (phase !== 'formationReveal') return
    let mounted = true
    setPartnerFormationsLoading(true)
    ;(async () => {
      try {
        const [matchedRes, submissionsRes] = await Promise.all([
          ecolesAPI.matched().catch(() => ({ data: { matched: [] } })),
          ecolesAPI.mySubmissions().catch(() => ({ data: { submissions: [] } }))
        ])
        if (!mounted) return
        let matched = Array.isArray(matchedRes?.data?.matched) ? matchedRes.data.matched : []
        if (matched.length === 0) {
          const partnersRes = await ecolesAPI.partenaires().catch(() => ({ data: { formations: [] } }))
          matched = (Array.isArray(partnersRes?.data?.formations) ? partnersRes.data.formations : []).slice(0, 4)
        }
        setPartnerFormations(matched.slice(0, 6))
        const submittedIds = (submissionsRes?.data?.submissions || []).map((entry) => entry.formation_id)
        setSubmittedFormationIds(new Set(submittedIds))
      } catch (fetchError) {
        console.warn('Partner formations fetch failed', fetchError)
        if (mounted) setPartnerFormations([])
      } finally {
        if (mounted) setPartnerFormationsLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [phase])

  const handleRequestInfo = async (formationId) => {
    if (!formationId || submittedFormationIds.has(formationId) || submittingFormationId === formationId) return
    setSubmittingFormationId(formationId)
    try {
      await ecolesAPI.submit(formationId)
      setSubmittedFormationIds((prev) => new Set([...prev, formationId]))
    } catch (submitError) {
      if (submitError?.response?.status === 409) {
        setSubmittedFormationIds((prev) => new Set([...prev, formationId]))
      } else {
        console.warn('Formation info request failed', submitError)
      }
    } finally {
      setSubmittingFormationId(null)
    }
  }

  const hydrateProfileIdentity = useCallback((profile) => {
    const incomingIdentity = normalizeProfileIdentity(profile)
    if (!incomingIdentity.firstName && !incomingIdentity.lastName && !incomingIdentity.gender) return

    setProfileIdentity((current) => {
      const nextIdentity = mergeProfileIdentity(current, incomingIdentity)
      localStorage.setItem(PROFILE_IDENTITY_KEY, JSON.stringify(nextIdentity))
      return nextIdentity
    })
  }, [])

  const zeliaSpeaking = phase === 'analysis'
  const displayedAvatarUrl = useMemo(() => {
    if (!zeliaSpeaking) return avatarUrl
    return modifyDicebearUrl(avatarUrl, { mouth: mouthAlt ? 'happy08' : null })
  }, [avatarUrl, mouthAlt, zeliaSpeaking])

  const progress = useMemo(() => {
    const questionProgress = phase === 'questions' ? questionIndex : QUESTION_LIMIT
    const phaseProgress = Math.max(0, phaseIndex(phase)) * 6
    return Math.min(100, Math.round(((questionProgress + phaseProgress + 1) / (QUESTION_LIMIT + 61)) * 100))
  }, [phase, questionIndex])

  const stepLabel = useMemo(() => {
    if (phase === 'intro') return 'Bienvenue'
    if (phase === 'questions') return `Question ${Math.min(questionIndex + 1, questions.length)} / ${questions.length}`
    if (phase === 'info') return `Étape ${infoIndex + 1} / ${Math.max(activeMicroSteps.length, 1)}`
    if (phase === 'personality') return 'Ton profil'
    if (phase === 'formationReveal') return 'Tes formations'
    if (phase === 'metierReveal') return 'Tes métiers'
    if (phase === 'avatarReveal') return 'Ton avatar'
    return 'Zélia prépare la suite'
  }, [phase, questionIndex, questions.length, infoIndex, activeMicroSteps.length])

  useEffect(() => {
    if (loading || !phase) return

    const orientationStep = {
      intro: 'intro',
      questions: 'questions',
      info: 'micro_profile',
      analysis: 'analysis',
      personality: 'persona',
      formationReveal: 'formations',
      metierReveal: 'metiers',
      avatarReveal: 'avatar'
    }[phase] || phase
    const tracking = {
      orientation_step: orientationStep,
      orientation_step_index: phaseIndex(phase) + 1,
      orientation_total_steps: 8
    }

    if (phase === 'questions') {
      tracking.orientation_step_index = questionIndex + 1
      tracking.orientation_total_steps = questions.length
      tracking.orientation_question_number = questionIndex + 1
      tracking.orientation_question_category = currentQuestion?.category || 'unknown'
    }

    if (phase === 'info') {
      const microStep = activeMicroSteps[infoIndex]
      tracking.orientation_step_index = infoIndex + 1
      tracking.orientation_total_steps = activeMicroSteps.length
      tracking.orientation_micro_step = microStep?.id || 'unknown'
    }

    const trackingKey = [orientationStep, tracking.orientation_step_index, tracking.orientation_micro_step || ''].join(':')
    if (orientationStepTrackingRef.current === trackingKey) return
    orientationStepTrackingRef.current = trackingKey
    trackOrientationEvent('orientation_step_viewed', tracking)
  }, [activeMicroSteps, currentQuestion?.category, infoIndex, loading, phase, questionIndex, questions.length])

  useEffect(() => {
    if (!zeliaSpeaking) return
    const interval = window.setInterval(() => setMouthAlt((value) => !value), 200)
    return () => window.clearInterval(interval)
  }, [zeliaSpeaking])

  const isAuthenticated = useCallback(async () => {
    const token = localStorage.getItem('supabase_auth_token') || localStorage.getItem('token')
    if (!token) return false
    try {
      await orientationAPI.getCurrentUser()
      return true
    } catch {
      localStorage.removeItem('supabase_auth_token')
      localStorage.removeItem('token')
      return false
    }
  }, [])

  const savePersonaToProfile = useCallback(async (personaObj, url) => {
    const avatarData = {
      url,
      provider: 'dicebear/lorelei',
      persona: personaObj?.slug || null,
      personaName: personaObj?.name || null
    }
    await usersAPI.updateProfile({ avatar: url, avatar_json: avatarData }).catch((saveError) => {
      console.warn('Avatar profile save failed', saveError)
    })
  }, [])

  const runInitialAnalysis = useCallback(async (questionsOverride = null, answersOverride = null, microProfileOverride = null) => {
    const sourceQuestions = Array.isArray(questionsOverride) && questionsOverride.length ? questionsOverride : questions
    const sourceAnswers = answersOverride || answers
    const payload = {
      answers: Object.entries(sourceAnswers).map(([qid, answer]) => ({ question_id: Number(qid), answer }))
    }
    localStorage.setItem('answers_cache', JSON.stringify(payload))
    setError('')
    setPhase('analysis')
    setBusyMessage('On te fait ton analyse de personnalité et on trouve des formations et métiers pour toi...')

    if (!(await isAuthenticated())) {
      trackOrientationEvent('orientation_registration_required', {
        orientation_step: 'analysis',
        orientation_action: 'register'
      })
      setBusyMessage('')
      goToAuth('/register')
      return
    }

    trackOrientationEvent('orientation_analysis_started', {
      orientation_step: 'analysis',
      orientation_action: 'generate'
    })

    // Persona + avatar are computed automatically from the answers (no manual picker).
    const { persona: computedPersona, profile: computedPersonaProfile } = computePersonaFromAnswers(sourceQuestions, sourceAnswers)
    const personaAvatarUrl = buildLoreleiUrl(buildPersonaAvatarConfig(computedPersona.slug, profileIdentity.firstName || 'zelia'), 360)
    setPersona(computedPersona)
    setAvatarUrl(personaAvatarUrl)
    localStorage.setItem('avatar_url', personaAvatarUrl)
    localStorage.setItem('orientation_persona', computedPersona.slug)

    try {
      await savePersonaToProfile(computedPersona, personaAvatarUrl)
      const profileResponse = await usersAPI.getProfile().catch(() => null)
      const profileDepartment = profileResponse?.data?.profile?.department || ''
      hydrateProfileIdentity(profileResponse?.data?.profile || {})
      if (profileDepartment) {
        setUserDepartment((current) => ({ code: profileDepartment, name: current.name || profileDepartment }))
      }
      const finalMicroProfile = microProfileOverride || microProfile
      const department = await resolveUserDepartment().catch(() => userDepartment)
      await saveMicroProfile(finalMicroProfile, department).catch(() => null)
      await orientationAPI.submitInitialAnswers(payload.answers)
      await orientationAPI.generateInitialAnalysis({
        orientationProfile: {
          personaSlug: computedPersona.slug,
          personaName: computedPersona.name,
          axes: computedPersonaProfile,
          careerAspiration: buildCareerAspirationSignal(finalMicroProfile)
        }
      })
      const { data } = await orientationAPI.getResults()
      setAnalysisData(data?.results || null)
      localStorage.removeItem('orientation_resume_after_auth')
      trackOrientationEvent('orientation_analysis_completed', {
        orientation_step: 'analysis'
      })
      setPhase('personality')
    } catch (analysisError) {
      console.error('Orientation analysis error', analysisError)
      trackOrientationEvent('orientation_analysis_failed', {
        orientation_step: 'analysis',
        orientation_error_stage: 'generate'
      })
      setError("L'analyse n'a pas pu être générée. Réessaie dans quelques secondes.")
    } finally {
      setBusyMessage('')
    }
  }, [answers, questions, hydrateProfileIdentity, isAuthenticated, savePersonaToProfile, profileIdentity.firstName, microProfile, userDepartment])

  const advanceFromInfo = useCallback(async (questionsOverride = null, profileOverride = null) => {
    setError('')
    if (!(await isAuthenticated())) {
      trackOrientationEvent('orientation_registration_required', {
        orientation_step: 'micro_profile',
        orientation_action: 'register'
      })
      goToAuth('/register')
      return
    }
    await runInitialAnalysis(questionsOverride, null, profileOverride)
  }, [isAuthenticated, runInitialAnalysis])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        const { data } = await orientationAPI.getInitialQuestions(QUESTION_LIMIT)
        if (cancelled) return
        const compactQuestions = Array.isArray(data) ? data.slice(0, QUESTION_LIMIT) : []
        setQuestions(compactQuestions)

        if (localStorage.getItem('orientation_resume_after_auth') === 'analysis') {
          setLoading(false)
          window.setTimeout(() => advanceFromInfo(compactQuestions), 0)
          return
        }

        const firstMissing = compactQuestions.findIndex((question) => !answers[question.id])
        if (firstMissing === -1 && compactQuestions.length) {
          setInfoIndex(0)
          setPhase('info')
          setLoading(false)
          return
        }
        if (firstMissing > 0) {
          setPhase('questions')
          setQuestionIndex(firstMissing)
        }
      } catch (loadError) {
        console.error('Orientation questions load error', loadError)
        if (!cancelled) setError('Impossible de charger le parcours pour le moment.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const persistAnswer = useCallback((questionId, value) => {
    const nextAnswers = { ...answers, [questionId]: value }
    setAnswers(nextAnswers)
    saveAnswersProgress(nextAnswers)
    localStorage.setItem('answers_cache', JSON.stringify({
      answers: Object.entries(nextAnswers).map(([qid, answer]) => ({ question_id: Number(qid), answer }))
    }))
    return nextAnswers
  }, [answers])

  const answerQuestion = useCallback((optionIndex) => {
    if (!currentQuestion) return
    const optionList = getQuestionOptions(currentQuestion)
    const safeIndex = Math.max(0, Math.min(Number(optionIndex) || 0, optionList.length - 1))
    const picked = optionList[safeIndex]
    trackOrientationEvent('orientation_question_answered', {
      orientation_step: 'questions',
      orientation_question_number: questionIndex + 1,
      orientation_question_category: currentQuestion.category || 'unknown',
      orientation_answer_position: safeIndex + 1
    })
    const nextAnswers = persistAnswer(currentQuestion.id, picked.label)
    setDragX(safeIndex === 1 ? 360 : -360)
    window.setTimeout(() => {
      setDragX(0)
      if (questionIndex >= questions.length - 1) {
        setInfoIndex(0)
        setPhase('info')
      } else {
        setQuestionIndex((index) => Math.min(index + 1, questions.length - 1))
      }
    }, 180)
  }, [currentQuestion, persistAnswer, questionIndex, questions])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (phase === 'questions') {
        if (event.key === 'ArrowRight') answerQuestion(1)
        if (event.key === 'ArrowLeft') answerQuestion(0)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [answerQuestion, phase])

  const onPointerDown = (event) => {
    if (phase !== 'questions') return
    dragStartRef.current = { x: event.clientX }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const onPointerMove = (event) => {
    if (!dragStartRef.current) return
    const delta = event.clientX - dragStartRef.current.x
    setDragX(Math.max(-180, Math.min(180, delta)))
  }

  const onPointerUp = () => {
    if (!dragStartRef.current) return
    const delta = dragX
    dragStartRef.current = null
    if (Math.abs(delta) < DRAG_THRESHOLD) {
      setDragX(0)
      return
    }
    if (phase === 'questions') answerQuestion(delta > 0 ? 1 : 0)
  }

  const canGoBack = !loading && !error && (
    (phase === 'questions' && questionIndex > 0) ||
    ['personality', 'info', 'formationReveal', 'metierReveal', 'avatarReveal'].includes(phase)
  )

  const goBack = () => {
    if (phase === 'questions') {
      if (questionIndex > 0) {
        setDragX(0)
        setQuestionIndex((index) => index - 1)
      }
      return
    }
    if (phase === 'info') {
      if (infoIndex > 0) setInfoIndex((index) => index - 1)
      else setPhase('questions')
      return
    }
    if (phase === 'personality') {
      setQuestionIndex(Math.max(0, questions.length - 1))
      setPhase('questions')
      return
    }
    if (phase === 'formationReveal') {
      setPhase('personality')
      return
    }
    if (phase === 'metierReveal') {
      setPhase('formationReveal')
      return
    }
    if (phase === 'avatarReveal') {
      setPhase('metierReveal')
    }
  }

  const sharePersonaProfile = async () => {
    const sharePersona = persona || computePersonaFromAnswers(questions, answers).persona
    if (!sharePersona || sharingPersona) return
    setSharingPersona(true)
    try {
      const dataUrl = await generatePersonaShareCard({
        persona: sharePersona,
        avatarUrl,
        firstName: profileIdentity.firstName
      })
      if (!dataUrl) return
      const blob = await (await fetch(dataUrl)).blob()
      const file = new File([blob], 'mon-portrait-zelia.png', { type: 'image/png' })
      if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Mon portrait Zélia' }).catch(() => null)
      } else {
        const link = document.createElement('a')
        link.href = dataUrl
        link.download = 'mon-portrait-zelia.png'
        link.click()
      }
    } catch (shareError) {
      console.warn('Persona share failed', shareError)
    } finally {
      setSharingPersona(false)
    }
  }

  const shareOrientationLink = async () => {
    if (sharingPersona) return
    setSharingPersona(true)
    try {
      const shareData = {
        title: 'Découvre Zélia',
        text: 'Découvre Zélia pour apprendre à mieux te connaître et y voir plus clair.',
        url: ORIENTATION_SHARE_URL
      }
      if (typeof navigator.share === 'function') {
        await navigator.share(shareData)
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(`${shareData.text}\n${ORIENTATION_SHARE_URL}`)
      } else {
        window.prompt('Copie ce lien pour le partager :', ORIENTATION_SHARE_URL)
      }
    } catch (shareError) {
      if (shareError?.name !== 'AbortError') {
        console.warn('Orientation link share failed', shareError)
      }
    } finally {
      setSharingPersona(false)
    }
  }

  const goToAuth = (path) => {
    localStorage.setItem('orientation_resume_after_auth', 'analysis')
    navigate(`${path}?after=orientation-analysis`)
  }

  const resolveUserDepartment = async () => {
    if (userDepartment?.code || userDepartment?.name) return userDepartment
    const profileResponse = await usersAPI.getProfile().catch(() => null)
    const profile = profileResponse?.data?.profile || {}
    hydrateProfileIdentity(profile)
    const institutionData = profile.institution_data && typeof profile.institution_data === 'object'
      ? profile.institution_data
      : {}
    const nextDepartment = {
      code: profile.department || '',
      name: profile.department_name || institutionData.department_name || profile.department || '',
      city: profile.city || profile.location || institutionData.city || institutionData.ville || institutionData.commune || ''
    }
    if (nextDepartment.code || nextDepartment.name) setUserDepartment(nextDepartment)
    return nextDepartment
  }

  const fetchTableCandidates = async (plans, pageSize = 8, intentValue = intent, searchContext = {}) => {
    const shouldSearchFormations = intentValue === 'formations' || intentValue === 'both'
    const nearHome = searchContext.studyLocation === 'near_home'
    const department = nearHome ? searchContext.department || {} : {}
    const formationDepartment = nearHome ? getFormationSearchDepartment(department) : ''
    const targetLevel = getTargetStudyLevel(searchContext.profile || searchContext)
    const requestCache = new Map()

    const getCachedRequest = (key, requestFactory) => {
      if (!requestCache.has(key)) {
        requestCache.set(key, requestFactory().catch((requestError) => {
          requestCache.delete(key)
          throw requestError
        }))
      }
      return requestCache.get(key)
    }

    const searchFormationQuery = async (formationQuery, requestedPageSize) => {
      const cacheKey = `formation|${formationQuery}|${requestedPageSize}|${formationDepartment}`
      const response = await retryAsync(() => getCachedRequest(cacheKey, () => orientationAPI.searchFormations({
          q: formationQuery,
          page_size: requestedPageSize,
          ...(formationDepartment ? { departement: formationDepartment } : {})
        })), {
        attempts: CATALOG_RETRY_ATTEMPTS,
        label: `Recherche formation "${formationQuery}"`,
        isValidResult: (result) => Array.isArray(result?.data?.items)
      })
      return (response.data?.items || []).map((item, index) => normalizeFormation(item, `${formationQuery}-${index}`))
    }

    const collectFormationCandidates = async (plan) => {
      const query = plan.query || plan.title || ''
      try {
        const maxQueryVariants = searchContext.maxFormationQueryVariants || MAX_FORMATION_QUERY_VARIANTS
        const queries = buildTargetedFormationQueries(query, targetLevel).slice(0, maxQueryVariants)
        const requestedPageSize = targetLevel >= 5 ? Math.max(pageSize, 16) : pageSize
        let formationCandidates = []
        const queryWaves = queries.length > 1
          ? [[queries[0]], queries.slice(1)]
          : [queries]

        for (const queryWave of queryWaves.filter((wave) => wave.length > 0)) {
          const waveResults = await Promise.all(queryWave.map((formationQuery) => searchFormationQuery(formationQuery, requestedPageSize)))
          formationCandidates = mergeUniqueCandidates(formationCandidates, ...waveResults)
          if (!targetLevel || filterCandidatesByTargetStudyLevel(formationCandidates, searchContext.profile || searchContext).length >= pageSize) break
        }

        return filterCandidatesByTargetStudyLevel(formationCandidates, searchContext.profile || searchContext)
      } catch (searchError) {
        console.warn('Formation candidate search failed', query, searchError)
        return []
      }
    }

    const searchTasks = []
    const maxFormationPlans = searchContext.maxFormationPlans || plans.length

    for (const plan of plans) {
      if (shouldSearchFormations && plan.kind !== 'metier') {
        searchTasks.push(() => collectFormationCandidates(plan))
      }
      if (searchTasks.length >= maxFormationPlans) break
    }

    const candidateGroups = await runWithConcurrency(searchTasks, CATALOG_SEARCH_CONCURRENCY, (searchTask) => searchTask())
    return diversifyCandidates(mergeUniqueCandidates(...candidateGroups))
  }

  const resolveCandidatesThroughCatalog = async (candidates, pageSize, intentValue, searchContext = {}) => {
    const plans = buildCatalogPlansFromCandidates(candidates)
      .filter((plan) => {
        if (intentValue === 'both') return true
        if (intentValue === 'metiers') return plan.kind === 'metier'
        return plan.kind === 'formation'
      })
    if (!plans.length) return []
    return fetchTableCandidates(plans, pageSize, intentValue, searchContext)
  }

  const buildDirectFormationSearchPlans = (profile, liked = [], count = FINAL_FORMATION_SEARCH_PLAN_COUNT) => {
    const likedFormations = liked.filter((candidate) => candidate?.type === 'formation')
    const anchorTerms = extractFormationAnchorTerms(likedFormations)
    const directPlans = buildCatalogPlansFromCandidates(likedFormations)
    const anchorPlans = likedFormations.length ? buildFormationAnchorPlans(likedFormations, count) : []
    const analysisPlans = likedFormations.length
      ? []
      : buildAnalysisRecommendationPlans('formations', analysisData, flattenTextParts(profile).join(' '))
    const plans = uniquePlans([...directPlans, ...anchorPlans, ...analysisPlans])
    const scopedPlans = likedFormations.length ? filterFormationPlansByAnchorTerms(plans, anchorTerms) : plans
    return (scopedPlans.length ? scopedPlans : directPlans).slice(0, count)
  }

  const getInitialFormationDeckCandidates = async (profile, department, count = AI_FORMATION_DECK_SIZE) => {
    const analysisCandidates = filterCandidatesByTargetStudyLevel(getAnalysisFormationCandidates(analysisData, count), profile)
    const analysisPlans = buildAnalysisRecommendationPlans('formations', analysisData, flattenTextParts(profile).join(' ')).slice(0, count)
    const genericPlans = buildGenericFormationPlans(getTargetStudyLevel(profile))

    // Progressive broadening: with 127k+ rows in formation_france, the deck
    // must never come back empty. Each wave relaxes one constraint (department
    // scoping, AI keywords, target-level filtering); we stop as soon as enough
    // real database rows are collected.
    const searchWaves = [
      analysisPlans.length ? {
        plans: analysisPlans,
        context: {
          studyLocation: profile.study_location,
          department,
          profile,
          maxFormationPlans: Math.min(analysisPlans.length, count),
          maxFormationQueryVariants: MAX_FORMATION_QUERY_VARIANTS
        }
      } : null,
      analysisPlans.length ? {
        plans: analysisPlans,
        context: {
          profile,
          maxFormationPlans: Math.min(analysisPlans.length, count),
          maxFormationQueryVariants: MAX_FORMATION_QUERY_VARIANTS
        }
      } : null,
      {
        plans: genericPlans,
        context: {
          studyLocation: profile.study_location,
          department,
          profile,
          maxFormationQueryVariants: 1
        }
      },
      {
        // Last resort: generic diploma queries, no department, no level filter.
        plans: genericPlans,
        context: { profile: {}, maxFormationQueryVariants: 1 }
      }
    ].filter(Boolean)

    let catalogCandidates = []
    for (const wave of searchWaves) {
      if (catalogCandidates.length >= count) break
      const waveCandidates = await fetchTableCandidates(wave.plans, count, 'formations', wave.context)
        .catch((catalogError) => {
          console.warn('Formation catalog search wave failed', catalogError)
          return []
        })
      catalogCandidates = mergeUniqueCandidates(catalogCandidates, waveCandidates)
    }

    // Real formation_france rows first: the reveal screen only keeps concrete
    // candidates, and merging analysis tiles first would let them consume the
    // one-per-formation-title diversity slots of the very DB rows they describe.
    return diversifyCandidates(
      mergeUniqueCandidates(catalogCandidates, analysisCandidates),
      { maxPerFormation: 1, maxPerSchool: 2 }
    ).slice(0, count)
  }

  const getFinalFormationSearchPlans = (profile, liked = [], count = AI_FORMATION_KEYWORD_COUNT) => {
    const plans = buildDirectFormationSearchPlans(profile, liked, count)
    if (!plans.length) throw new Error('Aucun mot-clé formation exploitable depuis le bilan et les swipes')
    return plans
  }

  // Real profile <-> formation_france matching: builds search plans from the AI
  // analysis + the user's declared profile (target level, strong subjects,
  // study location, department) and runs them through the search_formations
  // RPC (trigram-scored) to surface concrete formations from the database.
  useEffect(() => {
    if (phase !== 'formationReveal' || !analysisData) return
    let mounted = true
    setDbFormationsLoading(true)
    ;(async () => {
      try {
        const department = await resolveUserDepartment().catch(() => userDepartment)
        const candidates = await getInitialFormationDeckCandidates(microProfile, department, 10)
        if (!mounted) return
        const concrete = candidates.filter(isDatabaseCandidate).slice(0, 8)
        setDbFormations(concrete)
        setRequestInfoSelections(new Set(concrete.map((candidate) => candidate.id)))
      } catch (matchError) {
        console.warn('Formation matching failed', matchError)
        if (mounted) setDbFormations([])
      } finally {
        if (mounted) setDbFormationsLoading(false)
      }
    })()
    return () => { mounted = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, analysisData])

  const toggleRequestInfoSelection = (candidateId) => {
    setRequestInfoSelections((prev) => {
      const next = new Set(prev)
      if (next.has(candidateId)) next.delete(candidateId)
      else next.add(candidateId)
      return next
    })
  }

  const persistOrientationSelection = async (serialized, errorLabel) => {
    if (!serialized.length) return
    const answerText = JSON.stringify(serialized)
    localStorage.setItem('orientation_final_selection', answerText)
    await usersAPI.saveExtraInfo([{
      question_id: 'orientation_final_selection',
      question_text: 'Sélection finale orientation',
      answer_text: answerText
    }]).catch((saveError) => {
      console.warn(`${errorLabel} save failed`, saveError)
    })
  }

  const getSelectedFormations = () => dbFormations.map((candidate) => (
    serializeFinalCandidate(candidate, requestInfoSelections.has(candidate.id))
  ))

  const persistFormationSelection = async () => {
    await persistOrientationSelection(getSelectedFormations(), 'Formation selection')
  }

  const persistMetierSelection = async () => {
    const serialized = [
      ...getSelectedFormations(),
      ...jobRecommendations.map((candidate) => serializeFinalCandidate(candidate, false))
    ]
    await persistOrientationSelection(serialized, 'Orientation selection')
  }

  const continueFromFormationReveal = () => {
    trackOrientationEvent('orientation_step_completed', {
      orientation_step: 'formations',
      orientation_item_count: dbFormations.length || formationRecommendations.length,
      orientation_action: 'discover_jobs'
    })
    persistFormationSelection()
    setPhase('metierReveal')
  }

  const continueFromMetierReveal = async () => {
    await persistMetierSelection()
    trackOrientationEvent('orientation_step_completed', {
      orientation_step: 'metiers',
      orientation_item_count: jobRecommendations.length,
      orientation_action: 'discover_avatar'
    })
    setPhase('avatarReveal')
  }

  const advanceMicroStep = (nextProfile) => {
    const completedStep = activeMicroSteps[infoIndex]
    trackOrientationEvent('orientation_micro_step_completed', {
      orientation_step: 'micro_profile',
      orientation_step_index: infoIndex + 1,
      orientation_total_steps: activeMicroSteps.length,
      orientation_micro_step: completedStep?.id || 'unknown'
    })
    window.setTimeout(() => {
      if (infoIndex >= activeMicroSteps.length - 1) advanceFromInfo(null, nextProfile)
      else setInfoIndex((index) => index + 1)
    }, 200)
  }

  const updateMicroText = (step, value) => {
    const nextProfile = { ...microProfile, [step.id]: value }
    setMicroProfile(nextProfile)
    localStorage.setItem('orientation_micro_profile', JSON.stringify(nextProfile))
  }

  const continueMicroText = (step, clearValue = false) => {
    const nextProfile = { ...microProfile, [step.id]: clearValue ? '' : String(microProfile[step.id] || '').trim() }
    setMicroProfile(nextProfile)
    localStorage.setItem('orientation_micro_profile', JSON.stringify(nextProfile))
    advanceMicroStep(nextProfile)
  }

  const chooseMicroOption = (step, option) => {
    const currentValue = microProfile[step.id]
    if (step.multi && Array.isArray(currentValue) && currentValue.includes(option.value)) {
      const reduced = currentValue.filter((value) => value !== option.value)
      const nextProfile = { ...microProfile, [step.id]: reduced }
      setMicroProfile(nextProfile)
      localStorage.setItem('orientation_micro_profile', JSON.stringify(nextProfile))
      return
    }

    if (step.multi && Array.isArray(currentValue) && currentValue.length >= (step.maxSelections || Infinity)) {
      return
    }

    const nextValue = step.multi
      ? Array.from(new Set([...(Array.isArray(currentValue) ? currentValue : []), option.value]))
      : option.value
    const nextProfile = { ...microProfile, [step.id]: nextValue }
    setMicroProfile(nextProfile)
    localStorage.setItem('orientation_micro_profile', JSON.stringify(nextProfile))

    if (!step.multi) advanceMicroStep(nextProfile)
  }

  const chooseCareerSuggestion = (step, value) => {
    const currentValue = String(microProfile[step.id] || '').trim()
    updateMicroText(step, currentValue === value ? '' : value)
  }

  const saveMicroProfile = async (profile, departmentOverride = userDepartment) => {
    const entries = [
      { question_id: 'orientation_grade_confidence', question_text: 'Moyenne matières fortes', answer_text: profile.grade_confidence || '' },
      { question_id: 'orientation_school_level', question_text: 'Classe actuelle', answer_text: profile.school_level || '' },
      { question_id: 'orientation_target_level', question_text: "Niveau d'études visé", answer_text: profile.target_level || '' },
      { question_id: 'orientation_study_location', question_text: 'Préférence géographique', answer_text: profile.study_location || '' },
      { question_id: 'orientation_department', question_text: 'Département', answer_text: departmentOverride?.code || '' },
      { question_id: 'orientation_department_name', question_text: 'Département nom', answer_text: departmentOverride?.name || '' },
      { question_id: 'orientation_strong_subjects', question_text: 'Matières fortes', answer_text: JSON.stringify(profile.strong_subjects || []) },
      { question_id: 'orientation_career_domains', question_text: 'Domaines professionnels attirants', answer_text: JSON.stringify(profile.career_domains || []) },
      { question_id: 'orientation_career_aspiration', question_text: 'Métier ou domaine qui attire', answer_text: String(profile.career_aspiration || '').trim() }
    ].filter((entry) => entry.answer_text && entry.answer_text !== '[]')
    if (!entries.length) return
    await usersAPI.saveExtraInfo(entries).catch((saveError) => {
      console.warn('Micro profile save failed', saveError)
    })
  }

  const renderAvatarFace = (className = 'message-avatar') => (
    <img src={displayedAvatarUrl} alt="Avatar Zélia" className={className} />
  )

  const renderQuestionCard = () => {
    if (!currentQuestion) return null
    const options = getQuestionOptions(currentQuestion)
    return (
      <div className="orientation-stage">
        <div
          className="orientation-card swipe-card question-card"
          tabIndex={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{ transform: `translateX(${dragX}px) rotate(${dragX / 18}deg)` }}
        >
          <div className={`question-icon-badge tone-${questionIndex % 2}`}>
            <i className={`ph ${getCategoryIcon(currentQuestion.category)}`} aria-hidden="true" />
          </div>
          <span className="orientation-pill">{Math.min(questionIndex + 1, questions.length)} / {questions.length}</span>
          <h1>{cleanQuestionText(currentQuestion.contenu)}</h1>
          {questionIndex === 0 && (
            <div className="question-swipe-tutorial" aria-label="Glisse la carte vers ta réponse, ou touche-la directement">
              <span className="swipe-tutorial-answer reject">
                <i className="ph ph-arrow-left" aria-hidden="true" />
              </span>
              <span className="swipe-tutorial-track" aria-hidden="true">
                <span className="swipe-tutorial-cue" />
              </span>
              <span className="swipe-tutorial-answer accept">
                <i className="ph ph-arrow-right" aria-hidden="true" />
              </span>
            </div>
          )}
        </div>
        <div className="orientation-actions option-actions-stack">
          <button className="option-action reject" onClick={() => answerQuestion(0)} title={options[0].label}>
            <span className="option-letter">A</span>
            <span className="option-label">{options[0].label}</span>
          </button>
          <button className="option-action accept" onClick={() => answerQuestion(1)} title={options[1].label}>
            <span className="option-letter">B</span>
            <span className="option-label">{options[1].label}</span>
          </button>
        </div>
      </div>
    )
  }

  const renderBusy = () => (
    <div className="orientation-stage compact">
      <div className="orientation-card message-card">
        {renderAvatarFace()}
        <div className="busy-dots"><span /><span /><span /></div>
        <h1>{busyMessage || 'Chargement'}</h1>
      </div>
    </div>
  )

  const renderIntro = () => (
    <div className="orientation-stage compact">
      <div className="orientation-card message-card accent-pink">
        {renderAvatarFace()}
        <span className="orientation-pill">Bienvenue</span>
        <h1>Salut, moi c'est Zélia !</h1>
        <p>
          Je vais te poser 20 questions rapides pour mieux te connaître. Ensuite, je te
          révèle ton profil, tes pistes de formation, tes idées de métiers et ton avatar
          personnalisé. Prêt·e ?
        </p>
      </div>
      <button className="primary-action" onClick={() => {
        trackOrientationEvent('orientation_flow_started', {
          orientation_step: 'intro',
          orientation_action: 'start'
        })
        setPhase('questions')
      }}>C'est parti !</button>
    </div>
  )

  const renderPersonality = () => {
    const revealPersona = persona || computePersonaFromAnswers(questions, answers).persona
    return (
      <div className="orientation-stage compact personality-stage">
        <div className="persona-reveal-wrap">
          <PersonaRevealCard
            persona={revealPersona}
            avatarUrl={avatarUrl}
            onShare={sharePersonaProfile}
            sharing={sharingPersona}
            onContinue={() => {
              trackOrientationEvent('orientation_step_completed', {
                orientation_step: 'persona',
                orientation_action: 'discover_studies'
              })
              setPhase('formationReveal')
            }}
            continueLabel="Découvre tes études"
          />
          {visiblePersonality.length > 0 && (
            <details className="personality-details">
              <summary>Voir le détail de mon analyse</summary>
              <div className="recommendation-list">
                {visiblePersonality.map((item) => (
                  <div key={item.label} className={`recommendation-row ${item.tone || ''}`}>
                    <span>{item.label}</span>
                    <strong className="analysis-value">{item.value}</strong>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      </div>
    )
  }

  const renderMicroInfo = () => {
    const step = activeMicroSteps[infoIndex]
    if (!step) return null
    const selected = microProfile[step.id]
    const selectedCareerDomains = Array.isArray(selected) ? selected : []
    return (
      <div className="orientation-stage compact">
        <div className={`orientation-card choice-card${step.type === 'career_aspiration' || step.type === 'career_domains' ? ' career-choice-card' : ''}`}>
          {renderAvatarFace()}
          <span className="orientation-pill">{infoIndex + 1} / {activeMicroSteps.length}</span>
          <h1>{step.title}</h1>
          {step.description && <p>{step.description}</p>}
          {step.type === 'career_domains' ? (
            <>
              <div className="career-domain-grid" aria-label="Domaines professionnels">
                {step.options.map((option) => {
                  const active = selectedCareerDomains.includes(option.value)
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={`career-domain-option${active ? ' active' : ''}`}
                      onClick={() => chooseMicroOption(step, option)}
                      aria-pressed={active}
                    >
                      <i className={`ph ${option.icon}`} aria-hidden="true" />
                      <span>{option.label}</span>
                    </button>
                  )
                })}
              </div>
              <p className="career-selection-hint">{selectedCareerDomains.length}/3 univers sélectionnés</p>
            </>
          ) : step.type === 'career_aspiration' ? (
            <div className="career-aspiration-content">
              <div className="career-suggestion-grid" aria-label="Suggestions de métiers">
                {step.suggestions.map((suggestion) => {
                  const active = selected === suggestion.value
                  return (
                    <button
                      key={suggestion.value}
                      type="button"
                      className={`career-suggestion${active ? ' active' : ''}`}
                      onClick={() => chooseCareerSuggestion(step, suggestion.value)}
                      aria-pressed={active}
                    >
                      {suggestion.label}
                    </button>
                  )
                })}
              </div>
              <label className="micro-text-label career-text-label">
                <span>Ou écris ton idée</span>
                <input
                  type="text"
                  value={selected || ''}
                  onChange={(event) => updateMicroText(step, event.target.value)}
                  placeholder={step.placeholder}
                  maxLength={160}
                  autoComplete="off"
                />
              </label>
            </div>
          ) : step.type === 'text' ? (
            <label className="micro-text-label">
              <span>Ton idée, même si elle n’est pas encore précise</span>
              <input
                type="text"
                value={selected || ''}
                onChange={(event) => updateMicroText(step, event.target.value)}
                placeholder={step.placeholder}
                maxLength={160}
                autoComplete="off"
                autoFocus
              />
            </label>
          ) : (
            <div className="choice-grid">
              {step.options.map((option) => {
                const active = step.multi ? Array.isArray(selected) && selected.includes(option.value) : selected === option.value
                return (
                  <button key={option.value} className={`choice-chip ${active ? 'active' : ''}`} onClick={() => chooseMicroOption(step, option)}>
                    {option.label}
                  </button>
                )
              })}
            </div>
          )}
        </div>
        {(step.type === 'text' || step.type === 'career_aspiration') && (
          <div className="micro-text-actions">
            <button type="button" className="primary-action" onClick={() => continueMicroText(step)}>Continuer</button>
            <button type="button" className="secondary-action" onClick={() => continueMicroText(step, true)}>Je ne sais pas encore</button>
          </div>
        )}
        {step.multi && (
          <button className="primary-action" onClick={() => advanceMicroStep({ ...microProfile })}>Continuer</button>
        )}
      </div>
    )
  }

  const renderFormationReveal = () => (
    <div className="orientation-stage compact personality-stage">
      <div className="persona-reveal-wrap">
        <div className="persona-card">
          <div className="persona-card-head">
            <div>
              <span className="persona-kicker">Analyse formation</span>
              <h1 className="persona-name">Les formations qui matchent ton profil</h1>
            </div>
            {renderAvatarFace('persona-avatar')}
          </div>
          <p className="persona-tagline">
            {dbFormationsLoading
              ? 'On cherche parmi 127 498 formations celles qui collent vraiment à ton profil...'
              : dbFormations.length
                ? "Sélectionnées à partir de tes réponses, ton niveau visé et ta localisation. Coche celles pour lesquelles tu veux plus d'infos."
                : "On n'a pas trouvé de correspondance exacte tout de suite, mais voilà des pistes cohérentes avec ton profil."}
          </p>

          {dbFormationsLoading && (
            <div className="busy-dots" aria-hidden="true"><span /><span /><span /></div>
          )}

          {!dbFormationsLoading && dbFormations.length > 0 && (
            <div className="formation-lead-grid">
              {dbFormations.map((formation) => {
                const raw = formation.raw || {}
                const formationName = getCandidateFormationTitle(formation)
                const school = raw.etab_nom || ''
                const city = raw.commune || raw.departement || ''
                const level = raw.tc || ''
                const checked = requestInfoSelections.has(formation.id)
                return (
                  <div key={formation.id} className="formation-lead-card">
                    <div className="formation-lead-head">
                      <strong>{cleanDetailText(formationName, 220)}</strong>
                      {formation.matchScore != null && (
                        <span className="formation-lead-score">{formation.matchScore}%</span>
                      )}
                    </div>
                    {school && <p className="formation-lead-subtitle">{cleanDetailText(school, 80)}</p>}
                    <div className="formation-lead-meta">
                      {level && <span className="formation-lead-chip">{cleanDetailText(level, 30)}</span>}
                      {city && <span className="formation-lead-chip"><i className="ph ph-map-pin" aria-hidden="true" />{cleanDetailText(city, 30)}</span>}
                    </div>
                    <label className={`formation-lead-check${checked ? ' is-checked' : ''}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleRequestInfoSelection(formation.id)}
                      />
                      <i className={`ph ${checked ? 'ph-check-square' : 'ph-square'}`} aria-hidden="true" />
                      Je veux plus d'infos
                    </label>
                  </div>
                )
              })}
            </div>
          )}

          {!dbFormationsLoading && dbFormations.length === 0 && formationRecommendations.length > 0 && (
            <div className="persona-portrait-grid">
              {formationRecommendations.map((formation) => (
                <div key={formation.id} className="persona-portrait-tile">
                  <small>Formation</small>
                  <i className="ph ph-graduation-cap persona-portrait-emoji" aria-hidden="true" />
                  <strong>{formation.title}</strong>
                </div>
              ))}
            </div>
          )}

          {!dbFormationsLoading && (
            <div className={`formation-lead-empty${dbFormations.length > 0 || formationRecommendations.length > 0 ? ' is-followup' : ''}`}>
              <p className="formation-lead-empty-text">
                {dbFormations.length > 0 || formationRecommendations.length > 0
                  ? "Aucune de ces formations ne te convient ?"
                  : "Aucune formation ne correspond exactement à ton profil pour le moment."}
              </p>
              <button
                type="button"
                className="formation-lead-empty-cta"
                onClick={() => window.open('/formations', '_blank', 'noopener,noreferrer')}
              >
                <i className="ph ph-magnifying-glass" aria-hidden="true" />
                Voir d'autres formations
              </button>
            </div>
          )}
        </div>

        {(partnerFormationsLoading || partnerFormations.length > 0) && (
          <div className="persona-card">
            <div className="persona-card-head">
              <div>
                <span className="persona-kicker">Écoles partenaires</span>
                <h2 className="persona-name persona-name-secondary">Elles peuvent te recontacter directement</h2>
              </div>
            </div>
            <p className="persona-tagline">
              {partnerFormations.length
                ? "Ces écoles partenaires proposent des formations proches de ton profil. Demande plus d'infos en un clic."
                : 'On regarde ce que nos écoles partenaires proposent pour toi...'}
            </p>

            {partnerFormationsLoading && (
              <div className="busy-dots" aria-hidden="true"><span /><span /><span /></div>
            )}

            {!partnerFormationsLoading && partnerFormations.length > 0 && (
              <div className="formation-lead-grid">
                {partnerFormations.map((formation) => {
                  const isSubmitted = submittedFormationIds.has(formation.id)
                  const isSubmitting = submittingFormationId === formation.id
                  return (
                    <div key={formation.id} className="formation-lead-card">
                      <div className="formation-lead-head">
                        <strong>{formation.formation_name}</strong>
                        {formation.match_score != null && (
                          <span className="formation-lead-score">{formation.match_score}%</span>
                        )}
                      </div>
                      <p className="formation-lead-subtitle">{formation.school_name}</p>
                      <div className="formation-lead-meta">
                        {formation.diploma_level && <span className="formation-lead-chip">{formation.diploma_level}</span>}
                        {formation.city && <span className="formation-lead-chip"><i className="ph ph-map-pin" aria-hidden="true" />{formation.city}</span>}
                      </div>
                      <button
                        type="button"
                        className={`formation-lead-cta${isSubmitted ? ' is-submitted' : ''}`}
                        onClick={() => handleRequestInfo(formation.id)}
                        disabled={isSubmitted || isSubmitting}
                      >
                        {isSubmitted ? (
                          <><i className="ph ph-check-circle" aria-hidden="true" /> Demande envoyée</>
                        ) : isSubmitting ? (
                          'Envoi...'
                        ) : (
                          <><i className="ph ph-paper-plane-tilt" aria-hidden="true" /> Demande d'infos</>
                        )}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        <div className="persona-actions persona-actions-standalone">
          <button type="button" className="persona-continue" onClick={continueFromFormationReveal}>Découvre tes métiers</button>
        </div>
      </div>
    </div>
  )


  const renderMetierReveal = () => (
    <div className="orientation-stage compact personality-stage">
      <div className="persona-reveal-wrap">
        <div className="persona-card">
          <div className="persona-card-head">
            <div>
              <span className="persona-kicker">Analyse métier</span>
              <h1 className="persona-name">Des métiers qui pourraient te plaire</h1>
            </div>
            {renderAvatarFace('persona-avatar')}
          </div>
          <p className="persona-tagline">
            {jobRecommendations.length
              ? "Voilà quelques métiers cohérents avec ton profil."
              : "On n'a pas encore assez d'infos pour te proposer des métiers précis, tu pourras les découvrir plus tard dans ton espace."}
          </p>
          {jobRecommendations.length > 0 && (
            <div className="persona-portrait-grid">
              {jobRecommendations.map((job) => (
                <div key={job.id} className="persona-portrait-tile">
                  <small>Métier</small>
                  <i className="ph ph-briefcase persona-portrait-emoji" aria-hidden="true" />
                  <strong>{job.title}</strong>
                </div>
              ))}
            </div>
          )}
          <div className="persona-actions">
            <button type="button" className="persona-continue" onClick={continueFromMetierReveal}>On continue !</button>
          </div>
        </div>
      </div>
    </div>
  )

  const renderAvatarReveal = () => {
    const revealPersona = persona || computePersonaFromAnswers(questions, answers).persona
    return (
      <div className="orientation-stage compact personality-stage">
        <div className="persona-reveal-wrap">
          <div className="persona-card">
            <div className="persona-card-head">
              <div>
                <span className="persona-kicker">Ton avatar</span>
                <h1 className="persona-name">Te voilà, {revealPersona?.name || 'toi'} !</h1>
              </div>
            </div>
            <div className="avatar-reveal-showcase">
              <img src={avatarUrl} alt="Ton avatar" className="avatar-reveal-image" />
            </div>
            <p className="persona-tagline">Voilà tu as fini la première étape, la découverte de soi. Bravo ! Continue d'explorer l'app et apprends à te connaître en appuyant sur "Découvrir l'app".</p>
            <p className="persona-tagline">Tu peux aussi partager Zélia à tes potes avec le lien, pour les aider à y voir plus clair.</p>
            <div className="persona-actions">
              <button type="button" className="persona-icon-btn" onClick={shareOrientationLink} disabled={sharingPersona} aria-label="Partager le lien Zélia" title="Partager le lien Zélia">
                <i className="ph ph-share-network" aria-hidden="true" />
              </button>
              <button type="button" className="persona-continue" onClick={() => {
                trackOrientationEvent('orientation_flow_completed', {
                  orientation_step: 'avatar',
                  orientation_action: 'open_app'
                })
                navigate('/app')
              }}>Découvrir l'app</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const renderPhase = () => {
    if (loading) return renderBusy()
    if (error) {
      return (
        <div className="orientation-stage compact">
          <div className="orientation-card message-card">
            {renderAvatarFace()}
            <h1>{error}</h1>
          </div>
        </div>
      )
    }
    if (phase === 'intro') return renderIntro()
    if (phase === 'questions') return renderQuestionCard()
    if (phase === 'analysis') return renderBusy()
    if (phase === 'personality') return renderPersonality()
    if (phase === 'info') return renderMicroInfo()
    if (phase === 'formationReveal') return renderFormationReveal()
    if (phase === 'metierReveal') return renderMetierReveal()
    if (phase === 'avatarReveal') return renderAvatarReveal()
    return null
  }

  return (
    <main className="orientation-flow">
      <header className="orientation-topbar">
        <div className="topbar-row">
          <div className="topbar-lead">
            {canGoBack && (
              <button
                type="button"
                className="back-button"
                onClick={goBack}
                aria-label="Revenir en arrière"
                title="Revenir en arrière"
              >
                <i className="ph ph-arrow-left" aria-hidden="true" />
              </button>
            )}
            <img src="/static/images/logo-dark.png" alt="Zélia" />
          </div>
          <span className="flow-step-label">{stepLabel}</span>
        </div>
        <div className="flow-progress"><span style={{ width: `${progress}%` }} /></div>
      </header>
      {renderPhase()}
    </main>
  )
}

