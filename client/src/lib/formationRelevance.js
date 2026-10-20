// Thematic relevance between a user's orientation profile (recommended jobs,
// recommended studies, chosen career domains) and a formation row. A formation
// is only considered relevant when its title shares vocabulary with at least
// one of those signals; the diploma word alone ("bachelor", "BTS"...) never is.

export const BEST_MATCH_MIN_SCORE = 80

const STOPWORDS = new Set([
  // French glue words
  'les', 'des', 'une', 'aux', 'sur', 'par', 'pour', 'avec', 'dans', 'sans', 'sous', 'chez', 'entre', 'vers',
  'que', 'qui', 'son', 'ses', 'leur', 'leurs', 'cette', 'tout', 'tous', 'plus', 'tres', 'option', 'options',
  'parcours', 'specialite', 'mention', 'cursus', 'grade', 'campus', 'mineure', 'majeure', 'dit', 'type',
  // Diploma and school words: they say nothing about the field
  'formation', 'formations', 'diplome', 'diplomes', 'etat', 'titre', 'certificat', 'niveau', 'annee', 'annees',
  'bac', 'bts', 'but', 'dut', 'cap', 'licence', 'licences', 'bachelor', 'bachelors', 'master', 'masters',
  'mastere', 'mba', 'msc', 'bsc', 'doctorat', 'prepa', 'classe', 'preparatoire', 'cpge', 'deust', 'dnmade',
  'professionnel', 'professionnelle', 'professionnels', 'professionnelles', 'pro', 'alternance', 'apprentissage',
  'initiale', 'continue', 'ecole', 'ecoles', 'superieure', 'superieur', 'universite', 'institut', 'lycee', 'iut',
  'cfa', 'programme', 'programmes', 'cycle', 'international', 'internationale', 'francophone', 'anglophone',
  'metier', 'metiers', 'etude', 'etudes', 'aux', 'secteur', 'domaine', 'filiere',
  // Generic role words in job titles (chef de chantier, ingénieur environnement...)
  'ingenieur', 'ingenieure', 'ingenierie', 'technicien', 'technicienne', 'techniciens', 'chef', 'cheffe',
  'charge', 'chargee', 'responsable', 'assistant', 'assistante', 'agent', 'agente', 'expert', 'experte',
  'conseiller', 'conseillere', 'specialiste', 'operateur', 'operatrice', 'adjoint', 'adjointe', 'directeur',
  'directrice', 'gestionnaire', 'animateur', 'animatrice', 'employe', 'employee', 'ouvrier', 'ouvriere',
  // Too broad to discriminate between fields
  'sciences', 'science', 'technique', 'techniques', 'technologie', 'technologies', 'generale', 'general',
  'appliquee', 'appliquees', 'humaines', 'sociales', 'arts', 'art'
])

// Field neighbours: a "Chef de chantier BTP" profile should match "BTS Bâtiment".
const RELATED_TERMS = {
  btp: ['batiment', 'travaux', 'genie civil', 'construction', 'chantier'],
  chantier: ['batiment', 'travaux', 'btp', 'construction'],
  batiment: ['btp', 'travaux', 'construction', 'genie civil'],
  construction: ['batiment', 'btp', 'travaux', 'genie civil'],
  environnement: ['ecologie', 'developpement durable', 'eau', 'energie', 'biodiversite'],
  geometre: ['topographie', 'geomatique', 'geometre'],
  topographie: ['geometre', 'geomatique'],
  amenagement: ['urbanisme', 'territoire', 'geographie'],
  territoire: ['amenagement', 'urbanisme'],
  urbanisme: ['amenagement', 'territoire'],
  maintenance: ['electrotechnique', 'mecanique', 'systemes'],
  industrielle: ['industrie', 'production', 'mecanique'],
  produit: ['conception', 'design industriel', 'production'],
  conception: ['conception', 'design industriel', 'production'],
  informatique: ['numerique', 'developpement', 'logiciel', 'reseau'],
  numerique: ['informatique', 'digital'],
  infirmier: ['soins infirmiers', 'sante'],
  soin: ['sante', 'soins'],
  sante: ['soins', 'paramedical'],
  cuisinier: ['cuisine', 'restauration', 'arts culinaires'],
  cuisine: ['restauration', 'culinaires'],
  electricien: ['electricite', 'electrotechnique'],
  mecanicien: ['mecanique', 'maintenance vehicules'],
  comptable: ['comptabilite', 'gestion', 'finance'],
  journaliste: ['journalisme', 'communication', 'information']
}

const CAREER_DOMAIN_TERMS = {
  sante_soin: ['santé', 'soins infirmiers', 'paramédical', 'médical'],
  construction_technique: ['bâtiment', 'BTP', 'génie civil', 'travaux publics', 'maintenance', 'mécanique'],
  creation_communication: ['communication', 'design', 'audiovisuel', 'graphisme'],
  service_public: ['droit', 'administration', 'sécurité', 'social'],
  terrain_sport: ['sport', 'environnement', 'agriculture', 'aménagement'],
  science_numerique: ['informatique', 'numérique', 'data', 'mathématiques', 'physique', 'biologie'],
  hotellerie_restauration: ['hôtellerie', 'restauration', 'cuisine', 'tourisme'],
  commerce_entrepreneuriat: ['commerce', 'vente', 'management', 'entrepreneuriat', 'marketing']
}

