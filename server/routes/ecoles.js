import express from 'express'
import { supabaseAdmin } from '../config/supabase.js'
import { authenticateToken } from '../middleware/auth.js'

const router = express.Router()

// GET /api/ecoles/partenaires - List all partner school formations
router.get('/partenaires', authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('ecoles_partenaires')
      .select('*')
      .order('school_name')
      .order('city')

    if (error) throw error
    res.json({ formations: data || [] })
  } catch (e) {
    console.error('GET /ecoles/partenaires error:', e)
    res.status(500).json({ error: 'Failed to fetch formations' })
  }
})

// GET /api/ecoles/partenaires/:id - Get a single formation by id
router.get('/partenaires/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const { data, error } = await supabaseAdmin
      .from('ecoles_partenaires')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return res.status(404).json({ error: 'Formation not found' })
      throw error
    }
    res.json({ formation: data })
  } catch (e) {
    console.error('GET /ecoles/partenaires/:id error:', e)
    res.status(500).json({ error: 'Failed to fetch formation' })
  }
})

// GET /api/ecoles/matched - Get formations matched to user profile
router.get('/matched', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id

    // Fetch user's extra info for matching
    const { data: extraInfo, error: extraError } = await supabaseAdmin
      .from('informations_complementaires')
      .select('question_id, answer_text, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (extraError) throw extraError

    const entries = extraInfo || []
    const entryMap = new Map()
    for (const entry of entries) {
      const questionId = entry?.question_id
      if (!questionId || entryMap.has(questionId)) continue
      entryMap.set(questionId, entry?.answer_text || '')
    }

    const pickFirstValue = (...questionIds) => {
      for (const questionId of questionIds) {
        const value = entryMap.get(questionId)
        if (typeof value === 'string' && value.trim()) return value.trim()
      }
      return ''
    }

    // Fetch all formations
    const { data: formations, error: formError } = await supabaseAdmin
      .from('ecoles_partenaires')
      .select('*')

    if (formError) throw formError
    if (!formations || formations.length === 0) {
      return res.json({ matched: [] })
    }

    const { data: analysisResult, error: analysisError } = await supabaseAdmin
      .from('user_results')
      .select('job_recommendations')
      .eq('user_id', userId)
      .eq('questionnaire_type', 'inscription')
      .maybeSingle()

    if (analysisError && analysisError.code !== 'PGRST116') throw analysisError

    const userCity = pickFirstValue('niveau22_city', 'niveau22_location', 'niveau22_city_preference')
    const matched = scoreFormations(formations, entryMap, pickFirstValue, analysisResult?.job_recommendations)
    res.json({ matched, userCity: userCity || null })
  } catch (e) {
    console.error('GET /ecoles/matched error:', e)
    res.status(500).json({ error: 'Failed to fetch matched formations' })
  }
})

// ---------- Recommendation algorithm ----------

const normalize = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

// Generic French stopwords + recurring formation words that don't differentiate
const STOPWORDS = new Set([
  'bachelor', 'mba', 'bts', 'master', 'licence', 'diplome', 'titre', 'niveau',
  'pour', 'avec', 'dans', 'des', 'les', 'une', 'aux', 'sur', 'par', 'mais',
  'le', 'la', 'de', 'du', 'au', 'en', 'et', 'ou', 'un', 'son', 'ses', 'ces',
  'plus', 'cette', 'cet', 'sans', 'tres', 'sous', 'chez', 'mon', 'ton', 'junior'
])

const TOKEN_ALIASES = new Map([
  ['project', 'projet'],
  ['projects', 'projet'],
  ['projets', 'projet'],
  ['digitale', 'digital'],
  ['digitaux', 'digital'],
  ['numerique', 'digital'],
  ['numeriques', 'digital'],
  ['manager', 'management'],
  ['managerial', 'management'],
  ['manageriales', 'management'],
  ['gestionnaire', 'gestion'],
  ['coordination', 'coordonner'],
  ['coordinateur', 'coordonner'],
  ['coordinatrice', 'coordonner'],
  ['planification', 'planning'],
  ['communaute', 'community'],
  ['communautes', 'community'],
  ['reseaux', 'reseau'],
  ['logiciels', 'logiciel'],
  ['utilisateurs', 'utilisateur'],
  ['developpeur', 'developpement'],
  ['developpeuse', 'developpement'],
  ['developper', 'developpement']
])

function tokenize(text) {
  return normalize(text)
    .split(' ')
    .map((t) => TOKEN_ALIASES.get(t) || t)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t))
}

