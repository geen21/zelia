// Partner formation matching: a partner is recommended only when its
// formation shares field vocabulary with the user's signals (recommended jobs,
// chosen domains, explicit projections). City and level only refine the score
// of an already relevant formation; they never make an off-topic one visible.

export const normalize = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

// French glue words, diploma words and generic role words: none of them says
// anything about the field of a formation.
const STOPWORDS = new Set([
  'bachelor', 'mba', 'bts', 'but', 'dut', 'cap', 'bac', 'master', 'mastere', 'licence', 'diplome', 'titre', 'niveau',
  'msc', 'bsc', 'doctorat', 'formation', 'formations', 'ecole', 'ecoles', 'superieure', 'institut', 'lycee',
  'universite', 'parcours', 'option', 'specialite', 'mention', 'programme', 'cycle', 'alternance', 'initiale',
  'professionnel', 'professionnelle', 'pro', 'international', 'internationale', 'metier', 'metiers', 'etude', 'etudes',
  'pour', 'avec', 'dans', 'des', 'les', 'une', 'aux', 'sur', 'par', 'mais',
  'le', 'la', 'de', 'du', 'au', 'en', 'et', 'ou', 'un', 'son', 'ses', 'ces',
  'plus', 'cette', 'cet', 'sans', 'tres', 'sous', 'chez', 'mon', 'ton', 'junior',
  'ingenieur', 'ingenieure', 'technicien', 'technicienne', 'chef', 'cheffe', 'charge', 'chargee', 'responsable',
  'assistant', 'assistante', 'agent', 'expert', 'experte', 'conseiller', 'conseillere', 'specialiste',
  'operateur', 'operatrice', 'adjoint', 'adjointe', 'directeur', 'directrice', 'employe', 'ouvrier',
  'sciences', 'science', 'technique', 'techniques', 'humaines', 'sociales', 'arts'
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
  ['developper', 'developpement'],
  ['dev', 'developpement'],
  ['code', 'developpement'],
  ['coding', 'developpement'],
  ['programmation', 'developpement'],
  ['programmeur', 'developpement'],
  ['programmeuse', 'developpement'],
  ['cybersecurite', 'cyber'],
  ['cybersecurity', 'cyber'],
  ['batiments', 'batiment'],
  ['produits', 'produit'],
  ['industrielle', 'industriel'],
  ['industrielles', 'industriel'],
  ['industriels', 'industriel'],
  ['industrie', 'industriel'],
  ['environnemental', 'environnement'],
  ['environnementale', 'environnement'],
  ['concepteur', 'conception'],
  ['conceptrice', 'conception'],
  ['geometre', 'topographie'],
  ['geomatique', 'topographie']
])

const RELATED_TOKEN_EXPANSIONS = {
  informatique: ['digital', 'developpement', 'web', 'logiciel', 'data'],
  digital: ['informatique', 'numerique', 'web', 'developpement'],
  numerique: ['digital', 'informatique', 'web', 'developpement'],
  developpement: ['informatique', 'web', 'logiciel', 'application'],
  web: ['digital', 'informatique', 'developpement'],
  logiciel: ['informatique', 'developpement'],
  data: ['informatique', 'digital', 'ia'],
  cyber: ['informatique', 'reseau', 'securite'],
  btp: ['batiment', 'construction', 'travaux', 'chantier'],
  chantier: ['batiment', 'construction', 'btp', 'travaux'],
  batiment: ['btp', 'construction', 'travaux'],
  environnement: ['ecologie', 'energie', 'durable'],
  amenagement: ['urbanisme', 'territoire'],
  territoire: ['amenagement', 'urbanisme'],
  maintenance: ['mecanique', 'electrotechnique'],
  conception: ['produit', 'production'],
  produit: ['conception', 'production']
}

export function tokenize(text) {
  return normalize(text)
    .split(' ')
    .map((t) => TOKEN_ALIASES.get(t) || t)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t))
}

