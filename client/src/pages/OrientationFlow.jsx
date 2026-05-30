import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { orientationAPI, usersAPI } from '../lib/api.js'
import { AI_FINAL_JOB_COUNT, AI_JOB_DECK_SIZE } from '../lib/orientationJobs.js'
import './OrientationFlow.css'

const QUESTION_LIMIT = 40
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
const FORMATION_SEARCH_WAITING_MESSAGE = 'Ne quitte pas la page, on cherche parmi 35 000 formations rien que pour toi ;)'
const CATALOG_SEARCH_CONCURRENCY = 4
const MAX_FORMATION_QUERY_VARIANTS = 2
const FINAL_FORMATION_SEARCH_PLAN_COUNT = 4
const FINAL_FORMATION_PAGE_SIZE = 10
const PROFILE_IDENTITY_KEY = 'orientation_profile_identity'
const PROFILE_IDENTITY_COMPLETE_KEY = 'orientation_profile_identity_complete'
const PROFILE_IDENTITY_COMPLETED_INTENTS_KEY = 'orientation_profile_identity_completed_intents'
const DEFAULT_PROFILE_IDENTITY = { firstName: '', lastName: '', gender: '' }
const GENDER_OPTIONS = ['Femme', 'Homme', 'Non-binaire', 'Autre', 'Préfère ne pas répondre']
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

const BG_COLORS = ['#F2F4F7', '#E3F2FD', '#FFF7E6', '#FDE7E9', '#EAF7F0', '#F3E8FF', '#FFFFFF']
const SKIN_TONES = ['#f9d7b8', '#f1c89e', '#d9a275', '#c68642', '#8d5524', '#6d3b1f']
const HAIR_COLORS = ['#2f2f2f', '#3b2c2a', '#6b4423', '#a55728', '#b58143', '#e6c28b']

const MICRO_STEPS = [
  {
    id: 'budget',
    title: 'Budgetise tes études',
    options: [
      { label: '0 - 2k/an', value: '0-2000' },
      { label: '2k - 8k/an', value: '2000-8000' },
      { label: '8k+/an', value: '8000+' },
      { label: 'Je ne sais pas', value: 'unknown' }
    ]
  },
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
  }
]

const LOCATION_STEP_ID = 'study_location'

function getMicroStepsForIntent(intent) {
  if (intent === 'metiers') {
    const locationStep = MICRO_STEPS.find((step) => step.id === LOCATION_STEP_ID)
    return locationStep
      ? [{ ...locationStep, title: 'Pour chercher des métiers, tu préfères...' }]
      : []
  }
  return MICRO_STEPS
}

function sanitizeMicroProfileForIntent(profile, intent) {
  if (!profile || typeof profile !== 'object') return {}
  const allowedIds = new Set(getMicroStepsForIntent(intent).map((step) => step.id))
  return Object.fromEntries(Object.entries(profile).filter(([key]) => allowedIds.has(key)))
}

const INTENT_OPTIONS = [
  { value: 'formations', title: 'Une école / formation qui te convient', icon: 'ph-graduation-cap' },
  { value: 'metiers', title: 'Un métier qui te convient', icon: 'ph-briefcase' },
  { value: 'both', title: 'Les deux', icon: 'ph-sparkle' }
]