// Domains (Niveau 11) → sets of *informative* tokens that may appear in
// a formation name. Each token weight is 1; multi-hit formations score higher.
const DOMAIN_TO_TOKENS = {
  'arts creation': ['design', 'creation', 'artistique', 'graphique', 'motion', 'ux', 'ui'],
  'sciences recherche': ['data', 'analyst', 'recherche', 'big', 'ia'],
  'technologie numerique': ['informatique', 'developpeur', 'developpement', 'web', 'cyber', 'reseau', 'sio', 'full', 'stack', 'data', 'ia'],
  'sante bien etre': [],
  'education formation': [],
  'commerce vente': ['affaires', 'business', 'entrepreneuriat'],
  'marketing communication': ['marketing', 'communication', 'webmarketing'],
  'finance gestion': ['gestion', 'management', 'entrepreneuriat', 'projet'],
  'droit justice': [],
  'environnement developpement durable': [],
  'sport loisirs': [],
  'transport logistique': [],
  'batiment travaux publics': [],
  'cuisine hotellerie': [],
  'social humanitaire': [],
  'culture patrimoine': []
}

function tokensForDomain(domainNormalized) {
  const mapped = DOMAIN_TO_TOKENS[domainNormalized]
  if (mapped && mapped.length) return mapped
  // fallback: significant tokens of the label itself
  return tokenize(domainNormalized)
}

function parseTopDomains(raw) {
  if (!raw) return []
  let list = []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) list = parsed.map(String)
  } catch {
    list = String(raw).split(/[,;|\n]/).map((s) => s.trim()).filter(Boolean)
  }
  return list.slice(0, 3).map(normalize)
}

function parseLevel(raw) {
  const n = normalize(raw).replace(/\s+/g, '')
  const m = n.match(/bac\+?(\d+)/)
  if (!m) return null
  return parseInt(m[1], 10)
}

// Build a weighted token bag from the user signals.
// Higher weights mean stronger personal preference for that token.
function addWeightedTokens(bag, text, weight) {
  tokenize(text).forEach((token) => {
    bag.set(token, (bag.get(token) || 0) + weight)
  })
}

function buildJobRecommendationsText(jobRecommendations) {
  let jobs = jobRecommendations
  if (typeof jobs === 'string') {
    try { jobs = JSON.parse(jobs) } catch { jobs = [] }
  }
  if (!Array.isArray(jobs)) return ''
  return jobs
    .slice(0, 8)
    .map((job) => [
      job?.title,
      Array.isArray(job?.skills) ? job.skills.join(' ') : ''
    ].filter(Boolean).join(' '))
    .join(' ')
}

function buildUserTokenBag({ topDomains, jobKeywordsRaw, jobRecommendationsRaw }) {
  const bag = new Map()
  const add = (token, weight) => {
    if (!token || token.length < 3) return
    if (STOPWORDS.has(token)) return
    bag.set(token, (bag.get(token) || 0) + weight)
  }

  // Domains: rank-weighted (top1 stronger than top3)
  const rankWeights = [3, 2, 1]
  topDomains.forEach((dom, idx) => {
    const w = rankWeights[idx] || 1
    tokensForDomain(dom).forEach((t) => add(t, w))
  })

  // Free-text job/filière keywords: high weight (these are very specific)
  tokenize(jobKeywordsRaw).forEach((t) => add(t, 4))

  // AI-generated job ideas are the closest signal to what the user sees in results.
  tokenize(jobRecommendationsRaw).forEach((t) => add(t, 5))

  return bag
}

function scoreFormationContent(formation, userBag) {
  if (userBag.size === 0) return { raw: 0, hits: 0 }
  const weightedFields = [
    { text: formation.formation_name, multiplier: 3 },
    { text: formation.domain, multiplier: 2 },
    { text: formation.description, multiplier: 1 }
  ]
  const seen = new Set()
  let raw = 0
  let hits = 0

  for (const field of weightedFields) {
    for (const token of tokenize(field.text)) {
      if (seen.has(token)) continue
      const weight = userBag.get(token)
      if (weight) {
        raw += weight * field.multiplier
        hits += 1
        seen.add(token)
      }
    }
  }
  return { raw, hits }
}

function scoreCity(userCity, formationCity) {
  const a = normalize(userCity)
  const b = normalize(formationCity)
  if (!a || !b) return 0
  if (a === b) return 6
  if (a.includes(b) || b.includes(a)) return 6
  const aTokens = a.split(' ').filter((t) => t.length > 2)
  const bTokens = b.split(' ').filter((t) => t.length > 2)
  const overlap = aTokens.filter((t) => bTokens.includes(t)).length
  if (overlap >= 2) return 6
  if (overlap === 1) return 2
  return 0
}

