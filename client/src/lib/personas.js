// Zélia persona system (v2) — replaces the old 8-archetype "ZL-xx" mapping used only for
// share images. These 10 personas match the "workshop zélia" mockups: each has a canonical
// representative first name, a display title with correct French gender agreement, a short
// tagline, and a list of domaines (fields/sectors) it tends to fit.
//
// Matching is done fully client-side from data we already have after the AI analysis call
// (personalityAnalysis text, skillsAssessment text, job recommendations, liked job swipes).
// This avoids any backend/schema change: it is a pure text-scoring heuristic with a stable
// deterministic fallback so a user always gets a persona, even if the AI text is generic.

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function stableHash(text) {
  const normalized = String(text || '')
  let hash = 0
  for (let index = 0; index < normalized.length; index += 1) {
    hash = ((hash << 5) - hash + normalized.charCodeAt(index)) | 0
  }
  return Math.abs(hash)
}

export const PERSONAS = [
  {
    id: 'strategiste',
    name: 'Kylian',
    gender: 'm',
    title: 'Stratège',
    displayTitle: 'le Stratège',
    tagline: 'Tu vois trois coups à l\u2019avance.',
    domaines: ['Ingénierie', 'Finance', 'Data', 'Jeux vidéo', 'Conseil'],
    keywords: ['strateg', 'analys', 'logique', 'anticip', 'planif', 'organis', 'rigoureux', 'methodique', 'calcul', 'raisonnement', 'echecs', 'optimis']
  },
  {
    id: 'batisseur',
    name: 'Léon',
    gender: 'm',
    title: 'Bâtisseur',
    displayTitle: 'le Bâtisseur',
    tagline: 'Tu préfères construire plutôt que parler.',
    domaines: ['Artisanat', 'BTP', 'Informatique', 'Chirurgie'],
    keywords: ['construi', 'concret', 'manuel', 'fabriqu', 'reparer', 'bricol', 'pratique', 'terrain', 'technique', 'geste', 'precision', 'batir']
  },
  {
    id: 'connecteur',
    name: 'David',
    gender: 'm',
    title: 'Connecteur',
    displayTitle: 'le Connecteur',
    tagline: 'Tu crées du lien partout où tu passes.',
    domaines: ['Communication', 'RH', 'Événementiel', 'Commerce'],
    keywords: ['relation', 'social', 'communicat', 'reseau', 'echange', 'convivial', 'energie', 'anima', 'contact', 'equipe', 'entourage', 'charisme']
  },
  {
    id: 'protecteur',
    name: 'Louanne',
    gender: 'f',
    title: 'Protecteur',
    displayTitle: 'la Protectrice',
    tagline: 'Prendre soin des autres, c\u2019est instinctif chez toi.',
    domaines: ['Social', 'Santé', 'Éducation', 'Justice'],
    keywords: ['protege', 'aide', 'soin', 'ecoute', 'bienveillan', 'empath', 'soutien', 'rassur', 'attentionn', 'solidarite', 'sensible', 'devouement']
  },
  {
    id: 'observateur',
    name: 'Ines',
    gender: 'f',
    title: 'Observateur',
    displayTitle: 'l\u2019Observatrice',
    tagline: 'Tu comprends avant d\u2019agir.',
    domaines: ['Recherche', 'Psychologie', 'Data', 'Écriture'],
    keywords: ['observ', 'reflechi', 'curieux', 'curieuse', 'analyse', 'comprend', 'discret', 'introspect', 'attentif', 'ecrit', 'recherche', 'detail']
  },
  {
    id: 'loyal',
    name: 'Antoine',
    gender: 'm',
    title: 'Loyal',
    displayTitle: 'le Loyal',
    tagline: 'On peut compter sur toi, toujours.',
    domaines: ['Santé', 'Enseignement', 'Fonction publique', 'RH'],
    keywords: ['fiable', 'loyal', 'engage', 'serieux', 'stable', 'confiance', 'devoue', 'constant', 'responsab', 'discipline', 'respect', 'droiture']
  },
  {
    id: 'insoumis',
    name: 'Aya',
    gender: 'f',
    title: 'Insoumis',
    displayTitle: 'l\u2019Insoumise',
    tagline: 'Tu n\u2019attends pas la permission pour agir.',
    domaines: ['Entrepreneuriat', 'Droit', 'Journalisme', 'Art engagé'],
    keywords: ['independan', 'rebelle', 'liberte', 'convict', 'engage', 'audac', 'transgress', 'critique', 'justice', 'militant', 'nonconformis', 'franc']
  },
  {
    id: 'competiteur',
    name: 'Karim',
    gender: 'm',
    title: 'Compétiteur',
    displayTitle: 'le Compétiteur',
    tagline: 'Chaque défi est une occasion de progresser.',
    domaines: ['Sport', 'Business', 'Sciences', 'Droit'],
    keywords: ['competit', 'defi', 'depass', 'gagner', 'performance', 'ambitieux', 'ambitieuse', 'challenge', 'objectif', 'perseveran', 'exigean', 'resultat']
  },
  {
    id: 'createur',
    name: 'Angèle',
    gender: 'f',
    title: 'Créateur',
    displayTitle: 'la Créatrice',
    tagline: 'Tu vois le monde autrement, et ça se voit.',
    domaines: ['Design', 'Architecture', 'Audiovisuel', 'Mode'],
    keywords: ['creati', 'imagin', 'artistique', 'original', 'esthetique', 'invente', 'design', 'expression', 'sensibilite', 'inspir', 'vision', 'style']
  },
  {
    id: 'explorateur',
    name: 'Véro',
    gender: 'f',
    title: 'Explorateur',
    displayTitle: 'l\u2019Exploratrice',
    tagline: 'Le terrain t\u2019apprend plus que les livres.',
    domaines: ['Voyage/tourisme', 'Sciences', 'Journalisme', 'Start-up'],
    keywords: ['explor', 'decouvre', 'voyage', 'aventure', 'curiosite', 'nouveaut', 'ouverture', 'mobilite', 'adapt', 'spontane', 'independan', 'liberte']
  }
]