function randomChoice(items) {
  return items[Math.floor(Math.random() * items.length)]
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

function hexNoHash(hex) {
  return (hex || '').replace('#', '')
}

function buildLoreleiUrl(config, size = 360) {
  const query = new URLSearchParams()
  query.set('seed', config.seed || 'zelia')
  query.set('size', String(size))
  query.set('radius', String(config.radius ?? 30))
  if (config.bg) {
    query.set('backgroundType', 'solid')
    query.set('backgroundColor', hexNoHash(config.bg))
  }
  if (config.skin) query.set('skinColor', hexNoHash(config.skin))
  if (config.hair) query.set('hairColor', hexNoHash(config.hair))
  query.set('accessoriesProbability', config.glasses ? '100' : '0')
  if (config.glasses) query.set('accessories', 'glasses')
  return `https://api.dicebear.com/9.x/lorelei/svg?${query.toString()}`
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

function randomAvatarConfig() {
  return {
    seed: Math.random().toString(36).slice(2, 10),
    bg: randomChoice(BG_COLORS),
    skin: randomChoice(SKIN_TONES),
    hair: randomChoice(HAIR_COLORS),
    glasses: Math.random() > 0.62,
    radius: 30
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

function isProfileIdentityComplete(value = {}) {
  const identity = normalizeProfileIdentity(value)
  return Boolean(identity.firstName && identity.lastName && identity.gender)
}

function getCompletedProfileIdentityIntents() {
  const stored = getStoredJson(PROFILE_IDENTITY_COMPLETED_INTENTS_KEY, [])
  return new Set(Array.isArray(stored) ? stored.filter(Boolean) : [])
}

function hasCompletedProfileIdentityForIntent(intentValue) {
  const completed = getCompletedProfileIdentityIntents()
  return completed.has(intentValue) || completed.has('both')
}

function markProfileIdentityCompleteForIntent(intentValue) {
  const completed = getCompletedProfileIdentityIntents()
  if (intentValue) completed.add(intentValue)
  if (intentValue === 'both') {
    completed.add('formations')
    completed.add('metiers')
  }
  localStorage.setItem(PROFILE_IDENTITY_COMPLETED_INTENTS_KEY, JSON.stringify([...completed]))
}

function getProfileIdentityNote(intentValue) {
  if (intentValue === 'metiers') {
    return "Ces infos servent à enregistrer ton parcours métier. Le genre ajuste seulement la formulation, jamais les propositions."
  }

  if (intentValue === 'both') {
    return 'Ces infos servent à enregistrer ton parcours. Le genre ajuste seulement la formulation, jamais les propositions.'
  }

  return 'Ces infos servent à enregistrer ton parcours formation. Le genre ajuste seulement la formulation, jamais les propositions.'
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
    'questions',
    'avatar',
    'analysis',
    'personality',
    'intent',
    'info',
    'profileIdentity',
    'proposalSearch',
    'proposals',
    'finalSearch',
    'final',
    'confirmed'
  ].indexOf(phase)
}

export default function OrientationFlow() {
  const navigate = useNavigate()
  const dragStartRef = useRef(null)
  const [initialProfileIdentity] = useState(() => normalizeProfileIdentity(getStoredJson(PROFILE_IDENTITY_KEY, DEFAULT_PROFILE_IDENTITY)))
  const [phase, setPhase] = useState('questions')
  const [questions, setQuestions] = useState([])
  const [questionIndex, setQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState(() => getStoredAnswersProgress())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dragX, setDragX] = useState(0)
  const [avatarConfig, setAvatarConfig] = useState(() => getStoredJson('avatar_cfg', randomAvatarConfig()))
  const [avatarUrl, setAvatarUrl] = useState(() => localStorage.getItem('avatar_url') || buildLoreleiUrl(avatarConfig))
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
  const [profileIdentity, setProfileIdentity] = useState(initialProfileIdentity)
  const [profileIdentityComplete, setProfileIdentityComplete] = useState(() => (
    localStorage.getItem(PROFILE_IDENTITY_COMPLETE_KEY) === 'true' && isProfileIdentityComplete(initialProfileIdentity)
  ))
  const profileIdentityCompleteRef = useRef(profileIdentityComplete)
  const [profileIdentitySaving, setProfileIdentitySaving] = useState(false)
  const [profileIdentityError, setProfileIdentityError] = useState('')

  const currentQuestion = questions[questionIndex]
  const currentProposal = proposalCandidates[proposalIndex]
  const analysisBlock = useMemo(() => getAnalysisBlock(analysisData), [analysisData])
  const activeMicroSteps = useMemo(() => getMicroStepsForIntent(intent), [intent])
  const visiblePersonality = useMemo(() => {
    if (!analysisBlock) return []
    return [
      analysisBlock.personalityAnalysis ? { label: 'Analyse', value: formatPersonalityAnalysisText(analysisBlock.personalityAnalysis), tone: 'analysis' } : null,
      analysisBlock.skillsAssessment ? { label: 'Forces', value: String(analysisBlock.skillsAssessment), tone: 'forces' } : null
    ].filter(Boolean)
  }, [analysisBlock])

  const hydrateProfileIdentity = useCallback((profile) => {
    const incomingIdentity = normalizeProfileIdentity(profile)
    if (!incomingIdentity.firstName && !incomingIdentity.lastName && !incomingIdentity.gender) return

    setProfileIdentity((current) => {
      const nextIdentity = mergeProfileIdentity(current, incomingIdentity)
      localStorage.setItem(PROFILE_IDENTITY_KEY, JSON.stringify(nextIdentity))
      if (isProfileIdentityComplete(nextIdentity)) {
        profileIdentityCompleteRef.current = true
        setProfileIdentityComplete(true)
        localStorage.setItem(PROFILE_IDENTITY_COMPLETE_KEY, 'true')
      }
      return nextIdentity
    })
  }, [])

  const zeliaSpeaking = phase === 'analysis' || phase === 'proposalSearch' || phase === 'finalSearch'
  const displayedAvatarUrl = useMemo(() => {
    if (!zeliaSpeaking) return avatarUrl
    return modifyDicebearUrl(avatarUrl, { mouth: mouthAlt ? 'happy08' : null })
  }, [avatarUrl, mouthAlt, zeliaSpeaking])

  const progress = useMemo(() => {
    const questionProgress = phase === 'questions' ? questionIndex : QUESTION_LIMIT
    const phaseProgress = Math.max(0, phaseIndex(phase)) * 6
    return Math.min(100, Math.round(((questionProgress + phaseProgress + 1) / (QUESTION_LIMIT + 72)) * 100))
  }, [phase, questionIndex])

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

  const saveAvatarToProfile = useCallback(async () => {
    const avatarData = { ...avatarConfig, url: avatarUrl, provider: 'dicebear/lorelei' }
    await usersAPI.updateProfile({ avatar: avatarUrl, avatar_json: avatarData }).catch((saveError) => {
      console.warn('Avatar profile save failed', saveError)
    })
  }, [avatarConfig, avatarUrl])

  const runInitialAnalysis = useCallback(async () => {
    const payload = {
      answers: Object.entries(answers).map(([qid, answer]) => ({ question_id: Number(qid), answer }))
    }
    localStorage.setItem('answers_cache', JSON.stringify(payload))
    setError('')
    setPhase('analysis')
    setBusyMessage('Zélia analyse ta personnalité')

    if (!(await isAuthenticated())) {
      setBusyMessage('')
      goToAuth('/register')
      return
    }

    try {
      await saveAvatarToProfile()
      const profileResponse = await usersAPI.getProfile().catch(() => null)
      const profileDepartment = profileResponse?.data?.profile?.department || ''
      hydrateProfileIdentity(profileResponse?.data?.profile || {})
      if (profileDepartment) {
        setUserDepartment((current) => ({ code: profileDepartment, name: current.name || profileDepartment }))
      }
      await orientationAPI.submitInitialAnswers(payload.answers)
      await orientationAPI.generateInitialAnalysis()
      const { data } = await orientationAPI.getResults()
      setAnalysisData(data?.results || null)
      localStorage.removeItem('orientation_resume_after_auth')
      setPhase('personality')
    } catch (analysisError) {
      console.error('Orientation analysis error', analysisError)
      setError("L'analyse n'a pas pu être générée. Réessaie dans quelques secondes.")
    } finally {
      setBusyMessage('')
    }
  }, [answers, hydrateProfileIdentity, isAuthenticated, saveAvatarToProfile])

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
          window.setTimeout(() => runInitialAnalysis(), 0)
          return
        }

        const firstMissing = compactQuestions.findIndex((question) => !answers[question.id])
        if (firstMissing === -1 && compactQuestions.length) {
          setPhase('avatar')
          return
        }
        setQuestionIndex(firstMissing === -1 ? Math.max(0, compactQuestions.length - 1) : firstMissing)
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

  const answerQuestion = useCallback((value) => {
    if (!currentQuestion) return
    persistAnswer(currentQuestion.id, value)
    setDragX(value === 'Oui' ? 360 : -360)
    window.setTimeout(() => {
      setDragX(0)
      if (questionIndex >= questions.length - 1) setPhase('avatar')
      else setQuestionIndex((index) => Math.min(index + 1, questions.length - 1))
    }, 180)
  }, [currentQuestion, persistAnswer, questionIndex, questions.length])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (phase === 'questions') {
        if (event.key === 'ArrowRight') answerQuestion('Oui')
        if (event.key === 'ArrowLeft') answerQuestion('Non')
      }
      if (phase === 'proposals') {
        if (event.key === 'ArrowRight') swipeProposal(true)
        if (event.key === 'ArrowLeft') swipeProposal(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [answerQuestion, phase, currentProposal, likedProposals, proposalHistory, proposalIndex])

  const onPointerDown = (event) => {
    if (phase !== 'questions' && phase !== 'proposals') return
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
    if (phase === 'questions') answerQuestion(delta > 0 ? 'Oui' : 'Non')
    if (phase === 'proposals') swipeProposal(delta > 0)
  }

  const randomizeAvatar = () => {
    const nextConfig = randomAvatarConfig()
    const nextUrl = buildLoreleiUrl(nextConfig, 256)
    setAvatarConfig(nextConfig)
    setAvatarUrl(nextUrl)
    localStorage.setItem('avatar_cfg', JSON.stringify(nextConfig))
    localStorage.setItem('avatar_url', nextUrl)
  }

  const validateAvatarAndContinue = () => {
    localStorage.setItem('avatar_cfg', JSON.stringify(avatarConfig))
    localStorage.setItem('avatar_url', avatarUrl)
    runInitialAnalysis()
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
    const catalogCandidates = analysisPlans.length
      ? await fetchTableCandidates(analysisPlans, count, 'formations', {
        studyLocation: profile.study_location,
        department,
        profile,
        maxFormationPlans: Math.min(analysisPlans.length, count),
        maxFormationQueryVariants: 1
      }).catch((catalogError) => {
        console.warn('Initial formation catalog search failed', catalogError)
        return []
      })
      : []

    return diversifyCandidates(
      filterCandidatesByTargetStudyLevel(mergeUniqueCandidates(analysisCandidates, catalogCandidates), profile),
      { maxPerFormation: 1, maxPerSchool: 2 }
    ).slice(0, count)
  }

  const getInitialJobDeckCandidates = (count = AI_JOB_DECK_SIZE) => getAnalysisJobCandidates(analysisData, count)

  const getFinalFormationSearchPlans = (profile, liked = [], count = AI_FORMATION_KEYWORD_COUNT) => {
    const plans = buildDirectFormationSearchPlans(profile, liked, count)
    if (!plans.length) throw new Error('Aucun mot-clé formation exploitable depuis le bilan et les swipes')
    return plans
  }

  const getFinalJobCandidates = (profile, liked = [], rejected = [], count = AI_FINAL_JOB_COUNT) => {
    const likedJobs = liked.filter((candidate) => candidate?.type === 'metier')
    const rejectedJobs = rejected.filter((candidate) => candidate?.type === 'metier')
    const analysisJobs = getAnalysisJobCandidates(analysisData, count * 2)
    return diversifyCandidates(filterRejectedCandidates(
      mergeUniqueCandidates(likedJobs, analysisJobs),
      rejectedJobs,
      likedJobs
    ), { maxPerJobTitle: 1 }).slice(0, count)
  }

  const beginContextQuestions = (nextIntent) => {
    const nextProfile = sanitizeMicroProfileForIntent(microProfile, nextIntent)
    setIntent(nextIntent)
    setMicroProfile(nextProfile)
    localStorage.setItem('orientation_micro_profile', JSON.stringify(nextProfile))
    setInfoIndex(0)
    setError('')
    setPhase('info')
  }

  const startProposalDeck = async (profileOverride = microProfile, intentOverride = intent) => {
    const nextIntent = intentOverride || intent
    const profile = sanitizeMicroProfileForIntent({ ...microProfile, ...(profileOverride || {}) }, nextIntent)
    if (!nextIntent) {
      setPhase('intent')
      return
    }

    setIntent(nextIntent)
    setMicroProfile(profile)
    localStorage.setItem('orientation_micro_profile', JSON.stringify(profile))
    setError('')
    setProfileIdentityError('')
    const shouldCollectIdentity = !profileIdentityCompleteRef.current || !hasCompletedProfileIdentityForIntent(nextIntent)
    if (shouldCollectIdentity) {
      setBusyMessage('')
      setPhase('profileIdentity')
      return
    }

    setPhase('proposalSearch')
    setBusyMessage(nextIntent === 'metiers' ? 'Zélia prépare tes métiers à swiper' : FORMATION_SEARCH_WAITING_MESSAGE)
    try {
      const department = nextIntent === 'metiers'
        ? (userDepartment || {})
        : await resolveUserDepartment()
      const savePromise = saveMicroProfile(profile, department)
      if (nextIntent !== 'metiers') await savePromise
      let deck = []

      if (nextIntent === 'metiers') {
        deck = getInitialJobDeckCandidates(AI_JOB_DECK_SIZE)
      } else if (nextIntent === 'formations') {
        deck = await getInitialFormationDeckCandidates(profile, department, AI_FORMATION_DECK_SIZE)
      } else {
        const [formationDeck, jobDeck] = await Promise.all([
          getInitialFormationDeckCandidates(profile, department, PRESELECTED_CANDIDATES_PER_KIND + 1),
          Promise.resolve(getInitialJobDeckCandidates(PRESELECTED_CANDIDATES_PER_KIND + 1))
        ])
        deck = balanceCandidatesForIntent(
          mergeUniqueCandidates(formationDeck, jobDeck),
          mergeUniqueCandidates(formationDeck, jobDeck),
          nextIntent,
          PRESELECTED_CANDIDATES_PER_KIND + 1,
          (PRESELECTED_CANDIDATES_PER_KIND + 1) * 2
        )
      }
      deck = nextIntent === 'metiers'
        ? deck.slice(0, AI_JOB_DECK_SIZE)
        : nextIntent === 'formations'
          ? deck.slice(0, AI_FORMATION_DECK_SIZE)
          : deck.slice(0, MAX_PROPOSAL_DECK)
      deck = filterCandidatesByTargetStudyLevel(deck, profile)
      if (!deck.length) {
        if (nextIntent === 'metiers') {
          throw new Error('Aucune proposition métiers exploitable depuis le bilan')
        }
        if (nextIntent === 'formations' || nextIntent === 'both') {
          throw new Error('Aucune proposition formations exploitable depuis le bilan après vérification du niveau visé')
        }
      }
      setProposalCandidates(deck)
      setProposalIndex(0)
      setLikedProposals([])
      setProposalHistory([])
      setPhase('proposals')
      if (nextIntent === 'metiers') savePromise.catch(() => null)
    } catch (proposalError) {
      console.error('Proposal deck error', proposalError)
      setProposalCandidates([])
      setError("Je n'ai pas pu préparer une liste fiable à partir de ton bilan.")
    } finally {
      setBusyMessage('')
    }
  }

  function swipeProposal(keep) {
    const proposal = proposalCandidates[proposalIndex]
    if (!proposal) return
    const nextLiked = keep ? [...likedProposals, proposal] : likedProposals
    const nextHistory = [...proposalHistory, { keep, candidate: proposal }]
    setLikedProposals(nextLiked)
    setProposalHistory(nextHistory)
    setDragX(keep ? 360 : -360)
    window.setTimeout(() => {
      setDragX(0)
      if (proposalIndex >= proposalCandidates.length - 1) {
        const finalLiked = nextLiked
        setLikedProposals(finalLiked)
        runFinalSearch(microProfile, { likedOverride: finalLiked, historyOverride: nextHistory })
      } else {
        setProposalIndex((index) => index + 1)
      }
    }, 180)
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

    const nextValue = step.multi
      ? Array.from(new Set([...(Array.isArray(currentValue) ? currentValue : []), option.value]))
      : option.value
    const nextProfile = { ...microProfile, [step.id]: nextValue }
    setMicroProfile(nextProfile)
    localStorage.setItem('orientation_micro_profile', JSON.stringify(nextProfile))

    if (!step.multi) {
      window.setTimeout(() => {
        if (infoIndex >= activeMicroSteps.length - 1) startProposalDeck(nextProfile)
        else setInfoIndex((index) => index + 1)
      }, 200)
    }
  }

  const saveMicroProfile = async (profile, departmentOverride = userDepartment) => {
    const entries = [
      { question_id: 'orientation_budget', question_text: 'Budget études', answer_text: profile.budget || '' },
      { question_id: 'orientation_grade_confidence', question_text: 'Moyenne matières fortes', answer_text: profile.grade_confidence || '' },
      { question_id: 'orientation_school_level', question_text: 'Classe actuelle', answer_text: profile.school_level || '' },
      { question_id: 'orientation_target_level', question_text: "Niveau d'études visé", answer_text: profile.target_level || '' },
      { question_id: 'orientation_study_location', question_text: 'Préférence géographique', answer_text: profile.study_location || '' },
      { question_id: 'orientation_department', question_text: 'Département', answer_text: departmentOverride?.code || '' },
      { question_id: 'orientation_department_name', question_text: 'Département nom', answer_text: departmentOverride?.name || '' },
      { question_id: 'orientation_strong_subjects', question_text: 'Matières fortes', answer_text: JSON.stringify(profile.strong_subjects || []) }
    ].filter((entry) => entry.answer_text && entry.answer_text !== '[]')
    if (!entries.length) return
    await usersAPI.saveExtraInfo(entries).catch((saveError) => {
      console.warn('Micro profile save failed', saveError)
    })
  }

  const updateProfileIdentityField = (field, value) => {
    const nextIdentity = { ...profileIdentity, [field]: value }
    setProfileIdentity(nextIdentity)
    localStorage.setItem(PROFILE_IDENTITY_KEY, JSON.stringify(nextIdentity))
    if (profileIdentityError) setProfileIdentityError('')
  }

  const submitProfileIdentity = async (event) => {
    event.preventDefault()
    const identity = normalizeProfileIdentity(profileIdentity)
    if (!isProfileIdentityComplete(identity)) {
      setProfileIdentityError('Complète les trois champs pour continuer.')
      return
    }

    setProfileIdentitySaving(true)
    setProfileIdentityError('')
    try {
      await usersAPI.updateProfile({
        first_name: identity.firstName,
        last_name: identity.lastName,
        gender: identity.gender
      })
      setProfileIdentity(identity)
      localStorage.setItem(PROFILE_IDENTITY_KEY, JSON.stringify(identity))
      localStorage.setItem(PROFILE_IDENTITY_COMPLETE_KEY, 'true')
      markProfileIdentityCompleteForIntent(intent)
      profileIdentityCompleteRef.current = true
      setProfileIdentityComplete(true)
      await startProposalDeck(microProfile, intent)
    } catch (profileError) {
      console.error('Profile identity save failed', profileError)
      setProfileIdentityError(profileError?.response?.data?.error || "Impossible d'enregistrer ces infos pour le moment.")
    } finally {
      setProfileIdentitySaving(false)
    }
  }

  const runFinalSearch = async (profileOverride = microProfile, options = {}) => {
    const profile = sanitizeMicroProfileForIntent({ ...microProfile, ...(profileOverride || {}) }, intent)
    const historySource = options.historyOverride || proposalHistory
    const likedSource = options.likedOverride || likedProposals
    localStorage.setItem('orientation_micro_profile', JSON.stringify(profile))
    setPhase('finalSearch')
    setBusyMessage(intent === 'metiers' ? 'Zélia affine 8 métiers avec tes swipes' : FORMATION_SEARCH_WAITING_MESSAGE)
    setError('')

    try {
      const department = intent === 'metiers'
        ? (userDepartment || {})
        : await resolveUserDepartment()
      const savePromise = saveMicroProfile(profile, department)
      if (intent !== 'metiers') await savePromise
      const rejectedProposals = historySource.filter((item) => !item.keep).map((item) => item.candidate)
      const liked = likedSource

      if (intent === 'metiers') {
        const finalJobs = getFinalJobCandidates(profile, liked, rejectedProposals, AI_FINAL_JOB_COUNT)
        if (!finalJobs.length) throw new Error('Aucun métier final exploitable depuis le bilan et les swipes')
        setFinalCandidates(finalJobs)
        setCheckedIds(finalJobs.map((candidate) => candidate.id))
        setRequestInfoIds([])
        setPhase('final')
        savePromise.catch(() => null)
        return
      }

      const likedFormations = liked.filter((candidate) => candidate?.type === 'formation')
      const hasLikedFormations = likedFormations.length > 0
      const searchContext = {
        studyLocation: profile.study_location,
        department,
        profile
      }

      const finalJobs = intent === 'both'
        ? getFinalJobCandidates(profile, liked, rejectedProposals, AI_FINAL_JOB_COUNT)
        : []
      const partnerCandidatesPromise = orientationAPI.getMatchedSchools()
        .then((response) => (response?.data?.matched || []).map(normalizePartnerFormation))
        .catch((partnerError) => {
          console.warn('Matched partner schools failed', partnerError)
          return []
        })

      const formationPlans = getFinalFormationSearchPlans(profile, liked, FINAL_FORMATION_SEARCH_PLAN_COUNT)
      const [planDbCandidates, swipeDbCandidates, finalJobCandidates, partnerCandidates] = await Promise.all([
        fetchTableCandidates(formationPlans, FINAL_FORMATION_PAGE_SIZE, 'formations', {
          ...searchContext,
          maxFormationPlans: FINAL_FORMATION_SEARCH_PLAN_COUNT,
          maxFormationQueryVariants: MAX_FORMATION_QUERY_VARIANTS
        }),
        hasLikedFormations
          ? resolveCandidatesThroughCatalog(likedFormations, 6, 'formations', {
            ...searchContext,
            maxFormationPlans: 2,
            maxFormationQueryVariants: 1
          })
          : Promise.resolve([]),
        Promise.resolve(finalJobs),
        partnerCandidatesPromise
      ])

      const likedDatabaseCandidates = filterCandidatesByTargetStudyLevel(liked.filter(isDatabaseCandidate), profile)
      let dbCandidates = filterCandidatesByTargetStudyLevel(filterRejectedCandidates(
        mergeUniqueCandidates(swipeDbCandidates, likedDatabaseCandidates, planDbCandidates),
        rejectedProposals,
        liked
      ), profile)

      if (hasLikedFormations) {
        dbCandidates = filterCandidatesByFormationAnchors(dbCandidates, likedFormations)
      }

      dbCandidates = diversifyCandidates(dbCandidates, { maxPerFormation: 1, maxPerSchool: 2 })
      const selectedPartnerCandidates = selectPartnerCandidatesForFinal(
        partnerCandidates,
        profile,
        department,
        rejectedProposals,
        liked,
        MAX_PARTNER_FINAL_RESULTS
      )

      const finalList = composeFinalCandidates(mergeUniqueCandidates(dbCandidates, finalJobCandidates), selectedPartnerCandidates, intent)
      if (!finalList.length) {
        throw new Error('Aucune formation concrete trouvee avec les mots-cles valides')
      }
      setFinalCandidates(finalList)
      setCheckedIds(finalList.slice(0, Math.min(5, finalList.length)).map((candidate) => candidate.id))
      setRequestInfoIds(finalList.filter((candidate) => candidate.type === 'formation').map((candidate) => candidate.id))
      setPhase('final')
    } catch (finalError) {
      console.error('Final search error', finalError)
      setFinalCandidates([])
      setCheckedIds([])
      setRequestInfoIds([])
      setError(intent === 'metiers'
        ? "Je n'ai pas trouvé de métiers assez fiables avec les données disponibles."
        : "Je n'ai pas trouvé de formations assez fiables avec les données disponibles.")
    } finally {
      setBusyMessage('')
    }
  }

  const toggleFinal = (candidate) => {
    setCheckedIds((ids) => ids.includes(candidate.id)
      ? ids.filter((id) => id !== candidate.id)
      : [...ids, candidate.id]
    )
  }

  const persistFinalSelection = async (requestIds = requestInfoIds) => {
    const selectedCandidates = finalCandidates
      .filter((candidate) => checkedIds.includes(candidate.id))

    const requestIdSet = new Set(requestIds)
    const selected = selectedCandidates.map((candidate) => serializeFinalCandidate(candidate, requestIdSet.has(candidate.id)))
    localStorage.setItem('orientation_final_selection', JSON.stringify(selected))
    await usersAPI.saveExtraInfo([{ question_id: 'orientation_final_selection', question_text: 'Sélection finale', answer_text: JSON.stringify(selected) }]).catch(() => null)
    return selected
  }

  const toggleRequestInfo = (candidate) => {
    if (candidate?.type !== 'formation') return
    const currentIds = new Set(requestInfoIds)
    if (currentIds.has(candidate.id)) currentIds.delete(candidate.id)
    else currentIds.add(candidate.id)
    const nextIds = [...currentIds]
    setRequestInfoIds(nextIds)
    persistFinalSelection(nextIds).catch((saveError) => {
      console.warn('Final selection request info save failed', saveError)
    })
  }

  const validateFinalSelection = async () => {
    setError('')
    await persistFinalSelection(requestInfoIds)
    setPhase('confirmed')
  }

  const renderAvatarFace = (className = 'message-avatar') => (
    <img src={displayedAvatarUrl} alt="Avatar Zélia" className={className} />
  )

  const renderQuestionCard = () => {
    if (!currentQuestion) return null
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
          <span className="orientation-pill">{Math.min(questionIndex + 1, questions.length)} / {questions.length}</span>
          <h1>{cleanQuestionText(currentQuestion.contenu)}</h1>
          {questionIndex === 0 && (
            <div className="question-swipe-tutorial" aria-label="Glisse vers la gauche pour Non, vers la droite pour Oui">
              <span className="swipe-tutorial-answer reject">
                <i className="ph ph-arrow-left" aria-hidden="true" />
                Non
              </span>
              <span className="swipe-tutorial-track" aria-hidden="true">
                <span className="swipe-tutorial-cue" />
              </span>
              <span className="swipe-tutorial-answer accept">
                Oui
                <i className="ph ph-arrow-right" aria-hidden="true" />
              </span>
            </div>
          )}
        </div>
        <div className="orientation-actions two">
          <button className="round-action reject" onClick={() => answerQuestion('Non')} aria-label="Non" title="Non">
            <i className="ph ph-x" aria-hidden="true" />
          </button>
          <button className="round-action accept" onClick={() => answerQuestion('Oui')} aria-label="Oui" title="Oui">
            <i className="ph ph-check" aria-hidden="true" />
          </button>
        </div>
      </div>
    )
  }

  const renderAvatar = () => (
    <div className="orientation-stage compact">
      <div className="orientation-card avatar-card">
        <span className="orientation-pill">Avatar</span>
        <h1>Choisis l'avatar qui te convient</h1>
        <img src={avatarUrl} alt="Avatar Zélia" className="avatar-preview" />
      </div>
      <div className="avatar-actions">
        <button className="secondary-action" onClick={randomizeAvatar}>Au hasard</button>
        <button className="primary-action" onClick={validateAvatarAndContinue}>Valider</button>
      </div>
    </div>
  )

  const renderBusy = () => (
    <div className="orientation-stage compact">
      <div className="orientation-card message-card">
        {renderAvatarFace()}
        <div className="spinner" />
        <h1>{busyMessage || 'Chargement'}</h1>
      </div>
    </div>
  )

  const renderPersonality = () => (
    <div className="orientation-stage compact personality-stage">
      <div className="orientation-card recommendation-card personality-card">
        {renderAvatarFace()}
        <span className="orientation-pill">Analyse de personnalité</span>
        <h1>Voilà ce que ton profil raconte.</h1>
        <div className="recommendation-list">
          {visiblePersonality.map((item) => (
            <div key={item.label} className={`recommendation-row ${item.tone || ''}`}>
              <span>{item.label}</span>
              <strong className="analysis-value">{item.value}</strong>
            </div>
          ))}
        </div>
      </div>
      <button className="primary-action personality-continue" onClick={() => setPhase('intent')}>Continuer</button>
    </div>
  )

  const renderIntent = () => (
    <div className="orientation-stage compact">
      <div className="orientation-card choice-card">
        {renderAvatarFace()}
        <span className="orientation-pill">Recherche</span>
        <h1>Que recherches tu ?</h1>
        <div className="intent-grid">
          {INTENT_OPTIONS.map((option) => (
            <button key={option.value} className="intent-button" onClick={() => beginContextQuestions(option.value)}>
              <i className={`ph ${option.icon}`} aria-hidden="true" />
              <span>{option.title}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )

  const renderProposals = () => {
    if (!currentProposal) return null
    const display = getCandidateDisplay(currentProposal)
    return (
      <div className="orientation-stage">
        <div
          className="orientation-card candidate-card swipe-card"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{ transform: `translateX(${dragX}px) rotate(${dragX / 18}deg)` }}
        >
          {currentProposal.type === 'formation' ? (
            <div className="candidate-speaker">
              {renderAvatarFace('candidate-avatar')}
              <p>{currentProposal.partner ? 'Formation partenaire' : 'Formation'} · {currentProposal.source}</p>
            </div>
          ) : (
            <span className={`source-badge ${currentProposal.logoKind}`}>Métier · {currentProposal.source}</span>
          )}
          <h1>{display.title}</h1>
          <p>{display.subtitle}</p>
          {currentProposal.matchScore && <strong className="match-score">{currentProposal.matchScore}% match</strong>}
        </div>
        <div className="orientation-actions two">
          <button className="round-action reject" onClick={() => swipeProposal(false)} aria-label="Ignorer" title="Ignorer">
            <i className="ph ph-x" aria-hidden="true" />
          </button>
          <button className="round-action accept" onClick={() => swipeProposal(true)} aria-label="Garder" title="Garder">
            <i className="ph ph-check" aria-hidden="true" />
          </button>
        </div>
      </div>
    )
  }

  const renderMicroInfo = () => {
    const step = activeMicroSteps[infoIndex]
    if (!step) return null
    const selected = microProfile[step.id]
    return (
      <div className="orientation-stage compact">
        <div className="orientation-card choice-card">
          {renderAvatarFace()}
          <span className="orientation-pill">{infoIndex + 1} / {activeMicroSteps.length}</span>
          <h1>{step.title}</h1>
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
        </div>
        {step.multi && (
          <button className="primary-action" onClick={() => startProposalDeck(microProfile)}>Voir les propositions</button>
        )}
      </div>
    )
  }

  const renderProfileIdentity = () => {
    const identityNote = getProfileIdentityNote(intent)

    return (
      <div className="orientation-stage compact identity-stage">
        <form className="orientation-card identity-card" onSubmit={submitProfileIdentity}>
          {renderAvatarFace()}
          <span className="orientation-pill">Profil</span>
          <h1>Dis-moi qui tu es.</h1>
          <div className="identity-form-grid">
            <label>
              <span>Prénom</span>
              <input
                type="text"
                value={profileIdentity.firstName}
                onChange={(event) => updateProfileIdentityField('firstName', event.target.value)}
                autoComplete="given-name"
                required
              />
            </label>
            <label>
              <span>Nom</span>
              <input
                type="text"
                value={profileIdentity.lastName}
                onChange={(event) => updateProfileIdentityField('lastName', event.target.value)}
                autoComplete="family-name"
                required
              />
            </label>
            <label>
              <span>Genre</span>
              <select
                value={profileIdentity.gender}
                onChange={(event) => updateProfileIdentityField('gender', event.target.value)}
                required
              >
                <option value="">Choisir</option>
                {GENDER_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
          </div>
          <p className="identity-note">{identityNote}</p>
          {profileIdentityError && <p className="identity-error" role="alert">{profileIdentityError}</p>}
          <button className="primary-action identity-submit" type="submit" disabled={profileIdentitySaving}>
            {profileIdentitySaving ? 'Enregistrement...' : 'Continuer'}
          </button>
        </form>
      </div>
    )
  }

  const renderFinal = () => (
    <div className="orientation-stage compact final-stage">
      <div className="orientation-card final-card">
        {renderAvatarFace()}
        <span className="orientation-pill">J'ai trouvé</span>
        <h1>Voici la liste que j'ai confectionnée pour toi :</h1>
        <div className="final-list">
          {finalCandidates.map((candidate) => {
            const display = getCandidateDisplay(candidate)
            return (
              <label key={candidate.id} className={`final-row ${candidate.partner ? 'partner-row' : ''}`}>
                <input type="checkbox" checked={checkedIds.includes(candidate.id)} onChange={() => toggleFinal(candidate)} />
                <span>
                  <strong>{display.title}</strong>
                  <small>{display.subtitle}</small>
                </span>
                <b className={candidate.type === 'metier' ? 'job-kind' : 'formation-kind'}>{candidate.type === 'metier' ? 'Métier' : 'Formation'}</b>
                {candidate.partner && <b className="partner-kind">Partenaire</b>}
                {candidate.matchScore && <em>{candidate.matchScore}%</em>}
              </label>
            )
          })}
          {finalCandidates.length === 0 && <p className="empty-state">Aucune proposition précise pour le moment.</p>}
        </div>
      </div>
      <button className="primary-action" onClick={validateFinalSelection}>Valider ma sélection</button>
    </div>
  )

  const renderConfirmed = () => {
    const selectedCandidates = finalCandidates.filter((candidate) => checkedIds.includes(candidate.id))
    const recapCandidates = selectedCandidates.length ? selectedCandidates : finalCandidates.slice(0, 5)
    const hasMetierRecap = recapCandidates.some((candidate) => candidate?.type === 'metier')

    return (
      <div className="orientation-stage compact confirmed-stage">
        <div className="orientation-card message-card confirmed-card">
          {renderAvatarFace()}
          <span className="orientation-pill">Validé</span>
          <h1>{hasMetierRecap ? 'Voilà, on a une vraie base pour commencer. Je te propose ces métiers.' : 'Voilà, on a une vraie base pour avancer.'}</h1>
          <p>{hasMetierRecap
            ? "J'ai affiné tes swipes avec ton profil pour te proposer des métiers distincts et proches de tes matchs."
            : "J'ai gardé tes choix et je t'ai ajouté les infos utiles : description, lieu, niveau, contact et lien quand la base les fournit."}</p>

          {recapCandidates.length > 0 ? (
            <div className="confirmed-list">
              {recapCandidates.map((candidate) => {
                const details = buildCandidateDetail(candidate)
                const isFormation = candidate?.type === 'formation'
                return (
                  <article key={candidate.id} className={`confirmed-detail ${candidate.type === 'metier' ? 'job' : ''} ${candidate.partner ? 'partner' : ''}`}>
                    <div className="confirmed-detail-head">
                      <span>{details.typeLabel}</span>
                      {candidate.matchScore && <em>{candidate.matchScore}%</em>}
                    </div>
                    <h2>{details.title}</h2>
                    {details.subtitle && <strong>{details.subtitle}</strong>}
                    {details.tags.length > 0 && (
                      <div className="confirmed-tags">
                        {details.tags.map((tag) => <small key={tag}>{tag}</small>)}
                      </div>
                    )}
                    {details.description && <p>{details.description}</p>}
                    {isFormation && (
                      <label className="confirmed-request-info">
                        <input type="checkbox" checked={requestInfoIds.includes(candidate.id)} onChange={() => toggleRequestInfo(candidate)} />
                        <span>Demander plus d'informations</span>
                      </label>
                    )}
                    {details.link && (
                      <a href={details.link} target="_blank" rel="noreferrer">
                        {isFormation ? 'Voir la fiche' : details.linkLabel}
                        <i className="ph ph-arrow-square-out" aria-hidden="true" />
                      </a>
                    )}
                  </article>
                )
              })}
            </div>
          ) : (
            <p className="empty-state">Ta sélection est enregistrée. Tu peux la retrouver dans ton espace.</p>
          )}
        </div>
        <button className="primary-action" onClick={() => navigate('/app')}>Continuer vers mon espace</button>
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
    if (phase === 'questions') return renderQuestionCard()
    if (phase === 'avatar') return renderAvatar()
    if (phase === 'analysis' || phase === 'proposalSearch' || phase === 'finalSearch') return renderBusy()
    if (phase === 'personality') return renderPersonality()
    if (phase === 'intent') return renderIntent()
    if (phase === 'proposals') return renderProposals()
    if (phase === 'info') return renderMicroInfo()
    if (phase === 'profileIdentity') return renderProfileIdentity()
    if (phase === 'final') return renderFinal()
    if (phase === 'confirmed') return renderConfirmed()
    return null
  }

  return (
    <main className="orientation-flow">
      <header className="orientation-topbar">
        <img src="/static/images/logo-dark.png" alt="Zélia" />
        <div className="flow-progress"><span style={{ width: `${progress}%` }} /></div>
      </header>
      {renderPhase()}
    </main>
  )
}