function scoreLevel(userLevelN, formationLevelN) {
  if (userLevelN == null || formationLevelN == null) return 0
  if (userLevelN === formationLevelN) return 1
  const diff = Math.abs(userLevelN - formationLevelN)
  if (diff === 1) return 0.5
  if (diff === 2) return 0.2
  return 0
}

function scoreFormations(formations, entryMap, pickFirstValue, jobRecommendations) {
  // Extract user signals
  const topDomainsRaw = pickFirstValue('niveau11_top3', 'niveau11_domain_ranking')
  const topDomains = parseTopDomains(topDomainsRaw)
  const userLevelRaw = pickFirstValue('niveau22_level', 'niveau22_study_level')
  const userLevelN = parseLevel(userLevelRaw)
  const userCity = pickFirstValue('niveau22_city', 'niveau22_location', 'niveau22_city_preference')

  const jobKeywordsParts = [
    pickFirstValue('niveau31_selected_job'),
    pickFirstValue('niveau14_target_job'),
    pickFirstValue('niveau17_target_job'),
    pickFirstValue('niveau21_filieres')
  ].filter(Boolean)
  const jobKeywordsRaw = jobKeywordsParts.join(' ')
  const jobRecommendationsRaw = buildJobRecommendationsText(jobRecommendations)

  const userBag = buildUserTokenBag({ topDomains, jobKeywordsRaw, jobRecommendationsRaw })
  const hasContentSignal = userBag.size > 0
  const hasCitySignal = Boolean(userCity)
  // Need at least one signal to produce recommendations
  if (!hasContentSignal && !hasCitySignal) return []

  const intermediate = formations
    .map((f) => {
      const { raw, hits } = hasContentSignal ? scoreFormationContent(f, userBag) : { raw: 0, hits: 0 }
      const cityBonus = scoreCity(userCity, f.city)
      const levelBonus = scoreLevel(userLevelN, parseLevel(f.diploma_level))
      // Exclude only if both content AND city give nothing
      if (hits === 0 && cityBonus === 0) return null
      const total = raw + cityBonus + levelBonus
      return { f, raw, total, hits }
    })
    .filter(Boolean)

  if (intermediate.length === 0) return []

  // Absolute scaling: a formation needs ~12 points of weighted overlap
  // (e.g. 3 strong hits) to reach 100%. This avoids systematic ties at
  // the top that the relative-to-max normalization produced.
  const TARGET = 12

  const scored = intermediate.map(({ f, total, hits, raw }) => {
    const ratio = total / TARGET
    // Soft cap with diminishing returns above the target
    const base = ratio >= 1
      ? 92 + Math.min(8, Math.round((ratio - 1) * 6)) // 92..100
      : Math.round(ratio * 92) // 0..92
    // Bonus for multi-hit specificity (rewards formations whose name shares
    // several distinct tokens with the user bag, not just one big-weight one)
    const specificity = Math.min(6, (hits - 1) * 3)
    const pct = Math.max(35, Math.min(100, base + specificity))
    return { ...f, match_score: pct, _hits: hits, _raw: total }
  })

  return scored
    .sort((a, b) => (b._raw - a._raw) || (b.match_score - a.match_score))
    .slice(0, 12)
    .map(({ _hits, _raw, ...rest }) => rest)
}

// POST /api/ecoles/submit - Submit application to a formation
router.post('/submit', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const { formation_id } = req.body

    if (!formation_id) {
      return res.status(400).json({ error: 'formation_id is required' })
    }

    // Check for duplicate submission
    const { data: existing } = await supabaseAdmin
      .from('contact_submitted')
      .select('id')
      .eq('user_id', userId)
      .eq('formation_id', formation_id)
      .limit(1)

    if (existing && existing.length > 0) {
      return res.status(409).json({ error: 'Already submitted' })
    }

    const { error } = await supabaseAdmin
      .from('contact_submitted')
      .insert({
        user_id: userId,
        formation_id,
        submitted_at: new Date().toISOString()
      })

    if (error) throw error
    res.json({ success: true })
  } catch (e) {
    console.error('POST /ecoles/submit error:', e)
    res.status(500).json({ error: 'Failed to submit application' })
  }
})

// GET /api/ecoles/my-submissions - Get user's past submissions
router.get('/my-submissions', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id

    const { data, error } = await supabaseAdmin
      .from('contact_submitted')
      .select('id, formation_id, submitted_at')
      .eq('user_id', userId)
      .order('submitted_at', { ascending: false })

    if (error) throw error
    res.json({ submissions: data || [] })
  } catch (e) {
    console.error('GET /ecoles/my-submissions error:', e)
    res.status(500).json({ error: 'Failed to fetch submissions' })
  }
})

export default router