// Domains → sets of informative tokens that may appear in
// a formation name. Each token weight is 1; multi-hit formations score higher.
const DOMAIN_TO_TOKENS = {
  'arts creation': ['design', 'creation', 'artistique', 'graphique', 'motion', 'ux', 'ui'],
  'sciences recherche': ['data', 'analyst', 'recherche', 'big', 'ia'],
  'technologie numerique': ['informatique', 'developpeur', 'developpement', 'web', 'cyber', 'reseau', 'sio', 'full', 'stack', 'data', 'ia', 'logiciel', 'application', 'programmation', 'cloud'],
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
  'culture patrimoine': [],
  'sante soin': ['sante', 'soin', 'medical', 'paramedical', 'infirmier', 'social'],
  'construction technique': ['construction', 'btp', 'genie', 'maintenance', 'mecanique', 'industriel', 'batiment'],
  'creation communication': ['creation', 'communication', 'design', 'audiovisuel', 'graphique', 'marketing'],
  'service public': ['droit', 'justice', 'securite', 'administration', 'social', 'education'],
  'terrain sport': ['sport', 'environnement', 'agriculture', 'logistique', 'terrain'],
  'science numerique': ['informatique', 'numerique', 'data', 'recherche'],
  'hotellerie restauration': ['hotellerie', 'restauration', 'cuisine', 'tourisme'],
  'commerce entrepreneuriat': ['commerce', 'vente', 'business', 'entrepreneuriat', 'management']
}