export function getPersonaById(id) {
  return PERSONAS.find((persona) => persona.id === id) || null
}

function collectAnalysisText(analysisBlock, likedProposals = []) {
  const parts = [
    analysisBlock?.personalityAnalysis,
    analysisBlock?.skillsAssessment,
    analysisBlock?.personalityType
  ]

  const jobs = Array.isArray(analysisBlock?.jobRecommendations) ? analysisBlock.jobRecommendations : []
  jobs.forEach((job) => {
    parts.push(job?.title)
    if (Array.isArray(job?.skills)) parts.push(job.skills.join(' '))
  })

  likedProposals.forEach((candidate) => {
    parts.push(candidate?.title)
    parts.push(candidate?.raw?.why)
    if (Array.isArray(candidate?.raw?.skills)) parts.push(candidate.raw.skills.join(' '))
  })

  return normalizeText(parts.filter(Boolean).join(' '))
}

/**
 * Scores each of the 10 personas against the available AI analysis text + liked job swipes,
 * and returns the best match. Falls back to a deterministic (seed-based) pick so the result
 * never depends on randomness and is stable across re-renders for the same user.
 */
export function matchPersonaFromAnalysis(analysisBlock, likedProposals = [], seed = '') {
  const haystack = collectAnalysisText(analysisBlock, likedProposals)

  let best = null
  let bestScore = 0

  PERSONAS.forEach((persona) => {
    let score = 0
    persona.keywords.forEach((keyword) => {
      if (haystack.includes(keyword)) score += 1
    })
    if (score > bestScore) {
      bestScore = score
      best = persona
    }
  })

  if (best) return { persona: best, score: bestScore, matched: true }

  const fallbackSeed = seed || haystack || 'zelia'
  const fallback = PERSONAS[stableHash(fallbackSeed) % PERSONAS.length]
  return { persona: fallback, score: 0, matched: false }
}

export function formatPersonaHeadline(persona) {
  if (!persona) return ''
  return `Tu ressembles à ${persona.name}, ${persona.displayTitle}`
}
