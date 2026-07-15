// Persona system for the orientation flow.
// 5 binary axes (matching questions.category / options[].value in the DB)
// + 12 curated personas with portrait-chinois attributes.

export const AXES = [
  { id: 'hands_mind', poles: ['mains', 'tete'] },
  { id: 'solo_team', poles: ['solo', 'equipe'] },
  { id: 'creative_structured', poles: ['creatif', 'structure'] },
  { id: 'field_office', poles: ['terrain', 'bureau'] },
  { id: 'risk_safety', poles: ['audace', 'securite'] }
]

export const PERSONAS = [
  {
    slug: 'explorateur-creatif',
    name: "L'Explorateur Créatif",
    tagline: 'Tu observes le monde avec des yeux neufs et tu transformes tout ce que tu croises en idée.',
    traits: ['Empathie', 'Imagination', 'Sens du détail', 'Curiosité'],
    domaines: ['Création', 'Voyage & découverte', 'Culture & environnement'],
    signature: { hands_mind: 'tete', solo_team: 'solo', creative_structured: 'creatif', field_office: 'terrain', risk_safety: 'audace' },
    portrait: {
      animal: { emoji: '🐙', label: 'La pieuvre' },
      couleur: { emoji: '🟠', label: 'Orange' },
      ville: { emoji: '🗼', label: 'Tokyo' },
      objet: { emoji: '📷', label: "L'appareil photo" },
      personnage: { emoji: '🐀', label: 'Rémy (Ratatouille)' }
    },
    avatar: { bg: '#FFF7E6', hair: '#a55728' }
  },
  {
    slug: 'batisseur',
    name: 'Le Bâtisseur',
    tagline: 'Tu aimes le concret : quand tu construis quelque chose, il tient debout et il sert à tout le monde.',
    traits: ['Fiabilité', 'Sens pratique', 'Persévérance', 'Esprit d\u2019équipe'],
    domaines: ['Technique & artisanat', 'Construction', 'Production'],
    signature: { hands_mind: 'mains', solo_team: 'equipe', creative_structured: 'structure', field_office: 'terrain', risk_safety: 'securite' },
    portrait: {
      animal: { emoji: '🦫', label: 'Le castor' },
      couleur: { emoji: '🟤', label: 'Terracotta' },
      ville: { emoji: '🚲', label: 'Amsterdam' },
      objet: { emoji: '🧰', label: 'La boîte à outils' },
      personnage: { emoji: '👷', label: 'Bob le bricoleur' }
    },
    avatar: { bg: '#FDE7E9', hair: '#6b4423' }
  },
  {
    slug: 'stratege',
    name: 'Le Stratège',
    tagline: 'Trois coups d\u2019avance, toujours. Tu comprends vite et tu vois ce que les autres ne voient pas.',
    traits: ['Logique', 'Anticipation', 'Concentration', 'Précision'],
    domaines: ['Droit & analyse', 'Ingénierie', 'Sciences & stratégie'],
    signature: { hands_mind: 'tete', solo_team: 'solo', creative_structured: 'structure', field_office: 'bureau', risk_safety: 'securite' },
    portrait: {
      animal: { emoji: '🦉', label: 'La chouette' },
      couleur: { emoji: '🔵', label: 'Bleu nuit' },
      ville: { emoji: '🏔️', label: 'Genève' },
      objet: { emoji: '♟️', label: "L'échiquier" },
      personnage: { emoji: '🧙', label: 'Hermione Granger' }
    },
    avatar: { bg: '#E3F2FD', hair: '#2f2f2f' }
  },
  {
    slug: 'connecteur',
    name: 'Le Connecteur',
    tagline: 'Tu rassembles les gens sans effort : avec toi, un groupe devient une équipe.',
    traits: ['Énergie', 'Communication', 'Enthousiasme', 'Ouverture'],
    domaines: ['Relationnel', 'Animation & événementiel', 'Commerce terrain'],
    signature: { hands_mind: 'tete', solo_team: 'equipe', creative_structured: 'creatif', field_office: 'terrain', risk_safety: 'audace' },
    portrait: {
      animal: { emoji: '🐬', label: 'Le dauphin' },
      couleur: { emoji: '🟡', label: 'Jaune soleil' },
      ville: { emoji: '🏖️', label: 'Rio' },
      objet: { emoji: '🎤', label: 'Le micro' },
      personnage: { emoji: '🏴‍☠️', label: 'Luffy (One Piece)' }
    },
    avatar: { bg: '#FFF7E6', hair: '#b58143' }
  },
  {
    slug: 'protecteur',
    name: 'Le Protecteur',
    tagline: 'Tu veilles sur les autres : ta force tranquille rassure et fait avancer tout le monde.',
    traits: ['Bienveillance', 'Sang-froid', 'Sens du devoir', 'Écoute'],
    domaines: ['Santé & social', 'Sécurité', 'Environnement'],
    signature: { hands_mind: 'mains', solo_team: 'equipe', creative_structured: 'creatif', field_office: 'terrain', risk_safety: 'securite' },
    portrait: {
      animal: { emoji: '🐘', label: "L'éléphant" },
      couleur: { emoji: '🟢', label: 'Vert forêt' },
      ville: { emoji: '🍁', label: 'Montréal' },
      objet: { emoji: '🧭', label: 'La boussole' },
      personnage: { emoji: '🦁', label: 'Mufasa' }
    },
    avatar: { bg: '#EAF7F0', hair: '#3b2c2a' }
  },
  {
    slug: 'observateur',
    name: "L'Observateur",
    tagline: 'Rien ne t\u2019échappe. Tu captes les détails et tu en fais des idées qui comptent.',
    traits: ['Curiosité', 'Finesse', 'Indépendance', 'Créativité calme'],
    domaines: ['Recherche', 'Écriture & analyse', 'Qualité & expertise'],
    signature: { hands_mind: 'tete', solo_team: 'solo', creative_structured: 'creatif', field_office: 'bureau', risk_safety: 'securite' },
    portrait: {
      animal: { emoji: '🐈', label: 'Le chat' },
      couleur: { emoji: '🟣', label: 'Violet' },
      ville: { emoji: '⛩️', label: 'Kyoto' },
      objet: { emoji: '📓', label: 'Le carnet de notes' },
      personnage: { emoji: '🕵️', label: 'L (Death Note)' }
    },
    avatar: { bg: '#F3E8FF', hair: '#2f2f2f' }
  },
  {
    slug: 'createur',
    name: 'Le Créateur',
    tagline: 'Tu fabriques des choses que personne n\u2019avait imaginées : ton style, tes règles.',
    traits: ['Originalité', 'Sensibilité', 'Audace', 'Savoir-faire'],
    domaines: ['Arts & design', "Artisanat d'art", 'Mode & image'],
    signature: { hands_mind: 'mains', solo_team: 'solo', creative_structured: 'creatif', field_office: 'bureau', risk_safety: 'audace' },
    portrait: {
      animal: { emoji: '🦊', label: 'Le renard' },
      couleur: { emoji: '🌸', label: 'Rose' },
      ville: { emoji: '🌆', label: 'Séoul' },
      objet: { emoji: '🎨', label: 'La tablette graphique' },
      personnage: { emoji: '🕸️', label: 'Miles Morales' }
    },
    avatar: { bg: '#FDE7E9', hair: '#a55728' }
  },
  {
    slug: 'competiteur',
    name: 'Le Compétiteur',
    tagline: 'Tu vises haut et tu embarques ton équipe avec toi : le dépassement, c\u2019est ton moteur.',
    traits: ['Détermination', 'Leadership', 'Énergie', 'Goût du défi'],
    domaines: ['Sport & performance', 'Commerce terrain', 'Logistique & challenge'],
    signature: { hands_mind: 'mains', solo_team: 'equipe', creative_structured: 'structure', field_office: 'terrain', risk_safety: 'audace' },
    portrait: {
      animal: { emoji: '🐆', label: 'Le guépard' },
      couleur: { emoji: '🔴', label: 'Rouge' },
      ville: { emoji: '⚽', label: 'Barcelone' },
      objet: { emoji: '⏱️', label: 'Le chrono' },
      personnage: { emoji: '🥇', label: 'Kylian Mbappé' }
    },
    avatar: { bg: '#FFF7E6', hair: '#2f2f2f' }
  },
  {
    slug: 'mediateur',
    name: 'Le Médiateur',
    tagline: 'Tu poses les bonnes questions et tu sais trouver un terrain d’entente sans perdre de vue les règles du jeu.',
    traits: ['Écoute', 'Équité', 'Diplomatie', 'Rigueur'],
    domaines: ['Droit & médiation', 'Service public', 'Ressources humaines'],
    signature: { hands_mind: 'tete', solo_team: 'equipe', creative_structured: 'structure', field_office: 'bureau', risk_safety: 'securite' },
    portrait: {
      animal: { emoji: '🦢', label: 'Le cygne' },
      couleur: { emoji: '⚪', label: 'Blanc' },
      ville: { emoji: '🏛️', label: 'Strasbourg' },
      objet: { emoji: '⚖️', label: 'La balance' },
      personnage: { emoji: '🛡️', label: 'Athéna' }
    },
    avatar: { bg: '#EEF2FF', hair: '#4a3728' }
  },
  {
    slug: 'eclaireur',
    name: "L'Éclaireur",
    tagline: 'Tu avances avec méthode dans l’inconnu : tu observes, tu vérifies et tu trouves le passage.',
    traits: ['Esprit d’analyse', 'Autonomie', 'Courage', 'Précision'],
    domaines: ['Investigation & terrain', 'Environnement', 'Logistique'],
    signature: { hands_mind: 'tete', solo_team: 'solo', creative_structured: 'structure', field_office: 'terrain', risk_safety: 'audace' },
    portrait: {
      animal: { emoji: '🦅', label: "L'aigle" },
      couleur: { emoji: '🟤', label: 'Ocre' },
      ville: { emoji: '🏔️', label: 'Chamonix' },
      objet: { emoji: '🔦', label: 'La lampe torche' },
      personnage: { emoji: '🧭', label: 'Indiana Jones' }
    },
    avatar: { bg: '#FFF3E2', hair: '#5a3825' }
  },
  {
    slug: 'artisan-visionnaire',
    name: "L'Artisan Visionnaire",
    tagline: 'Tu imagines avec tes mains : tu préfères créer quelque chose de concret qui porte ta patte.',
    traits: ['Savoir-faire', 'Créativité', 'Indépendance', 'Audace'],
    domaines: ["Artisanat d'art", 'Cuisine & création', 'Paysage & design'],
    signature: { hands_mind: 'mains', solo_team: 'solo', creative_structured: 'creatif', field_office: 'terrain', risk_safety: 'audace' },
    portrait: {
      animal: { emoji: '🐝', label: "L'abeille" },
      couleur: { emoji: '🟡', label: 'Miel' },
      ville: { emoji: '🎭', label: 'Venise' },
      objet: { emoji: '🪡', label: 'Le fil' },
      personnage: { emoji: '🧑‍🍳', label: 'Colette (Ratatouille)' }
    },
    avatar: { bg: '#FFF8E1', hair: '#8d4f2a' }
  },
  {
    slug: 'coordinateur',
    name: 'Le Coordinateur',
    tagline: 'Tu fais circuler les idées et les moyens pour qu’un projet avance vraiment, du plan à la réalisation.',
    traits: ['Organisation', 'Énergie', 'Sens pratique', 'Leadership'],
    domaines: ['Organisation & logistique', 'Production', 'Événementiel'],
    signature: { hands_mind: 'mains', solo_team: 'equipe', creative_structured: 'structure', field_office: 'bureau', risk_safety: 'audace' },
    portrait: {
      animal: { emoji: '🐕', label: 'Le chien de berger' },
      couleur: { emoji: '🔴', label: 'Rouge brique' },
      ville: { emoji: '🚆', label: 'Lyon' },
      objet: { emoji: '📋', label: 'Le planning' },
      personnage: { emoji: '🚀', label: 'Buzz l’Éclair' }
    },
    avatar: { bg: '#FDE7E9', hair: '#3c302b' }
  }
]