const FORMATION_PREFERENCE_LEVELS = {
  'voie pro': 1,
  bts: 2,
  but: 3,
  licence: 3,
  bachelor: 3,
  master: 5,
  doctorat: 8
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

export function parseLevel(raw) {
  const n = normalize(raw).replace(/\s+/g, '')
  const m = n.match(/bac\+?(\d+)/)
  if (!m) return null
  return parseInt(m[1], 10)
}

function parseFormationPreferenceLevels(raw) {
  return [...new Set(parseTopDomains(raw)
    .map((preference) => FORMATION_PREFERENCE_LEVELS[preference])
    .filter((level) => Number.isFinite(level)))]
}

function parseJobRecommendations(jobRecommendations) {
  let jobs = jobRecommendations
  if (typeof jobs === 'string') {
    try { jobs = JSON.parse(jobs) } catch { jobs = [] }
  }
  return Array.isArray(jobs) ? jobs.slice(0, 8) : []
}

function buildUserTokenBag({ topDomains, projectionText, jobRecommendations }) {
  const bag = new Map()
  const add = (token, weight) => {
    if (!token || token.length < 3) return
    if (STOPWORDS.has(token)) return
    bag.set(token, (bag.get(token) || 0) + weight)
    ;(RELATED_TOKEN_EXPANSIONS[token] || []).forEach((relatedToken) => {
      bag.set(relatedToken, (bag.get(relatedToken) || 0) + Math.max(1, weight * 0.6))
    })
  }

  // Domains: rank-weighted (top1 stronger than top3)
  const rankWeights = [3, 2, 1]
  topDomains.forEach((dom, idx) => {
    const w = rankWeights[idx] || 1
    tokensForDomain(dom).forEach((t) => add(t, w))
  })

  // Free-text projections typed by the user: very specific.
  tokenize(projectionText).forEach((t) => add(t, 4))

  // AI-recommended job titles are the closest signal to what the user sees in
  // results. Their soft skills ("communication", "gestion de projet") are
  // shared by most fields, so they only count marginally.
  jobRecommendations.forEach((job) => {
    const title = typeof job === 'string' ? job : job?.title || job?.intitule || ''
    tokenize(title).forEach((t) => add(t, 5))
    const skills = Array.isArray(job?.skills) ? job.skills.join(' ') : ''
    tokenize(skills).forEach((t) => {
      if (!bag.has(t)) bag.set(t, 0.5)
    })
  })

  return bag
}

function scoreFormationContent(formation, userBag) {
  if (userBag.size === 0) return { raw: 0, hits: 0, fieldHits: 0 }
  const weightedFields = [
    { text: formation.formation_name, multiplier: 3, field: true },
    { text: formation.domain, multiplier: 2, field: true },
    { text: formation.school_name, multiplier: 0.5, field: false },
    { text: formation.description, multiplier: 0.5, field: false }
  ]
  const seen = new Set()
  let raw = 0
  let hits = 0
  let fieldHits = 0

  for (const field of weightedFields) {
    for (const token of tokenize(field.text)) {
      if (seen.has(token)) continue
      const weight = userBag.get(token)
      // Soft-skill-only tokens (weight < 1) never qualify a formation.
      if (weight) {
        raw += weight * field.multiplier
        hits += 1
        if (field.field && weight >= 1) fieldHits += 1
        seen.add(token)
      }
    }
  }
  return { raw, hits, fieldHits }
}

function scoreCity(userCity, formationCity) {
  const a = normalize(userCity)
  const b = normalize(formationCity)
  if (!a || !b) return 0
  if (a === b) return 1
  if (a.includes(b) || b.includes(a)) return 1
  const aTokens = a.split(' ').filter((t) => t.length > 2)
  const bTokens = b.split(' ').filter((t) => t.length > 2)
  const overlap = aTokens.filter((t) => bTokens.includes(t)).length
  if (overlap >= 2) return 1
  if (overlap === 1) return 0.4
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

function scoreLevels(userLevels, formationLevelN) {
  if (!Array.isArray(userLevels) || userLevels.length === 0) return 0
  return Math.max(...userLevels.map((level) => scoreLevel(level, formationLevelN)))
}

// A formation needs ~15 points of weighted overlap in its name/domain (e.g. a
// recommended job word in the formation name) to reach the top of the range.
const CONTENT_TARGET = 15

export function scoreFormations(formations, pickFirstValue, jobRecommendations, userCityOverride = '') {
  const strongSubjects = parseTopDomains(pickFirstValue('orientation_strong_subjects'))
  const careerDomains = parseTopDomains(pickFirstValue('orientation_career_domains'))
  const topDomains = [...careerDomains, ...strongSubjects]
  const formationPreferencesRaw = pickFirstValue('orientation_formation_preferences')
  const legacyLevel = parseLevel(pickFirstValue('orientation_target_level'))
  const userLevels = [
    ...parseFormationPreferenceLevels(formationPreferencesRaw),
    ...(legacyLevel == null ? [] : [legacyLevel])
  ]
  const userCity = userCityOverride || pickFirstValue('orientation_city')

  // Previously shown/selected formations are deliberately not used: they would
  // feed the results back into the matching and amplify off-topic picks.
  const projectionText = [
    pickFirstValue('orientation_refine_job_projection'),
    pickFirstValue('orientation_refine_study_projection'),
    pickFirstValue('orientation_refine_main_priority')
  ].filter(Boolean).join(' ')

  const userBag = buildUserTokenBag({
    topDomains,
    projectionText,
    jobRecommendations: parseJobRecommendations(jobRecommendations)
  })
  if (userBag.size === 0) return []

  return formations
    .map((formation) => {
      const { raw, hits, fieldHits } = scoreFormationContent(formation, userBag)
      if (fieldHits === 0) return null
      const content = Math.min(1, raw / CONTENT_TARGET)
      const specificity = Math.min(6, (fieldHits - 1) * 3)
      const cityBonus = 4 * scoreCity(userCity, formation.city)
      const levelBonus = 3 * scoreLevels(userLevels, parseLevel(formation.diploma_level))
      const pct = Math.round(45 + content * 40 + specificity + cityBonus + levelBonus)
      return { ...formation, match_score: Math.max(45, Math.min(100, pct)), _hits: hits }
    })
    .filter(Boolean)
    .sort((a, b) => (Number(b.results_priority) || 0) - (Number(a.results_priority) || 0)
      || b.match_score - a.match_score
      || String(a.id).localeCompare(String(b.id)))
    .map(({ _hits, ...rest }) => rest)
}
