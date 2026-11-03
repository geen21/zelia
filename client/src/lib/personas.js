// Persona system for the orientation flow.
// 5 axes, each measured by statements answered on a 4-level agreement scale
// (questions.category = axis id, options[].value = pole the statement describes),
// RIASEC interests (questions.category = 'interest', see questionScale.js) passed to the LLM only,
// + 12 curated personas with portrait-chinois attributes.

import { MAX_LEVEL, isInterestQuestion, parseAnswer } from './questionScale.js'

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

const AXIS_LEVEL_THRESHOLDS = [
  { min: 4 / 3 - 1e-9, level: 'nette' },
  { min: 2 / 3 - 1e-9, level: 'moderee' },
  { min: 1e-6, level: 'legere' }
]

function getAxisLevel(score) {
  const magnitude = Math.abs(score)
  return AXIS_LEVEL_THRESHOLDS.find((threshold) => magnitude >= threshold.min)?.level || 'equilibre'
}

// Scores answers on the 5 axes (-2..+2, first pole positive) and returns the closest persona
// (same answers always give the same persona). RIASEC interests (0..1) are computed separately
// for the LLM prompt and never change the persona.
// `questions`: [{ id, category, options }], `answers`: { [questionId]: stored answer }
export function computePersonaFromAnswers(questions, answers) {
  const questionList = Array.isArray(questions) ? questions : []
  const axisTotals = {}
  const interestTotals = {}

  for (const question of questionList) {
    const parsed = parseAnswer(question, answers?.[question.id])
    if (!parsed) continue
    if (isInterestQuestion(question)) {
      const entry = interestTotals[parsed.value] || { sum: 0, count: 0 }
      entry.sum += parsed.level / MAX_LEVEL
      entry.count += 1
      interestTotals[parsed.value] = entry
      continue
    }
    const axis = AXES.find((candidate) => candidate.id === question.category)
    if (!axis || !axis.poles.includes(parsed.value)) continue
    const entry = axisTotals[axis.id] || { sum: 0, count: 0 }
    entry.sum += parsed.value === axis.poles[0] ? parsed.signed : -parsed.signed
    entry.count += 1
    axisTotals[axis.id] = entry
  }

  const axisScores = {}
  for (const axis of AXES) {
    const entry = axisTotals[axis.id]
    axisScores[axis.id] = entry?.count ? entry.sum / entry.count : 0
  }

  const interests = {}
  for (const [code, entry] of Object.entries(interestTotals)) {
    interests[code] = entry.count ? entry.sum / entry.count : 0
  }
  // Organisation (C) is not asked directly: it comes from the structured pole.
  if (axisTotals.creative_structured?.count) {
    interests.C = Math.max(0, -axisScores.creative_structured) / 2
  }

  // The persona depends on the 5 axes only; interests are passed to the LLM, not used here.
  const scorePersona = (persona) => {
    let total = 0
    for (const axis of AXES) {
      const score = axisScores[axis.id]
      if (!score) continue
      const pole = score > 0 ? axis.poles[0] : axis.poles[1]
      total += persona.signature[axis.id] === pole ? Math.abs(score) : -Math.abs(score)
    }
    return total
  }

  const ranked = PERSONAS
    .map((persona, order) => ({ persona, order, total: scorePersona(persona) }))
    .sort((a, b) => (b.total - a.total) || (a.order - b.order))
  const bestScore = ranked[0].total
  const tied = ranked.filter((entry) => Math.abs(entry.total - bestScore) < 1e-9)
  // Personas that are exactly as close to the profile: break the tie from the axis profile
  // itself (not the raw answers), so identical profiles always share the same persona.
  const profileKey = AXES.map((axis) => `${axis.id}:${axisScores[axis.id].toFixed(3)}`).join('|')
  let best = tied.length > 1
    ? tied[stableIndex(profileKey, tied.length)].persona
    : ranked[0].persona

  const hasAxisData = Object.keys(axisTotals).length > 0
  if (!hasAxisData) {
    const seed = hashString(JSON.stringify(answers || {}))
    best = PERSONAS[seed % PERSONAS.length]
  }

  const profile = {}
  const axisStrength = {}
  for (const axis of AXES) {
    const score = axisScores[axis.id]
    profile[axis.id] = score > 0 ? axis.poles[0] : score < 0 ? axis.poles[1] : best.signature[axis.id]
    axisStrength[axis.id] = getAxisLevel(score)
  }

  const topInterests = Object.entries(interests)
    .filter(([, value]) => value >= 0.5)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([code]) => code)

  return { persona: best, profile, axisScores, axisStrength, interests, topInterests }
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