export const PORTRAIT_LABELS = {
  animal: 'Un animal',
  couleur: 'Une couleur',
  ville: 'Une ville',
  objet: 'Un objet',
  personnage: 'Personnage de fiction'
}

export function getPersonaBySlug(slug) {
  return PERSONAS.find((persona) => persona.slug === slug) || null
}

function hashString(value) {
  let hash = 0
  const text = String(value || '')
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

function stableIndex(value, length) {
  if (!length) return 0
  let hash = 2166136261
  const text = String(value || '')
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  hash ^= hash >>> 16
  hash = Math.imul(hash, 0x85ebca6b)
  hash ^= hash >>> 13
  return (hash >>> 0) % length
}

// Tallies pole picks per axis from answered questions and returns the closest persona.
// `questions`: [{ id, category, options: [{label, value}] }], `answers`: { [questionId]: label }
export function computePersonaFromAnswers(questions, answers) {
  const tally = {}
  for (const question of Array.isArray(questions) ? questions : []) {
    const answerLabel = answers?.[question.id]
    if (!answerLabel || !question.category || !Array.isArray(question.options)) continue
    const picked = question.options.find((option) => option.label === answerLabel || option.value === answerLabel)
    if (!picked?.value) continue
    tally[question.category] = tally[question.category] || {}
    tally[question.category][picked.value] = (tally[question.category][picked.value] || 0) + 1
  }

  // Build the dominant-pole profile per axis. Four binary questions per axis can
  // legitimately tie, so use the detailed answer pattern rather than always
  // defaulting to the first pole.
  const profile = {}
  for (const axis of AXES) {
    const axisTally = tally[axis.id] || {}
    const [a, b] = axis.poles
    const aCount = axisTally[a] || 0
    const bCount = axisTally[b] || 0
    if (aCount > bCount) {
      profile[axis.id] = a
    } else if (bCount > aCount) {
      profile[axis.id] = b
    } else {
      const answerPattern = (Array.isArray(questions) ? questions : [])
        .filter((question) => question.category === axis.id)
        .map((question) => `${question.id}:${answers?.[question.id] || ''}`)
        .join('|')
      profile[axis.id] = axis.poles[stableIndex(`${axis.id}|${answerPattern}`, axis.poles.length)]
    }
  }

  let best = PERSONAS[0]
  let bestScore = -1
  let bestCandidates = []
  for (const persona of PERSONAS) {
    let score = 0
    for (const axis of AXES) {
      if (persona.signature[axis.id] === profile[axis.id]) score += 1
    }
    if (score > bestScore) {
      best = persona
      bestScore = score
      bestCandidates = [persona]
    } else if (score === bestScore) {
      bestCandidates.push(persona)
    }
  }

  if (bestCandidates.length > 1) {
    const answerPattern = (Array.isArray(questions) ? questions : [])
      .map((question) => `${question.id}:${answers?.[question.id] || ''}`)
      .join('|')
    best = bestCandidates[stableIndex(`${JSON.stringify(profile)}|${answerPattern}`, bestCandidates.length)]
  }

  // If we had no usable axis data at all (legacy Oui/Non questions), pick deterministically.
  const hasAxisData = Object.keys(tally).length > 0
  if (!hasAxisData) {
    const seed = hashString(JSON.stringify(answers || {}))
    best = PERSONAS[seed % PERSONAS.length]
  }

  return { persona: best, profile }
}

function hexNoHash(hex) {
  return (hex || '').replace('#', '')
}

export function buildLoreleiUrl(config, size = 360) {
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

// Deterministic avatar per persona; `seedExtra` (user id / name) makes it unique per user.
export function buildPersonaAvatarConfig(personaSlug, seedExtra = '') {
  const persona = getPersonaBySlug(personaSlug) || PERSONAS[0]
  const skinTones = ['#f9d7b8', '#f1c89e', '#d9a275', '#c68642', '#8d5524']
  const seedHash = hashString(`${persona.slug}|${seedExtra}`)
  return {
    seed: `${persona.slug}-${seedHash.toString(36)}`,
    bg: persona.avatar.bg,
    hair: persona.avatar.hair,
    skin: skinTones[seedHash % skinTones.length],
    glasses: seedHash % 3 === 0,
    radius: 30
  }
}