export function normalizeRelevanceText(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// Light stemming: a shared 6-letter prefix is enough to equate
// environnement/environnemental, industriel/industrielle, produit/produits...
function stem(token) {
  return token.length > 6 ? token.slice(0, 6) : token.replace(/s$/, '')
}

function flatten(value) {
  if (Array.isArray(value)) return value.flatMap(flatten)
  if (value === null || value === undefined) return []
  if (typeof value === 'object') return Object.values(value).flatMap(flatten)
  return [String(value)]
}

function significantTokens(text) {
  return normalizeRelevanceText(text)
    .split(' ')
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token))
}

// The catalog search compares accented text, so queries keep the original words.
function significantOriginalWords(text) {
  return String(text ?? '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => {
      const normalized = normalizeRelevanceText(word)
      return normalized.length >= 3 && !STOPWORDS.has(normalized)
    })
    .map((word) => word.toLowerCase())
}

function stemSet(text) {
  return new Set(significantTokens(text).map(stem))
}

// Each signal token accepts its own stem plus the stems of related terms.
function buildTokenAlternatives(token) {
  const related = RELATED_TERMS[token] || []
  const alternatives = [[stem(token)]]
  for (const term of related) {
    const parts = significantTokens(term).map(stem)
    if (parts.length) alternatives.push(parts)
  }
  return alternatives
}

function buildGroup(kind, label, text, weight) {
  const tokens = [...new Set(significantTokens(text))]
  if (!tokens.length) return null
  return {
    kind,
    label,
    weight,
    tokens: tokens.map((token) => ({ token, alternatives: buildTokenAlternatives(token) }))
  }
}

function getAnalysisBlock(analysis) {
  return analysis?.inscriptionResults || analysis || {}
}

function pickTitle(item, keys) {
  if (!item) return ''
  if (typeof item === 'string') return item
  for (const key of keys) {
    if (item[key]) return String(item[key])
  }
  return ''
}

export function buildFormationRelevanceProfile({ analysis, profile = {} } = {}) {
  const block = getAnalysisBlock(analysis) || {}
  const jobs = Array.isArray(block.jobRecommendations) ? block.jobRecommendations : []
  const studies = Array.isArray(block.studyRecommendations) ? block.studyRecommendations : []
  const domains = Array.isArray(profile.career_domains) ? profile.career_domains : []

  const groups = [
    ...studies.slice(0, 8).map((study) => {
      const title = pickTitle(study, ['degree', 'diploma', 'title'])
      return buildGroup('study', title, title, 1)
    }),
    ...jobs.slice(0, 8).map((job) => {
      const title = pickTitle(job, ['title', 'intitule'])
      return buildGroup('job', title, title, 1)
    }),
    ...domains.flatMap((domain) => (CAREER_DOMAIN_TERMS[domain] || []).map((term) => buildGroup('domain', term, term, 0.65)))
  ].filter(Boolean)

  return { groups }
}

// Exact field words count fully; neighbouring terms only partially, so a
// formation sharing just the broader family never looks like a perfect match.
const RELATED_TERM_CREDIT = 0.6

function groupCoverage(group, formationStems) {
  let matched = 0
  for (const { alternatives } of group.tokens) {
    const [direct, ...related] = alternatives
    if (direct.every((part) => formationStems.has(part))) matched += 1
    else if (related.some((parts) => parts.every((part) => formationStems.has(part)))) matched += RELATED_TERM_CREDIT
  }
  return matched / group.tokens.length
}

function getFormationTitleText(formation) {
  const raw = formation?.raw || formation || {}
  return flatten([formation?.title, raw.nm, raw.nmc, raw.formation_name, raw.domain]).join(' ')
}

// Returns { relevant, score, coverage, matchedGroups }. Score is a 0-100 match
// percentage that only rises above ~85 when a recommendation is fully covered.
export function scoreFormationRelevance(formation, relevanceProfile, { levelMatches = false } = {}) {
  const groups = relevanceProfile?.groups || []
  if (!groups.length) return { relevant: false, score: null, coverage: 0, matchedGroups: [] }

  const formationStems = stemSet(getFormationTitleText(formation))
  let best = 0
  const matchedGroups = []
  const matchedRecommendations = new Set()
  for (const group of groups) {
    const coverage = groupCoverage(group, formationStems)
    if (coverage <= 0) continue
    matchedGroups.push(group.label)
    if (group.kind !== 'domain') matchedRecommendations.add(group.label)
    best = Math.max(best, coverage * group.weight)
  }

  if (best <= 0) return { relevant: false, score: null, coverage: 0, matchedGroups }

  // Breadth rewards formations bridging several recommendations; broad domain
  // words alone must not push a formation into best-match territory.
  const breadth = Math.min(6, Math.max(0, matchedRecommendations.size - 1) * 2)
  const score = Math.round(50 + best * 40 + breadth + (levelMatches ? 2 : 0))
  return {
    relevant: true,
    score: Math.max(50, Math.min(98, score)),
    coverage: best,
    matchedGroups
  }
}

// Search queries derived from the profile signals: recommended studies first
// (already formation-shaped), then the field words of recommended jobs, then
// chosen career domains.
export function buildRelevanceSearchQueries(relevanceProfile, limit = 8) {
  const seen = new Set()
  const queries = []
  const order = ['study', 'job', 'domain']
  for (const kind of order) {
    for (const group of relevanceProfile?.groups || []) {
      if (group.kind !== kind) continue
      const query = kind === 'study'
        ? group.label
        : [...new Set(significantOriginalWords(group.label))].slice(0, 3).join(' ')
      const key = normalizeRelevanceText(query)
      if (!key || seen.has(key)) continue
      seen.add(key)
      queries.push({ kind, query, label: group.label })
      if (queries.length >= limit) return queries
    }
  }
  return queries
}
